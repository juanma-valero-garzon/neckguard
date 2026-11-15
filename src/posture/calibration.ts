import type { CaptureMode, DeviationId, Side } from '../core/types';
import { DEVIATION_IDS } from '../core/types';
import type { ClinicalConfig } from '../settings/clinical-config';
import type { Baseline, DeviationConfig } from './deviations';
import { DEFAULT_DEVIATION_CONFIG, buildBaseline, computeDeviations, percentile, rms } from './deviations';
import type { NumericMetricKey, RawMetrics } from './metrics';

export const CALIBRATION_SCHEMA_VERSION = 1;

export interface CalibrationProfile {
  schema: number;
  id: string;
  deviceId: string;
  deviceLabel: string;
  mode: CaptureMode;
  side: Side | null;
  createdAt: number; // epoch ms
  baseline: Baseline;
  /** Ruido de cada desviación (RMS respecto a la base) durante la captura. */
  deviationSigma: Partial<Record<DeviationId, number>>;
}

export interface CalibrationSample {
  raw: RawMetrics | null;
  /** Visibilidad media de los landmarks relevantes en ese fotograma (0 si no hay persona). */
  meanVisibility: number;
}

export type CalibrationFailure =
  | 'tooFewSamples'
  | 'lowConfidence'
  | 'missingLandmarks'
  | 'excessiveMovement'
  | 'highVariance'
  /** Modo lateral con la cámara de frente: se ven ambos lados del cuerpo. */
  | 'badPlacement';

export type CalibrationResult =
  | {
      ok: true;
      baseline: Baseline;
      deviationSigma: Partial<Record<DeviationId, number>>;
      usedSamples: number;
    }
  | { ok: false; reason: CalibrationFailure; detail?: string };

export interface RangeLimit {
  value: number;
  /** true: relativo a la mediana; false: absoluto. */
  relative: boolean;
}

export interface CalibrationConfig {
  minSamples: number;
  minValidFraction: number;
  minMeanVisibility: number;
  /** Rango p5–p95 máximo tolerado por métrica (detecta movimiento durante la captura). */
  maxRange: Partial<Record<NumericMetricKey, RangeLimit>>;
  /** Se rechaza si σ de una desviación principal supera esta fracción del umbral ámbar. */
  maxSigmaToAmber: number;
  /** Desviaciones cuyo σ se valida. */
  checkedDeviations: DeviationId[];
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  minSamples: 30,
  minValidFraction: 0.8,
  minMeanVisibility: 0.6,
  maxRange: {
    faceScale: { value: 0.15, relative: true },
    shoulderScale: { value: 0.15, relative: true },
    shoulderMidY: { value: 0.05, relative: false },
    headY: { value: 0.05, relative: false },
    eyeTiltDeg: { value: 6, relative: false },
    shoulderTiltDeg: { value: 6, relative: false },
    yawProxy: { value: 0.12, relative: false },
    noseDrop: { value: 0.12, relative: false },
    cvaDeg: { value: 8, relative: false },
    headPitchDeg: { value: 8, relative: false },
    sideLen: { value: 0.15, relative: true },
    sideShoulderY: { value: 0.05, relative: false },
    sideEarY: { value: 0.05, relative: false },
  },
  maxSigmaToAmber: 0.5,
  checkedDeviations: ['protrusion', 'headDown', 'slouch'],
};

const REQUIRED: Record<CaptureMode, NumericMetricKey[]> = {
  frontal: [
    'faceScale',
    'shoulderScale',
    'shoulderMidY',
    'headY',
    'eyeTiltDeg',
    'shoulderTiltDeg',
    'yawProxy',
    'noseDrop',
  ],
  lateral: ['cvaDeg', 'headPitchDeg'],
  oblique: ['cvaDeg', 'headPitchDeg', 'sideLen', 'sideShoulderY', 'sideEarY'],
};

export function evaluateCalibration(
  samples: readonly CalibrationSample[],
  mode: CaptureMode,
  clinical: ClinicalConfig,
  cfg: CalibrationConfig = DEFAULT_CALIBRATION_CONFIG,
  devCfg: DeviationConfig = DEFAULT_DEVIATION_CONFIG,
): CalibrationResult {
  if (samples.length < cfg.minSamples) return { ok: false, reason: 'tooFewSamples' };

  const meanVis =
    samples.reduce((a, s) => a + (Number.isFinite(s.meanVisibility) ? s.meanVisibility : 0), 0) /
    samples.length;
  if (meanVis < cfg.minMeanVisibility) return { ok: false, reason: 'lowConfidence' };

  const complete = samples
    .map((s) => s.raw)
    .filter(
      (r): r is RawMetrics => r !== null && r.mode === mode && REQUIRED[mode].every((k) => r[k] !== null),
    );
  if (complete.length / samples.length < cfg.minValidFraction) {
    return { ok: false, reason: 'missingLandmarks' };
  }

  const baseline = buildBaseline(complete);

  for (const [key, limit] of Object.entries(cfg.maxRange) as [NumericMetricKey, RangeLimit][]) {
    const vals = complete.map((r) => r[key]).filter((v): v is number => v !== null);
    if (vals.length < 3) continue;
    const range = percentile(vals, 0.95) - percentile(vals, 0.05);
    const allowed = limit.relative ? limit.value * Math.abs(baseline[key]?.median ?? 1) : limit.value;
    if (range > allowed) return { ok: false, reason: 'excessiveMovement', detail: key };
  }

  const perDev: Record<string, number[]> = {};
  for (const r of complete) {
    const dv = computeDeviations(r, baseline, devCfg);
    for (const id of DEVIATION_IDS) {
      const v = dv[id];
      if (v !== null) (perDev[id] ??= []).push(v);
    }
  }
  const deviationSigma: Partial<Record<DeviationId, number>> = {};
  for (const id of DEVIATION_IDS) {
    const vals = perDev[id];
    if (vals && vals.length) deviationSigma[id] = rms(vals);
  }
  for (const id of cfg.checkedDeviations) {
    const sigma = deviationSigma[id];
    const amber = clinical.thresholds[mode][id]?.amber;
    if (sigma !== undefined && amber !== undefined && sigma > cfg.maxSigmaToAmber * amber) {
      return { ok: false, reason: 'highVariance', detail: id };
    }
  }
  return { ok: true, baseline, deviationSigma, usedSamples: complete.length };
}

export class CalibrationSession {
  private readonly samples: CalibrationSample[] = [];

  constructor(
    readonly mode: CaptureMode,
    private readonly clinical: ClinicalConfig,
    private readonly cfg: CalibrationConfig = DEFAULT_CALIBRATION_CONFIG,
  ) {}

  add(sample: CalibrationSample): void {
    this.samples.push(sample);
  }

  get count(): number {
    return this.samples.length;
  }

  finish(): CalibrationResult {
    return evaluateCalibration(this.samples, this.mode, this.clinical, this.cfg);
  }
}

export function makeProfile(
  result: Extract<CalibrationResult, { ok: true }>,
  meta: { deviceId: string; deviceLabel: string; mode: CaptureMode; side: Side | null; createdAt: number },
): CalibrationProfile {
  return {
    schema: CALIBRATION_SCHEMA_VERSION,
    id: `${meta.mode}:${meta.deviceId || meta.deviceLabel}`,
    deviceId: meta.deviceId,
    deviceLabel: meta.deviceLabel,
    mode: meta.mode,
    side: meta.side,
    createdAt: meta.createdAt,
    baseline: result.baseline,
    deviationSigma: result.deviationSigma,
  };
}

/** Selección por deviceId + modo; respaldo por etiqueta (el deviceId puede cambiar al revocar permisos). */
export function selectProfile(
  profiles: readonly CalibrationProfile[],
  query: { deviceId: string; label: string; mode: CaptureMode },
): CalibrationProfile | null {
  const sameMode = profiles.filter((p) => p.mode === query.mode);
  const byId = query.deviceId ? sameMode.find((p) => p.deviceId === query.deviceId) : undefined;
  if (byId) return byId;
  const byLabel = query.label ? sameMode.find((p) => p.deviceLabel === query.label) : undefined;
  return byLabel ?? null;
}

export interface DriftWindow {
  /** Desviaciones simultáneamente fuera de verde durante esa ventana. */
  nonGreenCount: number;
}

/** Sugiere recalibrar si varias desviaciones a la vez están fuera de verde durante N ventanas seguidas. */
export function shouldSuggestRecalibration(
  windows: readonly DriftWindow[],
  opts: { windows: number; minDeviations: number } = { windows: 5, minDeviations: 3 },
): boolean {
  if (windows.length < opts.windows) return false;
  return windows.slice(-opts.windows).every((w) => w.nonGreenCount >= opts.minDeviations);
}
