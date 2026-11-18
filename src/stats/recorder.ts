// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { CaptureMode, DeviationId, PostureLevel, PresenceStatus } from '../core/types';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import type { ActivityState, AwayEpisode, AwayKind, HourBucket, SessionSummary, SittingBlock } from './model';
import { emptyTotals } from './model';
import { dayKeyOf, hourOf } from './time';

const AWAY_STATES: readonly ActivityState[] = ['absent', 'standing', 'locked'];
const PRESENT_STATES: readonly ActivityState[] = ['seated', 'light', 'notCalibrated'];
/** Un bloque sentado más corto que esto no merece registrarse. */
const MIN_BLOCK_MS = 60_000;
const DEFAULT_BLOCK_BREAK_MS = 3 * 60_000;

export interface ActivityInput {
  locked: boolean;
  paused: boolean;
  presence: PresenceStatus;
  calibrated: boolean;
  lightingOk: boolean;
  standing: boolean;
  /** Hueco entre pasos mayor que el máximo: se asume suspensión del equipo. */
  gap: boolean;
}

/** Misma precedencia que los motivos de supresión del motor, pero conservando la causa. */
export function activityOf(i: ActivityInput): ActivityState {
  if (i.locked || i.gap) return 'locked';
  if (i.paused) return 'paused';
  if (i.presence === 'nodata') return 'nodata';
  if (i.presence === 'absent') return 'absent';
  if (!i.calibrated) return 'notCalibrated';
  if (!i.lightingOk) return 'light';
  if (i.standing) return 'standing';
  return 'seated';
}

export interface RecorderSink {
  /** Sesión cerrada al cambiar de día local (el resto las entrega `flush`). */
  session?(s: SessionSummary): void;
  away?(e: AwayEpisode): void;
  block?(b: SittingBlock): void;
}

export interface RecorderOptions {
  utcOffsetMin?: () => number;
  sink?: RecorderSink;
  minAwayMs?: number;
  /** Ausencia continua que corta un bloque sentado. */
  blockBreakMs?: () => number;
}

interface AwayRun {
  t: number;
  total: number;
  byKind: Record<AwayKind, number>;
}

interface BlockRun {
  t: number;
  durMs: number;
  gapMs: number;
}

/** Acumulador en vivo: convierte (dt, estado) en un SessionSummary por intervalo, y detecta ausencias y bloques sentados. */
export class SessionRecorder {
  private cur: SessionSummary;
  private curDay: string;
  private awayRun: AwayRun | null = null;
  private blockRun: BlockRun | null = null;
  private readonly offset: () => number;
  private readonly sink: RecorderSink;
  private readonly minAwayMs: number;
  private readonly blockBreakMs: () => number;

  constructor(
    private readonly idGen: () => string,
    private readonly mode: () => CaptureMode,
    startedAt: number,
    opts: RecorderOptions = {},
  ) {
    this.offset = opts.utcOffsetMin ?? ((): number => 0);
    this.sink = opts.sink ?? {};
    this.minAwayMs = opts.minAwayMs ?? CLINICAL_CONFIG.statistics.minAwayMs.value;
    this.blockBreakMs = opts.blockBreakMs ?? ((): number => DEFAULT_BLOCK_BREAK_MS);
    this.cur = this.fresh(startedAt);
    this.curDay = dayKeyOf(startedAt, this.cur.utcOffsetMin ?? 0);
  }

  private fresh(t: number): SessionSummary {
    return {
      ...emptyTotals(),
      id: this.idGen(),
      startedAt: t,
      endedAt: t,
      mode: this.mode(),
      utcOffsetMin: this.offset(),
      hours: [],
      deviationMs: {},
      deviationActiveMs: {},
    };
  }

  private hourBucket(h: number): HourBucket {
    let b = this.cur.hours.find((x) => x.hour === h);
    if (!b) {
      b = { hour: h, okMs: 0, mildMs: 0, badMs: 0, criticalMs: 0, awayMs: 0 };
      this.cur.hours.push(b);
    }
    return b;
  }

  /**
   * `active`: desviaciones en zona ámbar o roja en este instante (solo cuentan sentado y analizado).
   * `reason`: desviación principal del nivel.
   */
  add(
    wallNow: number,
    dtMs: number,
    state: ActivityState,
    level: PostureLevel,
    reason: DeviationId | null,
    active: readonly DeviationId[] = [],
  ): void {
    if (!(dtMs > 0)) return;
    const off = this.offset();
    if (dayKeyOf(wallNow, off) !== this.curDay && this.total(this.cur) > 0) {
      this.sink.session?.(this.cur);
      this.cur = this.fresh(wallNow);
    }
    this.curDay = dayKeyOf(wallNow, off);
    const c = this.cur;
    c.endedAt = wallNow;
    const hour = this.hourBucket(hourOf(wallNow, off));
    switch (state) {
      case 'seated':
        if (level === 'OK') {
          c.okMs += dtMs;
          hour.okMs += dtMs;
        } else {
          if (level === 'AVISO_LEVE') {
            c.mildMs += dtMs;
            hour.mildMs += dtMs;
          } else if (level === 'MALA_POSTURA') {
            c.badMs += dtMs;
            hour.badMs += dtMs;
          } else {
            c.criticalMs += dtMs;
            hour.criticalMs += dtMs;
          }
          if (reason) {
            c.deviationMs[reason] = (c.deviationMs[reason] ?? 0) + dtMs;
            const hd = (hour.deviationMs ??= {});
            hd[reason] = (hd[reason] ?? 0) + dtMs;
          }
        }
        for (const id of active) c.deviationActiveMs[id] = (c.deviationActiveMs[id] ?? 0) + dtMs;
        break;
      case 'absent':
        c.absentMs += dtMs;
        hour.awayMs += dtMs;
        break;
      case 'standing':
        c.standingMs += dtMs;
        hour.awayMs += dtMs;
        break;
      case 'locked':
        c.lockedMs += dtMs;
        hour.awayMs += dtMs;
        break;
      case 'paused':
        c.pausedMs += dtMs;
        break;
      case 'nodata':
        c.noDataMs += dtMs;
        break;
      case 'light':
        c.lightMs += dtMs;
        break;
      case 'notCalibrated':
        c.notCalibratedMs += dtMs;
        break;
    }
    this.trackAway(wallNow, dtMs, state);
    this.trackBlock(wallNow, dtMs, state);
  }

  /** Parpadeo: tiempo válido medido, parpadeos contados y tiempo con frecuencia baja. */
  addBlink(validMs: number, blinks: number, lowMs: number): void {
    this.cur.blinkMs += validMs;
    this.cur.blinkCount += blinks;
    this.cur.lowBlinkMs += lowMs;
  }

  private trackAway(wallNow: number, dtMs: number, state: ActivityState): void {
    if (AWAY_STATES.includes(state)) {
      const run = (this.awayRun ??= {
        t: wallNow - dtMs,
        total: 0,
        byKind: { absent: 0, standing: 0, locked: 0 },
      });
      run.total += dtMs;
      run.byKind[state as AwayKind] += dtMs;
    } else this.closeAway();
  }

  private closeAway(): void {
    const run = this.awayRun;
    this.awayRun = null;
    if (!run || run.total < this.minAwayMs) return;
    const kinds = Object.entries(run.byKind) as [AwayKind, number][];
    const kind = kinds.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    this.sink.away?.({ t: run.t, durMs: run.total, kind });
  }

  private trackBlock(wallNow: number, dtMs: number, state: ActivityState): void {
    if (PRESENT_STATES.includes(state)) {
      const b = (this.blockRun ??= { t: wallNow - dtMs, durMs: 0, gapMs: 0 });
      b.durMs += dtMs;
      b.gapMs = 0;
      return;
    }
    const b = this.blockRun;
    if (!b) return;
    b.gapMs += dtMs;
    if (b.gapMs >= this.blockBreakMs()) this.closeBlock();
  }

  private closeBlock(): void {
    const b = this.blockRun;
    this.blockRun = null;
    if (b && b.durMs >= MIN_BLOCK_MS) this.sink.block?.({ t: b.t, durMs: b.durMs });
  }

  /** Cierra los episodios y bloques abiertos (al salir de la aplicación). */
  closeOpen(): void {
    this.closeAway();
    this.closeBlock();
  }

  private total(c: SessionSummary): number {
    return (
      c.okMs +
      c.mildMs +
      c.badMs +
      c.criticalMs +
      c.suppressedMs +
      c.absentMs +
      c.standingMs +
      c.lockedMs +
      c.pausedMs +
      c.noDataMs +
      c.lightMs +
      c.notCalibratedMs
    );
  }

  /** Cierra el intervalo actual y empieza otro. Devuelve null si está vacío. */
  flush(wallNow: number): SessionSummary | null {
    const c = this.cur;
    this.cur = this.fresh(wallNow);
    this.curDay = dayKeyOf(wallNow, this.offset());
    return this.total(c) > 0 ? c : null;
  }
}
