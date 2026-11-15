import { describe, expect, it } from 'vitest';
import { ASPECT, frontalPose, obliquePose, type ObliquePoseParams } from '../core/synthetic';
import { FakeClock, gaussian, mulberry32 } from '../core/testing';
import { PostureEngine, type EngineSnapshot } from '../engine/engine';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import { DEFAULT_SETTINGS } from '../settings/schema';
import { evaluateCalibration, type CalibrationSample } from './calibration';
import { effectiveThresholds } from './classifier';
import { buildBaseline, computeDeviations } from './deviations';
import { DEFAULT_METRICS_CONFIG, computeRawMetrics, type MetricsConfig } from './metrics';

const cfg0: MetricsConfig = { ...DEFAULT_METRICS_CONFIG, c7OffsetRatio: 0 };
const raw = (p: ObliquePoseParams, extra: { facePitchDeg?: number; faceYawDeg?: number } = {}) =>
  computeRawMetrics({ landmarks: obliquePose(p), aspect: ASPECT, mode: 'oblique', ...extra }, cfg0);
const baseP: ObliquePoseParams = { cvaDeg: 60, noseDx: 0.05, noseDy: 0.02 };
const baseline = buildBaseline([raw(baseP), raw(baseP), raw(baseP)]);
const dev = (p: Partial<ObliquePoseParams>, extra = {}) =>
  computeDeviations(raw({ ...baseP, ...p }, extra), baseline);

describe('modo ladeado: métricas', () => {
  it('mide el CVA del lado visible y la geometría lateral cercana', () => {
    const m = raw({ ...baseP, cvaDeg: 52 });
    expect(m.mode).toBe('oblique');
    expect(m.side).toBe('left');
    expect(m.cvaDeg).toBeCloseTo(52, 6);
    expect(m.sideLen).toBeCloseTo(0.25, 9);
    expect(m.sideShoulderY).toBeCloseTo(0.7, 9);
    expect(m.eyeTiltDeg).toBeCloseTo(0, 6);
  });

  it('usa el lado cercano aunque el lejano sea parcialmente visible, y respeta el lado preferido', () => {
    expect(raw({ ...baseP, side: 'right', farVisibility: 0.6 }).side).toBe('right');
    const lms = obliquePose({ ...baseP, farVisibility: 0.9 });
    const m = computeRawMetrics(
      { landmarks: lms, aspect: ASPECT, mode: 'oblique', preferredSide: 'left' },
      cfg0,
    );
    expect(m.side).toBe('left');
  });

  it('sin landmarks del lado visible las métricas son null (nunca NaN)', () => {
    const lms = obliquePose(baseP);
    lms[0] = { x: 0, y: 0, visibility: 0 };
    const m = computeRawMetrics({ landmarks: lms, aspect: ASPECT, mode: 'oblique' }, cfg0);
    expect(m.cvaDeg).toBeNull();
    expect(m.sideLen).not.toBeNaN();
  });
});

describe('modo ladeado: desviaciones', () => {
  it('sin cambios todo es 0', () => {
    const d = dev({});
    for (const k of ['protrusion', 'slouch', 'shoulderElevation', 'headTilt'] as const) {
      expect(Math.abs(d[k] as number)).toBeLessThan(1e-6);
    }
  });

  it('protrusión = ΔCVA bajo la base', () => {
    expect(dev({ cvaDeg: 52 }).protrusion).toBeCloseTo(8, 6);
  });

  it('encorvamiento al bajar cabeza y hombro; hombro elevado al subir solo el hombro', () => {
    const down = dev({ shiftY: 0.05 });
    expect(down.slouch).toBeCloseTo(20, 5);
    expect(down.shoulderElevation).toBeCloseTo(0, 5);
    const shrug = dev({ shoulderDy: -0.05 });
    expect(shrug.shoulderElevation).toBeGreaterThan(15);
    expect(shrug.slouch as number).toBeLessThan(0);
  });

  it('cabeceo: Face Landmarker si hay; si no, ángulo oreja-nariz', () => {
    expect(dev({ noseDy: 0.02 + 0.03 }).headDown as number).toBeGreaterThan(5);
    const withFace = (pitch: number) => raw(baseP, { facePitchDeg: pitch, faceYawDeg: 0 });
    const bl = buildBaseline([withFace(2), withFace(2), withFace(2)]);
    expect(computeDeviations(withFace(14), bl).headDown).toBeCloseTo(12, 6);
    expect(computeDeviations(withFace(2), bl).headRotation).toBeCloseTo(0, 6);
    expect(computeDeviations(raw(baseP, { facePitchDeg: 5, faceYawDeg: 30 }), bl).headRotation).toBeCloseTo(
      30,
      6,
    );
  });

  it('inclinación de cabeza por línea de ojos', () => {
    expect(dev({ eyeTiltDeg: 8 }).headTilt).toBeCloseTo(8, 4);
  });

  it('las desviaciones propias del modo frontal no se evalúan', () => {
    const d = dev({ cvaDeg: 50 });
    expect(d.proximity).toBeNull();
    expect(d.shoulderAsymmetry).toBeNull();
  });
});

describe('modo ladeado: calibración y umbrales', () => {
  const samples = (n: number, seed = 1): CalibrationSample[] => {
    const rng = mulberry32(seed);
    return Array.from({ length: n }, () => ({
      raw: raw({ ...baseP, cvaDeg: 60 + gaussian(rng, 0.3), shiftY: gaussian(rng, 0.001) }),
      meanVisibility: 0.95,
    }));
  };

  it('acepta una base estable y guarda la geometría del lado visible', () => {
    const r = evaluateCalibration(samples(60), 'oblique', CLINICAL_CONFIG);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.baseline.sideLen?.median).toBeCloseTo(0.25, 3);
      expect(r.deviationSigma.protrusion).toBeGreaterThan(0);
    }
  });

  it('rechaza muestras de otro modo (sin lado visible) con motivo', () => {
    const frontal = Array.from({ length: 60 }, () => ({
      raw: computeRawMetrics({ landmarks: frontalPose({}), aspect: ASPECT, mode: 'frontal' }),
      meanVisibility: 0.95,
    }));
    expect(evaluateCalibration(frontal, 'oblique', CLINICAL_CONFIG)).toEqual({
      ok: false,
      reason: 'missingLandmarks',
    });
  });

  it('rechaza movimiento excesivo del hombro visible', () => {
    const moving = Array.from({ length: 60 }, (_, i) => ({
      raw: raw({ ...baseP, shoulderDy: (i % 10) * 0.01 }),
      meanVisibility: 0.95,
    }));
    expect(evaluateCalibration(moving, 'oblique', CLINICAL_CONFIG)).toMatchObject({
      ok: false,
      reason: 'excessiveMovement',
    });
  });

  it('define umbrales para las desviaciones medibles en ladeado (más sensibles que lateral en protrusión)', () => {
    const t = effectiveThresholds('oblique', CLINICAL_CONFIG, {});
    expect(Object.keys(t).sort()).toEqual([
      'headDown',
      'headRotation',
      'headTilt',
      'protrusion',
      'shoulderElevation',
      'slouch',
    ]);
    expect(t.protrusion?.amber).toBe(4);
    expect(t.protrusion!.amber).toBeLessThan(
      effectiveThresholds('lateral', CLINICAL_CONFIG, {}).protrusion!.amber,
    );
  });
});

describe('modo ladeado: motor', () => {
  function setup() {
    const clock = new FakeClock(0);
    const engine = new PostureEngine(
      { clock, clinical: CLINICAL_CONFIG, idGen: () => 'id', utcOffsetMin: () => 0 },
      { ...DEFAULT_SETTINGS, mode: 'oblique', useFaceLandmarker: false },
    );
    const rng = mulberry32(9);
    const feed = (sec: number, p: Partial<ObliquePoseParams> = {}): EngineSnapshot => {
      let snap!: EngineSnapshot;
      for (let i = 0; i < sec * 10; i++) {
        clock.advance(100);
        snap = engine.processFrame({
          t: clock.nowMs(),
          poses: [
            obliquePose({
              ...baseP,
              ...p,
              cvaDeg: (p.cvaDeg ?? 60) + gaussian(rng, 0.2),
              farVisibility: 0.6,
            }),
          ],
          aspect: ASPECT,
        });
      }
      return snap;
    };
    return { engine, feed };
  }

  it('calibra, mantiene el lado de la calibración y avisa de protrusión sostenida', () => {
    const { engine, feed } = setup();
    engine.startCalibration();
    feed(6);
    const { result, profile } = engine.finishCalibration({ deviceId: 'lap', deviceLabel: 'Portátil' });
    expect(result.ok).toBe(true);
    expect(profile?.mode).toBe('oblique');
    expect(profile?.side).toBe('left');
    expect(feed(10).level).toBe('OK');
    const snap = feed(25, { cvaDeg: 50 });
    expect(snap.level).toBe('MALA_POSTURA');
    expect(snap.reason).toBe('protrusion');
    expect(snap.raw?.mode).toBe('oblique');
    expect(snap.thresholds.protrusion?.amber).toBeCloseTo(4, 5);
  });
});
