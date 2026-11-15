// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { DeviationId } from '../core/types';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import type {
  AlertEvent,
  AwayEpisode,
  BreakRecord,
  DailyRecord,
  HourBucket,
  SessionSummary,
  SittingBlock,
  Store,
  TimeTotals,
} from './model';
import { DETAIL_DAYS, MAX_DAILY, MAX_EVENTS, MAX_SESSIONS, emptyTotals } from './model';
import { addDays, dayKeyOf } from './time';

const TOTAL_KEYS = Object.keys(emptyTotals()) as (keyof TimeTotals)[];

export const defaultOffset = (): number => -new Date().getTimezoneOffset();

export const emptyDaily = (dayKey: string): DailyRecord => ({
  ...emptyTotals(),
  dayKey,
  hours: [],
  deviationMs: {},
  deviationActiveMs: {},
  alerts: 0,
  alertsCritical: 0,
  alertsIgnored: 0,
  alertsRecovered: 0,
  alertRecoveredMs: 0,
  alertsByReason: {},
  breaksCompleted: 0,
  breaksDeclared: 0,
  breaksSkipped: 0,
  breaksByAbsence: 0,
  awayCount: 0,
  longestAwayMs: 0,
  blocksCount: 0,
  blocksMs: 0,
  longestBlockMs: 0,
  blocksLong: 0,
});

type DevMap = Partial<Record<DeviationId, number>>;

function addMap(dst: DevMap, src: DevMap): void {
  for (const [k, v] of Object.entries(src) as [DeviationId, number][]) dst[k] = (dst[k] ?? 0) + (v ?? 0);
}

function addHours(dst: HourBucket[], src: readonly HourBucket[]): void {
  for (const h of src) {
    let b = dst.find((x) => x.hour === h.hour);
    if (!b) {
      b = { hour: h.hour, okMs: 0, mildMs: 0, badMs: 0, criticalMs: 0, awayMs: 0 };
      dst.push(b);
    }
    b.okMs += h.okMs;
    b.mildMs += h.mildMs;
    b.badMs += h.badMs;
    b.criticalMs += h.criticalMs;
    b.awayMs += h.awayMs;
  }
  dst.sort((a, b) => a.hour - b.hour);
}

function addTotals(dst: TimeTotals, src: TimeTotals): void {
  for (const k of TOTAL_KEYS) dst[k] += src[k] ?? 0;
}

export function addSession(d: DailyRecord, s: SessionSummary): void {
  addTotals(d, s);
  addHours(d.hours, s.hours);
  addMap(d.deviationMs, s.deviationMs);
  addMap(d.deviationActiveMs, s.deviationActiveMs);
}

export function addAlert(d: DailyRecord, a: AlertEvent): void {
  d.alerts += 1;
  if (a.level === 'CRITICA') d.alertsCritical += 1;
  if (a.ignored) d.alertsIgnored += 1;
  if (typeof a.recoveredMs === 'number') {
    d.alertsRecovered += 1;
    d.alertRecoveredMs += a.recoveredMs;
  }
  if (a.reason) d.alertsByReason[a.reason] = (d.alertsByReason[a.reason] ?? 0) + 1;
}

export function addBreak(d: DailyRecord, b: BreakRecord): void {
  if (b.outcome === 'completed' || b.outcome === 'absence') d.breaksCompleted += 1;
  else if (b.outcome === 'declared') d.breaksDeclared += 1;
  else d.breaksSkipped += 1;
  if (b.outcome === 'absence') d.breaksByAbsence += 1;
}

export function addAway(d: DailyRecord, a: AwayEpisode): void {
  d.awayCount += 1;
  d.longestAwayMs = Math.max(d.longestAwayMs, a.durMs);
}

export function addBlock(d: DailyRecord, b: SittingBlock): void {
  d.blocksCount += 1;
  d.blocksMs += b.durMs;
  d.longestBlockMs = Math.max(d.longestBlockMs, b.durMs);
  if (b.durMs >= CLINICAL_CONFIG.statistics.longSittingMs.value) d.blocksLong += 1;
}

export function addDaily(d: DailyRecord, o: DailyRecord): void {
  addTotals(d, o);
  addHours(d.hours, o.hours);
  addMap(d.deviationMs, o.deviationMs);
  addMap(d.deviationActiveMs, o.deviationActiveMs);
  addMap(d.alertsByReason, o.alertsByReason);
  d.alerts += o.alerts;
  d.alertsCritical += o.alertsCritical;
  d.alertsIgnored += o.alertsIgnored;
  d.alertsRecovered += o.alertsRecovered;
  d.alertRecoveredMs += o.alertRecoveredMs;
  d.breaksCompleted += o.breaksCompleted;
  d.breaksDeclared += o.breaksDeclared;
  d.breaksSkipped += o.breaksSkipped;
  d.breaksByAbsence += o.breaksByAbsence;
  d.awayCount += o.awayCount;
  d.longestAwayMs = Math.max(d.longestAwayMs, o.longestAwayMs);
  d.blocksCount += o.blocksCount;
  d.blocksMs += o.blocksMs;
  d.longestBlockMs = Math.max(d.longestBlockMs, o.longestBlockMs);
  d.blocksLong += o.blocksLong;
}

type Items = Pick<Store, 'sessions' | 'alerts' | 'breaks' | 'away' | 'blocks'>;

/** Agrupa los datos detallados por día local; las sesiones usan su propio desfase si lo tienen. */
function buildDaily(items: Items, offset: number, into: Map<string, DailyRecord>): void {
  const get = (k: string): DailyRecord => {
    let d = into.get(k);
    if (!d) into.set(k, (d = emptyDaily(k)));
    return d;
  };
  for (const s of items.sessions) addSession(get(dayKeyOf(s.startedAt, s.utcOffsetMin ?? offset)), s);
  for (const a of items.alerts) addAlert(get(dayKeyOf(a.t, offset)), a);
  for (const b of items.breaks) addBreak(get(dayKeyOf(b.t, offset)), b);
  for (const a of items.away) addAway(get(dayKeyOf(a.t, offset)), a);
  for (const b of items.blocks) addBlock(get(dayKeyOf(b.t, offset)), b);
}

/** Todos los días con datos: los resúmenes permanentes más los datos detallados recientes. */
export function allDaily(store: Store, offset: number = defaultOffset()): DailyRecord[] {
  const map = new Map<string, DailyRecord>();
  for (const d of store.daily) {
    const cur = map.get(d.dayKey) ?? emptyDaily(d.dayKey);
    addDaily(cur, d);
    map.set(d.dayKey, cur);
  }
  buildDaily(store, offset, map);
  return [...map.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

const lastTime = (store: Store): number | null => {
  let t = -Infinity;
  for (const s of store.sessions) t = Math.max(t, s.endedAt);
  for (const a of store.alerts) t = Math.max(t, a.t);
  for (const b of store.breaks) t = Math.max(t, b.t);
  for (const a of store.away) t = Math.max(t, a.t);
  for (const b of store.blocks) t = Math.max(t, b.t);
  return Number.isFinite(t) ? t : null;
};

/**
 * Pasa a resúmenes diarios lo anterior a `DETAIL_DAYS` días antes del último dato registrado.
 * La referencia es el propio dato (no el reloj) para que el resultado sea determinista.
 */
export function compactStore(store: Store, offset: number = defaultOffset()): Store {
  const ref = lastTime(store);
  if (ref === null) return store;
  const cutoff = addDays(dayKeyOf(ref, offset), -DETAIL_DAYS);
  const old = (t: number, off = offset): boolean => dayKeyOf(t, off) < cutoff;
  const sessions = store.sessions.filter((s) => !old(s.startedAt, s.utcOffsetMin ?? offset));
  const alerts = store.alerts.filter((a) => !old(a.t));
  const breaks = store.breaks.filter((b) => !old(b.t));
  const away = store.away.filter((a) => !old(a.t));
  const blocks = store.blocks.filter((b) => !old(b.t));
  if (
    sessions.length === store.sessions.length &&
    alerts.length === store.alerts.length &&
    breaks.length === store.breaks.length &&
    away.length === store.away.length &&
    blocks.length === store.blocks.length
  ) {
    return store;
  }
  const map = new Map<string, DailyRecord>(store.daily.map((d) => [d.dayKey, structuredClone(d)]));
  buildDaily(
    {
      sessions: store.sessions.filter((s) => old(s.startedAt, s.utcOffsetMin ?? offset)),
      alerts: store.alerts.filter((a) => old(a.t)),
      breaks: store.breaks.filter((b) => old(b.t)),
      away: store.away.filter((a) => old(a.t)),
      blocks: store.blocks.filter((b) => old(b.t)),
    },
    offset,
    map,
  );
  const daily = [...map.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  return { ...store, sessions, alerts, breaks, away, blocks, daily };
}

/** Compacta lo antiguo en resúmenes diarios y acota el histórico detallado. */
export function pruneStore(store: Store): Store {
  const c = compactStore(store);
  return {
    ...c,
    sessions: c.sessions.slice(-MAX_SESSIONS),
    alerts: c.alerts.slice(-MAX_EVENTS),
    breaks: c.breaks.slice(-MAX_EVENTS),
    away: c.away.slice(-MAX_EVENTS),
    blocks: c.blocks.slice(-MAX_EVENTS),
    daily: c.daily.slice(-MAX_DAILY),
  };
}
