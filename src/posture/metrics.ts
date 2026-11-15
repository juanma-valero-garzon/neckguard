// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { CaptureMode, Landmark, Side } from '../core/types';
import { LM, isUsable } from '../vision/landmarks';

export interface MetricsConfig {
  minVisibility: number;
  /** C7 se estima desplazando el hombro hacia atrás (fracción de la distancia oreja-hombro). Heurística. */
  c7OffsetRatio: number;
  c7RiseRatio: number;
  /** Separación horizontal mínima nariz-oreja (altura de imagen) para saber hacia dónde mira. */
  minFacingDelta: number;
}

export const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  minVisibility: 0.5,
  c7OffsetRatio: 0.2,
  c7RiseRatio: 0,
  minFacingDelta: 0.004,
};

export interface PoseInput {
  landmarks: readonly (Landmark | null)[];
  /** ancho/alto de la imagen, para que x e y tengan la misma unidad. */
  aspect: number;
  mode: CaptureMode;
  /** Lado preferido en modo lateral (si es visible). */
  preferredSide?: Side | null;
  /** Ángulos de Face Landmarker (opcional, modo frontal). */
  facePitchDeg?: number | null;
  faceYawDeg?: number | null;
}

/** Medidas absolutas (la línea base y las desviaciones se derivan de ellas). null = no medible. */
export interface RawMetrics {
  mode: CaptureMode;
  side: Side | null;
  faceScale: number | null;
  shoulderScale: number | null;
  shoulderMidY: number | null;
  headY: number | null;
  eyeTiltDeg: number | null;
  shoulderTiltDeg: number | null;
  yawProxy: number | null;
  noseDrop: number | null;
  pitchDeg: number | null;
  yawDeg: number | null;
  cvaDeg: number | null;
  headPitchDeg: number | null;
  trunkLeanDeg: number | null;
  /** Modo ladeado: geometría del lado más visible (altura de oreja y hombro y distancia oreja-hombro). */
  sideLen: number | null;
  sideShoulderY: number | null;
  sideEarY: number | null;
}

export type NumericMetricKey = {
  [K in keyof RawMetrics]: RawMetrics[K] extends number | null ? K : never;
}[keyof RawMetrics];

export const NUMERIC_KEYS: readonly NumericMetricKey[] = [
  'faceScale',
  'shoulderScale',
  'shoulderMidY',
  'headY',
  'eyeTiltDeg',
  'shoulderTiltDeg',
  'yawProxy',
  'noseDrop',
  'pitchDeg',
  'yawDeg',
  'cvaDeg',
  'headPitchDeg',
  'trunkLeanDeg',
  'sideLen',
  'sideShoulderY',
  'sideEarY',
];

const deg = (rad: number): number => (rad * 180) / Math.PI;

interface P {
  x: number;
  y: number;
}

const toP = (lm: Landmark, aspect: number): P => ({ x: lm.x * aspect, y: lm.y });
const dist = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Ángulo (°) de la línea que une dos puntos, ordenados de izquierda a derecha de la imagen. 0 = horizontal. */
function lineTiltDeg(a: P, b: P): number {
  const [l, r] = a.x <= b.x ? [a, b] : [b, a];
  return deg(Math.atan2(r.y - l.y, r.x - l.x));
}

export function emptyMetrics(mode: CaptureMode): RawMetrics {
  return {
    mode,
    side: null,
    faceScale: null,
    shoulderScale: null,
    shoulderMidY: null,
    headY: null,
    eyeTiltDeg: null,
    shoulderTiltDeg: null,
    yawProxy: null,
    noseDrop: null,
    pitchDeg: null,
    yawDeg: null,
    cvaDeg: null,
    headPitchDeg: null,
    trunkLeanDeg: null,
    sideLen: null,
    sideShoulderY: null,
    sideEarY: null,
  };
}

const finiteOrNull = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Elige el lado visible (el de mayor visibilidad conjunta de oreja+hombro). */
export function selectVisibleSide(
  landmarks: readonly (Landmark | null)[],
  minVisibility: number,
  preferred?: Side | null,
): Side | null {
  const score = (ear: number, sh: number): number | null => {
    const e = landmarks[ear];
    const s = landmarks[sh];
    if (!isUsable(e, minVisibility) || !isUsable(s, minVisibility)) return null;
    return (e.visibility ?? 1) + (s.visibility ?? 1);
  };
  const left = score(LM.L_EAR, LM.L_SHOULDER);
  const right = score(LM.R_EAR, LM.R_SHOULDER);
  if (preferred === 'left' && left !== null) return 'left';
  if (preferred === 'right' && right !== null) return 'right';
  if (left === null && right === null) return null;
  if (left === null) return 'right';
  if (right === null) return 'left';
  return left >= right ? 'left' : 'right';
}

export function computeFrontal(input: PoseInput, cfg: MetricsConfig): RawMetrics {
  const m = emptyMetrics('frontal');
  const get = (i: number): P | null => {
    const lm = input.landmarks[i];
    return isUsable(lm, cfg.minVisibility) ? toP(lm, input.aspect) : null;
  };
  const nose = get(LM.NOSE);
  const le = get(LM.L_EYE);
  const re = get(LM.R_EYE);
  const ls = get(LM.L_SHOULDER);
  const rs = get(LM.R_SHOULDER);

  if (le && re) {
    m.faceScale = dist(le, re);
    m.headY = (le.y + re.y) / 2;
    m.eyeTiltDeg = lineTiltDeg(le, re);
    if (nose && m.faceScale > 1e-6) {
      m.noseDrop = (nose.y - m.headY) / m.faceScale;
      m.yawProxy = (nose.x - (le.x + re.x) / 2) / m.faceScale;
    }
  }
  if (ls && rs) {
    m.shoulderScale = dist(ls, rs);
    m.shoulderMidY = (ls.y + rs.y) / 2;
    m.shoulderTiltDeg = lineTiltDeg(ls, rs);
  }
  m.pitchDeg = finiteOrNull(input.facePitchDeg);
  m.yawDeg = finiteOrNull(input.faceYawDeg);
  return m;
}

export function computeLateral(input: PoseInput, cfg: MetricsConfig): RawMetrics {
  const m = emptyMetrics('lateral');
  const side = selectVisibleSide(input.landmarks, cfg.minVisibility, input.preferredSide);
  if (!side) return m;
  m.side = side;
  const earLm = input.landmarks[side === 'left' ? LM.L_EAR : LM.R_EAR];
  const shLm = input.landmarks[side === 'left' ? LM.L_SHOULDER : LM.R_SHOULDER];
  const hipLm = input.landmarks[side === 'left' ? LM.L_HIP : LM.R_HIP];
  const noseLm = input.landmarks[LM.NOSE];
  if (!isUsable(earLm, cfg.minVisibility) || !isUsable(shLm, cfg.minVisibility)) return m;
  const ear = toP(earLm, input.aspect);
  const sh = toP(shLm, input.aspect);
  if (!isUsable(noseLm, cfg.minVisibility)) return m;
  const nose = toP(noseLm, input.aspect);
  const dxNose = nose.x - ear.x;
  if (Math.abs(dxNose) < cfg.minFacingDelta) return m;
  const facing = dxNose > 0 ? 1 : -1;

  const len = dist(ear, sh);
  const c7: P = { x: sh.x - facing * cfg.c7OffsetRatio * len, y: sh.y - cfg.c7RiseRatio * len };
  m.cvaDeg = deg(Math.atan2(c7.y - ear.y, facing * (ear.x - c7.x)));
  m.headPitchDeg = deg(Math.atan2(nose.y - ear.y, Math.abs(dxNose)));

  if (isUsable(hipLm, cfg.minVisibility)) {
    const hip = toP(hipLm, input.aspect);
    if (hip.y - sh.y > 1e-6) m.trunkLeanDeg = deg(Math.atan2(facing * (sh.x - hip.x), hip.y - sh.y));
  }
  return m;
}

/**
 * Modo ladeado (cámara a ~30-60° del eje frontal): se usa el lado más visible (como en lateral) y
 * medidas relativas a la base (como en frontal). El escorzo reduce la sensibilidad, pero la base lo absorbe.
 */
export function computeOblique(input: PoseInput, cfg: MetricsConfig): RawMetrics {
  const m: RawMetrics = { ...computeLateral(input, cfg), mode: 'oblique' };
  const get = (i: number): P | null => {
    const lm = input.landmarks[i];
    return isUsable(lm, cfg.minVisibility) ? toP(lm, input.aspect) : null;
  };
  if (m.side) {
    const ear = get(m.side === 'left' ? LM.L_EAR : LM.R_EAR);
    const sh = get(m.side === 'left' ? LM.L_SHOULDER : LM.R_SHOULDER);
    if (ear && sh) {
      m.sideEarY = ear.y;
      m.sideShoulderY = sh.y;
      m.sideLen = dist(ear, sh);
    }
  }
  const le = get(LM.L_EYE);
  const re = get(LM.R_EYE);
  if (le && re) m.eyeTiltDeg = lineTiltDeg(le, re);
  m.pitchDeg = finiteOrNull(input.facePitchDeg);
  m.yawDeg = finiteOrNull(input.faceYawDeg);
  return m;
}

export function computeRawMetrics(input: PoseInput, cfg: MetricsConfig = DEFAULT_METRICS_CONFIG): RawMetrics {
  if (input.mode === 'lateral') return computeLateral(input, cfg);
  if (input.mode === 'oblique') return computeOblique(input, cfg);
  return computeFrontal(input, cfg);
}

/** Pitch/yaw (°) desde una matriz 4×4 columna-mayor de Face Landmarker (convención OpenGL: +z hacia la cámara). */
export function anglesFromFaceMatrix(m: ArrayLike<number>): { pitchDeg: number; yawDeg: number } | null {
  if (m.length < 16) return null;
  const [fx, fy, fz] = [m[8], m[9], m[10]];
  if (![fx, fy, fz].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return {
    pitchDeg: deg(Math.atan2(-(fy as number), fz as number)),
    yawDeg: deg(Math.atan2(fx as number, fz as number)),
  };
}
