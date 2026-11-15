import type { DeviationId } from '../core/types';
import { DEVIATION_IDS } from '../core/types';
import type { NumericMetricKey, RawMetrics } from './metrics';
import { NUMERIC_KEYS } from './metrics';

export interface MetricBaseline {
  median: number;
  sigma: number;
}

export type Baseline = Partial<Record<NumericMetricKey, MetricBaseline>>;

export type DeviationValues = Record<DeviationId, number | null>;

export interface DeviationConfig {
  /** Conversión del proxy nariz-ojos a grados (heurística, sin Face Landmarker). */
  noseDropDegPerUnit: number;
  /** Conversión del proxy de guiñada a grados (heurística). */
  yawDegPerUnit: number;
}

export const DEFAULT_DEVIATION_CONFIG: DeviationConfig = { noseDropDegPerUnit: 140, yawDegPerUnit: 100 };

export const emptyDeviations = (): DeviationValues =>
  Object.fromEntries(DEVIATION_IDS.map((id) => [id, null])) as DeviationValues;

/** Valor positivo = peor. Unidades: grados o % según el umbral. null = no medible o sin base. */
export function computeDeviations(
  raw: RawMetrics,
  baseline: Baseline,
  cfg: DeviationConfig = DEFAULT_DEVIATION_CONFIG,
): DeviationValues {
  const out = emptyDeviations();
  const b = (k: NumericMetricKey): number | null => baseline[k]?.median ?? null;

  if (raw.mode === 'lateral') {
    const cva = raw.cvaDeg;
    const bCva = b('cvaDeg');
    if (cva !== null && bCva !== null) out.protrusion = bCva - cva;
    const hp = raw.headPitchDeg;
    const bHp = b('headPitchDeg');
    if (hp !== null && bHp !== null) out.headDown = hp - bHp;
    const lean = raw.trunkLeanDeg;
    const bLean = b('trunkLeanDeg');
    if (lean !== null && bLean !== null) out.slouch = lean - bLean;
    return out;
  }

  if (raw.mode === 'oblique') {
    const cva = raw.cvaDeg;
    const bCva = b('cvaDeg');
    if (cva !== null && bCva !== null) out.protrusion = bCva - cva;
    // Cabeceo: Face Landmarker si hay; si no, ángulo oreja-nariz del lado visible.
    if (raw.pitchDeg !== null && b('pitchDeg') !== null)
      out.headDown = raw.pitchDeg - (b('pitchDeg') as number);
    else if (raw.headPitchDeg !== null && b('headPitchDeg') !== null) {
      out.headDown = raw.headPitchDeg - (b('headPitchDeg') as number);
    }
    const bLen = b('sideLen');
    const bSY = b('sideShoulderY');
    const bEY = b('sideEarY');
    if (raw.sideShoulderY !== null && raw.sideEarY !== null && bLen && bSY !== null && bEY !== null) {
      const shoulderLift = (bSY - raw.sideShoulderY) / bLen;
      const headLift = (bEY - raw.sideEarY) / bLen;
      out.slouch = -((shoulderLift + headLift) / 2) * 100;
      out.shoulderElevation = (shoulderLift - headLift) * 100;
    }
    if (raw.eyeTiltDeg !== null && b('eyeTiltDeg') !== null) {
      out.headTilt = Math.abs(raw.eyeTiltDeg - (b('eyeTiltDeg') as number));
    }
    if (raw.yawDeg !== null && b('yawDeg') !== null) {
      out.headRotation = Math.abs(raw.yawDeg - (b('yawDeg') as number));
    }
    return out;
  }

  const bFace = b('faceScale');
  const bSh = b('shoulderScale');
  if (raw.faceScale !== null && raw.shoulderScale !== null && bFace && bSh) {
    const faceRel = raw.faceScale / bFace;
    const shRel = raw.shoulderScale / bSh;
    out.protrusion = (faceRel / shRel - 1) * 100;
    out.proximity = (shRel - 1) * 100;
  }

  if (raw.pitchDeg !== null && b('pitchDeg') !== null) {
    out.headDown = raw.pitchDeg - (b('pitchDeg') as number);
  } else if (raw.noseDrop !== null && b('noseDrop') !== null) {
    out.headDown = (raw.noseDrop - (b('noseDrop') as number)) * cfg.noseDropDegPerUnit;
  }

  const bShY = b('shoulderMidY');
  const bHeadY = b('headY');
  if (raw.shoulderMidY !== null && raw.headY !== null && bShY !== null && bHeadY !== null && bSh) {
    const shoulderLift = (bShY - raw.shoulderMidY) / bSh;
    const headLift = (bHeadY - raw.headY) / bSh;
    out.slouch = -((shoulderLift + headLift) / 2) * 100;
    out.shoulderElevation = (shoulderLift - headLift) * 100;
  }

  if (raw.shoulderTiltDeg !== null && b('shoulderTiltDeg') !== null) {
    out.shoulderAsymmetry = Math.abs(raw.shoulderTiltDeg - (b('shoulderTiltDeg') as number));
  }
  if (raw.eyeTiltDeg !== null && b('eyeTiltDeg') !== null) {
    out.headTilt = Math.abs(raw.eyeTiltDeg - (b('eyeTiltDeg') as number));
  }
  if (raw.yawDeg !== null && b('yawDeg') !== null) {
    out.headRotation = Math.abs(raw.yawDeg - (b('yawDeg') as number));
  } else if (raw.yawProxy !== null && b('yawProxy') !== null) {
    out.headRotation = Math.abs(raw.yawProxy - (b('yawProxy') as number)) * cfg.yawDegPerUnit;
  }
  return out;
}

/** Mediana de una lista (ordena una copia). */
export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  const mid = n >> 1;
  return n % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
}

export function rms(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((a, b) => a + b * b, 0) / values.length);
}

/** Percentil por interpolación lineal (p en [0,1]). */
export function percentile(values: readonly number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * (idx - lo);
}

export function buildBaseline(samples: readonly RawMetrics[]): Baseline {
  const baseline: Baseline = {};
  for (const key of NUMERIC_KEYS) {
    const vals = samples.map((s) => s[key]).filter((v): v is number => v !== null);
    if (vals.length >= Math.max(3, samples.length * 0.5)) {
      baseline[key] = { median: median(vals), sigma: stdDev(vals) };
    }
  }
  return baseline;
}
