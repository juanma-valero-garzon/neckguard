// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { DeviationId, PostureLevel } from '../core/types';
import { DEVIATION_IDS, levelRank } from '../core/types';
import type { ZoneReading, ZoneReadings } from './classifier';

export interface StateMachineConfig {
  mildAfterAmberMs: number;
  badAfterRedMs: number;
  badAfterAmberMs: number;
  criticalAfterRedMs: number;
  exitGreenMs: number;
  maxGapMs: number;
}

export interface DevState {
  level: PostureLevel;
  amberSince: number | null;
  redSince: number | null;
  greenSince: number | null;
}

export interface MachineState {
  lastT: number | null;
  devs: Record<DeviationId, DevState>;
}

export interface MachineInput {
  t: number;
  readings: ZoneReadings;
  /** false = sin datos fiables (poca luz, ausencia…): se congelan los cronómetros sostenidos. */
  active: boolean;
}

export interface MachineOutput {
  state: MachineState;
  level: PostureLevel;
  /** Desviación de mayor prioridad entre las que están en el nivel global; null si OK. */
  reason: DeviationId | null;
  levels: Record<DeviationId, PostureLevel>;
}

const freshDev = (): DevState => ({ level: 'OK', amberSince: null, redSince: null, greenSince: null });

export function initialMachineState(): MachineState {
  return {
    lastT: null,
    devs: Object.fromEntries(DEVIATION_IDS.map((id) => [id, freshDev()])) as Record<DeviationId, DevState>,
  };
}

function candidateLevel(d: DevState, t: number, cfg: StateMachineConfig): PostureLevel {
  const amberFor = d.amberSince === null ? 0 : t - d.amberSince;
  const redFor = d.redSince === null ? 0 : t - d.redSince;
  if (d.redSince !== null && redFor >= cfg.criticalAfterRedMs) return 'CRITICA';
  if (
    (d.redSince !== null && redFor >= cfg.badAfterRedMs) ||
    (d.amberSince !== null && amberFor >= cfg.badAfterAmberMs)
  ) {
    return 'MALA_POSTURA';
  }
  if (d.amberSince !== null && amberFor >= cfg.mildAfterAmberMs) return 'AVISO_LEVE';
  return 'OK';
}

function stepDev(
  d: DevState,
  r: ZoneReading | null | undefined,
  t: number,
  freeze: boolean,
  cfg: StateMachineConfig,
): DevState {
  if (freeze || !r) return { level: d.level, amberSince: null, redSince: null, greenSince: null };
  let { amberSince, redSince, greenSince } = d;
  if (r.zone === 'green') {
    amberSince = null;
    redSince = null;
  } else {
    amberSince ??= t;
    redSince = r.zone === 'red' ? (redSince ?? t) : null;
  }
  greenSince = r.exitGreen ? (greenSince ?? t) : null;

  let level = d.level;
  const next = { level, amberSince, redSince, greenSince };
  if (level !== 'OK' && greenSince !== null && t - greenSince >= cfg.exitGreenMs) {
    level = 'OK';
  } else {
    const cand = candidateLevel(next, t, cfg);
    if (levelRank(cand) > levelRank(level)) level = cand;
  }
  return { level, amberSince, redSince, greenSince };
}

function summarize(state: MachineState): MachineOutput {
  const levels = {} as Record<DeviationId, PostureLevel>;
  let top: PostureLevel = 'OK';
  for (const id of DEVIATION_IDS) {
    levels[id] = state.devs[id].level;
    if (levelRank(levels[id]) > levelRank(top)) top = levels[id];
  }
  const reason = top === 'OK' ? null : (DEVIATION_IDS.find((id) => levels[id] === top) ?? null);
  return { state, level: top, reason, levels };
}

/** Función pura: (estado, entrada) → nuevo estado. No muta sus argumentos. */
export function stepMachine(
  state: MachineState,
  input: MachineInput,
  cfg: StateMachineConfig,
): MachineOutput {
  const { t } = input;
  if (!Number.isFinite(t) || (state.lastT !== null && t < state.lastT)) return summarize(state);
  const gap = state.lastT !== null && t - state.lastT > cfg.maxGapMs;
  const freeze = !input.active || gap;
  const devs = {} as Record<DeviationId, DevState>;
  for (const id of DEVIATION_IDS) devs[id] = stepDev(state.devs[id], input.readings[id], t, freeze, cfg);
  return summarize({ lastT: t, devs });
}
