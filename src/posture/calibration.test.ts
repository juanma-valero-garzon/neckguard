import { describe, expect, it } from 'vitest';
import { ASPECT, frontalPose, lateralPose } from '../core/synthetic';
import { gaussian, mulberry32 } from '../core/testing';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import {
  CalibrationSession,
  DEFAULT_CALIBRATION_CONFIG,
  evaluateCalibration,
  makeProfile,
  selectProfile,
  shouldSuggestRecalibration,
  type CalibrationSample,
} from './calibration';
import { computeRawMetrics, DEFAULT_METRICS_CONFIG } from './metrics';
import { effectiveThresholds } from './classifier';
import { computeDeviations } from './deviations';

const cfg0 = { ...DEFAULT_METRICS_CONFIG, c7OffsetRatio: 0 };

function frontalSamples(
  n: number,
  noise: number,
  seed = 1,
  jitter?: (i: number) => Partial<Parameters<typeof frontalPose>[0]>,
): CalibrationSample[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const raw = computeRawMetrics({
      landmarks: frontalPose({
        faceScale: 0.1 * (1 + gaussian(rng, noise)),
        shoulderWidth: 0.4 * (1 + gaussian(rng, noise)),
        shoulderMidY: 0.78 + gaussian(rng, noise * 0.1),
        headY: 0.45 + gaussian(rng, noise * 0.1),
        ...(jitter ? jitter(i) : {}),
      }),
      aspect: ASPECT,
      mode: 'frontal',
    });
    return { raw, meanVisibility: 0.95 };
  });
}

function lateralSamples(n: number, noiseDeg: number, seed = 2): CalibrationSample[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => ({
    raw: computeRawMetrics(
      {
        landmarks: lateralPose({
          cvaDeg: 60 + gaussian(rng, noiseDeg),
          noseDy: 0.02 + gaussian(rng, 0.0005),
        }),
        aspect: ASPECT,
        mode: 'lateral',
      },
      cfg0,
    ),
    meanVisibility: 0.95,
  }));
}

describe('calibración', () => {
  it('acepta una línea base estable con mediana y σ correctas', () => {
    const res = evaluateCalibration(frontalSamples(60, 0.004), 'frontal', CLINICAL_CONFIG);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.baseline.faceScale?.median).toBeCloseTo(0.1, 2);
    expect(res.baseline.faceScale?.sigma).toBeGreaterThan(0);
    expect(res.baseline.faceScale?.sigma).toBeLessThan(0.002);
    expect(res.deviationSigma.protrusion).toBeGreaterThan(0);
    expect(res.usedSamples).toBe(60);
  });

  it('mediana y σ exactas con datos conocidos', () => {
    const samples = lateralSamples(40, 0);
    samples.forEach((s, i) => {
      if (s.raw) s.raw.cvaDeg = 58 + (i % 5); // 58..62 → mediana 60
    });
    const res = evaluateCalibration(samples, 'lateral', CLINICAL_CONFIG);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.baseline.cvaDeg?.median).toBe(60);
  });

  it('rechaza por pocas muestras', () => {
    expect(evaluateCalibration(frontalSamples(5, 0.002), 'frontal', CLINICAL_CONFIG)).toEqual({
      ok: false,
      reason: 'tooFewSamples',
    });
  });

  it('rechaza por confianza baja', () => {
    const s = frontalSamples(60, 0.002).map((x) => ({ ...x, meanVisibility: 0.3 }));
    expect(evaluateCalibration(s, 'frontal', CLINICAL_CONFIG)).toEqual({
      ok: false,
      reason: 'lowConfidence',
    });
  });

  it('rechaza por landmarks ausentes', () => {
    const s = frontalSamples(60, 0.002).map((x, i) => (i % 2 ? { ...x, raw: null } : x));
    expect(evaluateCalibration(s, 'frontal', CLINICAL_CONFIG)).toEqual({
      ok: false,
      reason: 'missingLandmarks',
    });
  });

  it('rechaza por movimiento excesivo indicando la métrica', () => {
    const s = frontalSamples(60, 0.002, 3, (i) => ({ shoulderMidY: 0.78 + (i % 10) * 0.01 }));
    const res = evaluateCalibration(s, 'frontal', CLINICAL_CONFIG);
    expect(res).toMatchObject({ ok: false, reason: 'excessiveMovement', detail: 'shoulderMidY' });
  });

  it('rechaza por varianza alta (σ > 50 % del umbral ámbar)', () => {
    const noRange = { ...DEFAULT_CALIBRATION_CONFIG, maxRange: {} };
    const res = evaluateCalibration(lateralSamples(80, 3), 'lateral', CLINICAL_CONFIG, noRange);
    expect(res).toMatchObject({ ok: false, reason: 'highVariance', detail: 'protrusion' });
    expect(evaluateCalibration(lateralSamples(80, 3), 'lateral', CLINICAL_CONFIG)).toMatchObject({
      ok: false,
      reason: 'excessiveMovement',
    });
  });

  it('ignora muestras de otro modo', () => {
    const res = evaluateCalibration(lateralSamples(60, 0.2), 'frontal', CLINICAL_CONFIG);
    expect(res).toEqual({ ok: false, reason: 'missingLandmarks' });
  });

  it('el umbral efectivo usa el ruido medido en la calibración', () => {
    const res = evaluateCalibration(lateralSamples(100, 1.0), 'lateral', CLINICAL_CONFIG);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const sigma = res.deviationSigma.protrusion as number;
    const th = effectiveThresholds('lateral', CLINICAL_CONFIG, res.deviationSigma);
    expect(th.protrusion?.amber).toBeCloseTo(Math.max(5, 2 * sigma), 9);
    const base = computeDeviations(lateralSamples(1, 0)[0]!.raw!, res.baseline);
    expect(Math.abs(base.protrusion as number)).toBeLessThan(5);
  });

  it('CalibrationSession acumula y valida', () => {
    const s = new CalibrationSession('frontal', CLINICAL_CONFIG);
    for (const x of frontalSamples(DEFAULT_CALIBRATION_CONFIG.minSamples, 0.002)) s.add(x);
    expect(s.count).toBe(30);
    expect(s.finish().ok).toBe(true);
  });
});

describe('perfiles', () => {
  const res = evaluateCalibration(frontalSamples(60, 0.003), 'frontal', CLINICAL_CONFIG);
  if (!res.ok) throw new Error('fixture');
  const mk = (deviceId: string, label: string, mode: 'frontal' | 'lateral') =>
    makeProfile(res, { deviceId, deviceLabel: label, mode, side: null, createdAt: 1 });
  const profiles = [mk('A', 'FaceTime HD', 'frontal'), mk('B', 'USB Cam', 'lateral')];

  it('selecciona por deviceId y modo', () => {
    expect(selectProfile(profiles, { deviceId: 'A', label: 'x', mode: 'frontal' })?.deviceId).toBe('A');
    expect(selectProfile(profiles, { deviceId: 'A', label: 'x', mode: 'lateral' })).toBeNull();
  });
  it('recurre a la etiqueta si el deviceId cambió', () => {
    expect(selectProfile(profiles, { deviceId: 'Z', label: 'USB Cam', mode: 'lateral' })?.deviceId).toBe('B');
    expect(selectProfile(profiles, { deviceId: '', label: '', mode: 'frontal' })).toBeNull();
  });
  it('el id del perfil distingue cámara y modo', () => {
    expect(profiles[0]?.id).toBe('frontal:A');
    expect(mk('', 'Etiqueta', 'frontal').id).toBe('frontal:Etiqueta');
  });
});

describe('deriva de la línea base', () => {
  it('sugiere recalibrar con N ventanas seguidas de ≥ 3 desviaciones fuera de verde', () => {
    const w = (n: number) => ({ nonGreenCount: n });
    expect(shouldSuggestRecalibration([w(3), w(4), w(3), w(5), w(3)])).toBe(true);
    expect(shouldSuggestRecalibration([w(3), w(4), w(2), w(5), w(3)])).toBe(false);
    expect(shouldSuggestRecalibration([w(3), w(4)])).toBe(false);
    expect(shouldSuggestRecalibration([w(0), w(3), w(3), w(3), w(3), w(3)])).toBe(true);
  });
});
