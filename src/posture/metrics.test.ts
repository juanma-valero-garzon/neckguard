import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ASPECT, frontalPose, lateralPose } from '../core/synthetic';
import {
  DEFAULT_METRICS_CONFIG,
  anglesFromFaceMatrix,
  computeRawMetrics,
  selectVisibleSide,
  type MetricsConfig,
} from './metrics';
import { buildBaseline, computeDeviations, median, percentile, rms, stdDev } from './deviations';
import type { Landmark } from '../core/types';

const cfg0: MetricsConfig = { ...DEFAULT_METRICS_CONFIG, c7OffsetRatio: 0 };
const lat = (p: Parameters<typeof lateralPose>[0], c: MetricsConfig = cfg0) =>
  computeRawMetrics({ landmarks: lateralPose(p), aspect: ASPECT, mode: 'lateral' }, c);

describe('CVA lateral (ángulo conocido)', () => {
  it.each([45, 50, 60, 90, 120])('mide %i° con geometría exacta', (cva) => {
    expect(lat({ cvaDeg: cva }).cvaDeg).toBeCloseTo(cva, 6);
  });

  it('es invariante a traslación y escala', () => {
    const base = lat({ cvaDeg: 52 }).cvaDeg as number;
    expect(lat({ cvaDeg: 52, shiftX: 0.1, shiftY: -0.05 }).cvaDeg).toBeCloseTo(base, 6);
    expect(lat({ cvaDeg: 52, scale: 0.5 }).cvaDeg).toBeCloseTo(base, 6);
  });

  it('es invariante al espejo y al sentido de la mirada', () => {
    const base = lat({ cvaDeg: 52 }).cvaDeg as number;
    expect(lat({ cvaDeg: 52, mirror: true }).cvaDeg).toBeCloseTo(base, 6);
    expect(lat({ cvaDeg: 52, facing: -1 }).cvaDeg).toBeCloseTo(base, 6);
  });

  it('propiedad: el CVA devuelto coincide con el generado para cualquier ángulo y escala', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 120, noNaN: true }),
        fc.double({ min: 0.3, max: 2, noNaN: true }),
        (cva, s) => {
          expect(lat({ cvaDeg: cva, scale: s }).cvaDeg).toBeCloseTo(cva, 5);
        },
      ),
    );
  });

  it('con C7 estimado el CVA aproximado aumenta respecto al ángulo oreja-hombro', () => {
    const withC7 = lat({ cvaDeg: 55 }, DEFAULT_METRICS_CONFIG).cvaDeg as number;
    expect(withC7).not.toBeCloseTo(55, 1);
  });

  it('devuelve null explícito (nunca NaN) si faltan landmarks', () => {
    const lms = lateralPose({ cvaDeg: 50 });
    lms[0] = { x: 0, y: 0, visibility: 0 }; // nariz oculta
    const m = computeRawMetrics({ landmarks: lms, aspect: ASPECT, mode: 'lateral' }, cfg0);
    expect(m.cvaDeg).toBeNull();
    expect(m.headPitchDeg).toBeNull();
    for (const v of Object.values(m)) expect(typeof v === 'number' ? Number.isNaN(v) : false).toBe(false);
  });

  it('devuelve null si la nariz está alineada con la oreja (dirección indeterminada)', () => {
    expect(lat({ cvaDeg: 50, noseDx: 0 }).cvaDeg).toBeNull();
  });

  it('mide cabeceo lateral y la inclinación del tronco cuando hay cadera', () => {
    const m = lat({ cvaDeg: 60, noseDx: 0.1, noseDy: 0.1, hipLeanDeg: 10 });
    expect(m.headPitchDeg).toBeCloseTo(45, 5);
    expect(m.trunkLeanDeg).toBeCloseTo(10, 5);
    expect(lat({ cvaDeg: 60, hipLeanDeg: null }).trunkLeanDeg).toBeNull();
  });
});

describe('selección del lado visible', () => {
  const mk = (leftVis: number, rightVis: number): Landmark[] => {
    const l = lateralPose({ cvaDeg: 50, side: 'left' });
    const r = lateralPose({ cvaDeg: 50, side: 'right' });
    l[12] = r[12] as Landmark;
    l[8] = r[8] as Landmark;
    (l[7] as Landmark).visibility = leftVis;
    (l[11] as Landmark).visibility = leftVis;
    (l[8] as Landmark).visibility = rightVis;
    (l[12] as Landmark).visibility = rightVis;
    return l;
  };
  it('elige el lado de mayor visibilidad', () => {
    expect(selectVisibleSide(mk(0.9, 0.6), 0.5)).toBe('left');
    expect(selectVisibleSide(mk(0.6, 0.9), 0.5)).toBe('right');
  });
  it('respeta el lado preferido si es visible y recurre al otro si no', () => {
    expect(selectVisibleSide(mk(0.9, 0.6), 0.5, 'right')).toBe('right');
    expect(selectVisibleSide(mk(0.9, 0.2), 0.5, 'right')).toBe('left');
    expect(selectVisibleSide(mk(0.2, 0.9), 0.5, 'left')).toBe('right');
  });
  it('devuelve null si ninguno es visible', () => {
    expect(selectVisibleSide(mk(0.1, 0.1), 0.5)).toBeNull();
  });
});

describe('métricas frontales', () => {
  const frontal = (p: Parameters<typeof frontalPose>[0]) =>
    computeRawMetrics({ landmarks: frontalPose(p), aspect: ASPECT, mode: 'frontal' });
  const base = frontal({});
  const baseline = buildBaseline([base, base, base, base]);
  const dev = (p: Parameters<typeof frontalPose>[0]) => computeDeviations(frontal(p), baseline);

  it('sin cambios todas las desviaciones son 0', () => {
    for (const v of Object.values(dev({}))) expect(Math.abs(v as number)).toBeLessThan(1e-9);
  });

  it('combinación 1: crece solo la cara ⇒ protrusión, no proximidad', () => {
    const d = dev({ faceScale: 0.11 });
    expect(d.protrusion).toBeCloseTo(10, 6);
    expect(d.proximity).toBeCloseTo(0, 6);
  });

  it('combinación 2: crecen cara y hombros ⇒ proximidad, no protrusión', () => {
    const d = dev({ faceScale: 0.11, shoulderWidth: 0.44 });
    expect(d.protrusion).toBeCloseTo(0, 6);
    expect(d.proximity).toBeCloseTo(10, 6);
  });

  it('combinación 3: crecen solo los hombros ⇒ protrusión negativa (cabeza retraída)', () => {
    const d = dev({ shoulderWidth: 0.44 });
    expect(d.protrusion as number).toBeLessThan(0);
    expect(d.proximity).toBeCloseTo(10, 6);
  });

  it('combinación 4: ninguna crece ⇒ sin cambio', () => {
    const d = dev({ faceScale: 0.1, shoulderWidth: 0.4 });
    expect(d.protrusion).toBeCloseTo(0, 9);
    expect(d.proximity).toBeCloseTo(0, 9);
  });

  it('inclinación de hombros y de ojos', () => {
    const d = dev({ shoulderTiltDeg: 5, eyeTiltDeg: 7 });
    expect(d.shoulderAsymmetry).toBeCloseTo(5, 5);
    expect(d.headTilt).toBeCloseTo(7, 5);
  });

  it('descenso del tronco ⇒ slouch positivo; encoger hombros ⇒ elevación positiva', () => {
    const down = dev({ shoulderMidY: 0.78 + 0.04, headY: 0.45 + 0.04 });
    expect(down.slouch).toBeCloseTo(10, 5);
    expect(down.shoulderElevation).toBeCloseTo(0, 5);
    const shrug = dev({ shoulderMidY: 0.78 - 0.04 });
    expect(shrug.shoulderElevation).toBeCloseTo(10, 5);
  });

  it('cabeza baja desde proxy nariz-ojos y desde pitch de Face Landmarker', () => {
    const proxy = dev({ noseDrop: 0.8 });
    expect(proxy.headDown).toBeCloseTo(0.1 * 140, 4);
    const withFace = (pitchDeg: number) =>
      computeRawMetrics({
        landmarks: frontalPose({}),
        aspect: ASPECT,
        mode: 'frontal',
        facePitchDeg: pitchDeg,
        faceYawDeg: 0,
      });
    const bl = buildBaseline([withFace(2), withFace(2), withFace(2)]);
    expect(computeDeviations(withFace(14), bl).headDown).toBeCloseTo(12, 6);
    expect(computeDeviations(withFace(2), bl).headRotation).toBeCloseTo(0, 6);
  });

  it('rotación por proxy de guiñada', () => {
    expect(dev({ yawProxy: 0.2 }).headRotation).toBeCloseTo(20, 5);
  });

  it('es invariante al espejo horizontal (las desviaciones no dependen del lado)', () => {
    const mirror = (lms: Landmark[]): Landmark[] => lms.map((l) => ({ ...l, x: 1 - l.x }));
    const p = { faceScale: 0.11, shoulderTiltDeg: 4, eyeTiltDeg: 3 };
    const m1 = computeRawMetrics({ landmarks: frontalPose(p), aspect: ASPECT, mode: 'frontal' });
    const m2 = computeRawMetrics({ landmarks: mirror(frontalPose(p)), aspect: ASPECT, mode: 'frontal' });
    expect(m2.faceScale).toBeCloseTo(m1.faceScale as number, 9);
    expect(Math.abs(m2.shoulderTiltDeg as number)).toBeCloseTo(Math.abs(m1.shoulderTiltDeg as number), 9);
  });

  it('landmarks ausentes ⇒ null y desviaciones null', () => {
    const lms = frontalPose({});
    lms[2] = { x: 0, y: 0, visibility: 0 };
    const m = computeRawMetrics({ landmarks: lms, aspect: ASPECT, mode: 'frontal' });
    expect(m.faceScale).toBeNull();
    const d = computeDeviations(m, baseline);
    expect(d.protrusion).toBeNull();
    expect(d.headTilt).toBeNull();
  });
});

describe('desviaciones laterales', () => {
  const m = (cva: number, extra = {}) =>
    computeRawMetrics(
      { landmarks: lateralPose({ cvaDeg: cva, ...extra }), aspect: ASPECT, mode: 'lateral' },
      cfg0,
    );
  const baseline = buildBaseline([
    m(60, { hipLeanDeg: 0 }),
    m(60, { hipLeanDeg: 0 }),
    m(60, { hipLeanDeg: 0 }),
  ]);
  it('ΔCVA positivo cuando el CVA cae por debajo de la base', () => {
    expect(computeDeviations(m(52, { hipLeanDeg: 0 }), baseline).protrusion).toBeCloseTo(8, 6);
    expect(computeDeviations(m(66, { hipLeanDeg: 0 }), baseline).protrusion).toBeCloseTo(-6, 6);
  });
  it('slouch lateral solo con cadera visible; el resto de desviaciones frontales son null', () => {
    const d = computeDeviations(m(60, { hipLeanDeg: 9 }), baseline);
    expect(d.slouch).toBeCloseTo(9, 5);
    expect(computeDeviations(m(60, { hipLeanDeg: null }), baseline).slouch).toBeNull();
    expect(d.proximity).toBeNull();
    expect(d.shoulderAsymmetry).toBeNull();
  });
});

describe('estadística auxiliar', () => {
  it('mediana, σ, rms y percentil', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stdDev([1])).toBe(0);
    expect(rms([3, 4])).toBeCloseTo(Math.sqrt(12.5), 9);
    expect(rms([])).toBe(0);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe('pitch/yaw desde la matriz facial', () => {
  const matrix = (pitchDown: number, yaw: number): number[] => {
    const p = (pitchDown * Math.PI) / 180;
    const y = (yaw * Math.PI) / 180;
    const m = new Array<number>(16).fill(0);
    m[8] = Math.sin(y) * Math.cos(p);
    m[9] = -Math.sin(p);
    m[10] = Math.cos(y) * Math.cos(p);
    m[15] = 1;
    return m;
  };
  it('recupera cabeceo (+ = abajo) y guiñada', () => {
    const a = anglesFromFaceMatrix(matrix(15, 0));
    expect(a?.pitchDeg).toBeCloseTo(15, 5);
    expect(a?.yawDeg).toBeCloseTo(0, 5);
    expect(anglesFromFaceMatrix(matrix(0, 20))?.yawDeg).toBeCloseTo(20, 5);
  });
  it('rechaza matrices incompletas o no finitas', () => {
    expect(anglesFromFaceMatrix([1, 2])).toBeNull();
    const bad = matrix(0, 0);
    bad[10] = Number.NaN;
    expect(anglesFromFaceMatrix(bad)).toBeNull();
  });
});
