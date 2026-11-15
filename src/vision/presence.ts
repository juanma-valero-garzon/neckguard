// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { Landmark, PresenceStatus } from '../core/types';
import type { Baseline } from '../posture/deviations';
import type { RawMetrics } from '../posture/metrics';
import { LM, isUsable } from './landmarks';

export interface PresenceConfig {
  absentAfterMs: number;
  presentAfterMs: number;
  /** Luminancia media (0-255) por debajo de la cual se considera poca luz. */
  lowLuma: number;
  /** Diferencia (periferia − centro) a partir de la cual se considera contraluz. */
  backlitDelta: number;
  minMeanVisibility: number;
  /** Elevación de hombros (en anchos de hombro base) a partir de la cual se considera "de pie". */
  standingLiftRatio: number;
}

export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  absentAfterMs: 3000,
  presentAfterMs: 1000,
  lowLuma: 35,
  backlitDelta: 70,
  minMeanVisibility: 0.5,
  standingLiftRatio: 0.6,
};

export interface PresenceState {
  status: PresenceStatus;
  candidate: 'present' | 'absent' | null;
  since: number;
}

export interface PresenceInput {
  t: number;
  cameraOk: boolean;
  hasPerson: boolean;
}

export const initialPresence = (): PresenceState => ({ status: 'nodata', candidate: null, since: 0 });

/** Estado de presencia con debounce. Sin cámara ⇒ 'nodata' inmediato (no cuenta como ausencia). */
export function stepPresence(
  s: PresenceState,
  input: PresenceInput,
  cfg: PresenceConfig = DEFAULT_PRESENCE_CONFIG,
): PresenceState {
  if (!input.cameraOk) return { status: 'nodata', candidate: null, since: input.t };
  const want: 'present' | 'absent' = input.hasPerson ? 'present' : 'absent';
  if (s.status === want) return { ...s, candidate: null };
  const since = s.candidate === want ? s.since : input.t;
  const needed = want === 'present' ? cfg.presentAfterMs : cfg.absentAfterMs;
  if (input.t - since >= needed) return { status: want, candidate: null, since: input.t };
  return { status: s.status, candidate: want, since };
}

export type LightingState = 'ok' | 'lowLight' | 'backlit' | 'lowConfidence';

export function assessLighting(
  input: { meanLuma: number; centerLuma: number; edgeLuma: number; meanVisibility: number },
  cfg: PresenceConfig = DEFAULT_PRESENCE_CONFIG,
): LightingState {
  if (input.meanLuma < cfg.lowLuma) return 'lowLight';
  if (input.edgeLuma - input.centerLuma > cfg.backlitDelta) return 'backlit';
  if (input.meanVisibility < cfg.minMeanVisibility) return 'lowConfidence';
  return 'ok';
}

const span = (lms: readonly Landmark[], a: number, b: number, aspect: number): number | null => {
  const p = lms[a];
  const q = lms[b];
  if (!isUsable(p, 0.3) || !isUsable(q, 0.3)) return null;
  return Math.hypot((p.x - q.x) * aspect, p.y - q.y);
};

/** Tamaño y centro de una pose (para elegir a la persona principal y detectar cambios bruscos). */
export function poseSignature(
  lms: readonly Landmark[],
  aspect: number,
): { cx: number; scale: number } | null {
  // Frontal: ancho de hombros; respaldo: orejas; en perfil: distancia oreja-hombro del lado visible.
  const side = Math.max(
    span(lms, LM.L_EAR, LM.L_SHOULDER, aspect) ?? 0,
    span(lms, LM.R_EAR, LM.R_SHOULDER, aspect) ?? 0,
  );
  const shoulders = span(lms, LM.L_SHOULDER, LM.R_SHOULDER, aspect) ?? 0;
  const ears = (span(lms, LM.L_EAR, LM.R_EAR, aspect) ?? 0) * 3;
  const s = shoulders || ears || side * 1.6;
  if (!(s > 0)) return null;
  const xs = [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_EAR, LM.R_EAR]
    .map((i) => lms[i])
    .filter((l): l is Landmark => isUsable(l, 0.3))
    .map((l) => l.x);
  if (!xs.length) return null;
  return { cx: xs.reduce((a, b) => a + b, 0) / xs.length, scale: s };
}

/** Índice de la persona principal: la más grande y centrada. -1 si no hay ninguna. */
export function selectPrimaryPerson(poses: readonly (readonly Landmark[])[], aspect: number): number {
  let best = -1;
  let bestScore = 0;
  poses.forEach((p, i) => {
    const sig = poseSignature(p, aspect);
    if (!sig) return;
    const score = sig.scale * (1 - Math.min(Math.abs(sig.cx - 0.5), 0.5));
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export interface PrimaryTrackerState {
  last: { cx: number; scale: number; t: number } | null;
}

/** ¿Cambio brusco de persona principal (posición o tamaño) respecto al último fotograma? */
export function trackPrimary(
  s: PrimaryTrackerState,
  sig: { cx: number; scale: number } | null,
  t: number,
  opts = { maxGapMs: 1000, maxShift: 0.3, maxScaleRatio: 1.6 },
): { state: PrimaryTrackerState; jump: boolean } {
  if (!sig) return { state: s, jump: false };
  const prev = s.last;
  let jump = false;
  if (prev && t - prev.t <= opts.maxGapMs) {
    const ratio = sig.scale / prev.scale;
    jump =
      Math.abs(sig.cx - prev.cx) > opts.maxShift ||
      ratio > opts.maxScaleRatio ||
      ratio < 1 / opts.maxScaleRatio;
  }
  return { state: { last: { ...sig, t } }, jump };
}

/** Persona de pie (mesa elevable): hombros muy por encima de la base. Solo modo frontal con base. */
export function isStanding(
  raw: RawMetrics,
  baseline: Baseline,
  cfg: PresenceConfig = DEFAULT_PRESENCE_CONFIG,
): boolean {
  const bY = baseline.shoulderMidY?.median;
  const bS = baseline.shoulderScale?.median;
  if (raw.mode !== 'frontal' || raw.shoulderMidY === null || bY === undefined || !bS) return false;
  return (bY - raw.shoulderMidY) / bS > cfg.standingLiftRatio;
}
