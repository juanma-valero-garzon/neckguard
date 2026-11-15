// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { describe, expect, it } from 'vitest';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import { classify, effectiveThresholds, informativeCva } from './classifier';
import { emptyDeviations } from './deviations';

describe('effectiveThresholds', () => {
  it('sin ruido usa los umbrales configurados', () => {
    const t = effectiveThresholds('lateral', CLINICAL_CONFIG, {});
    expect(t.protrusion).toMatchObject({ amber: 5, red: 10, noiseFloorApplied: false });
  });

  it('umbral efectivo = máx(config, 2σ) y conserva la separación ámbar-rojo', () => {
    const t = effectiveThresholds('lateral', CLINICAL_CONFIG, { protrusion: 4 });
    expect(t.protrusion?.amber).toBe(8);
    expect(t.protrusion?.red).toBe(13);
    expect(t.protrusion?.noiseFloorApplied).toBe(true);
  });

  it('la escala de sensibilidad multiplica los umbrales', () => {
    const t = effectiveThresholds('frontal', CLINICAL_CONFIG, {}, 0.8);
    expect(t.protrusion?.amber).toBeCloseTo(4.8, 9);
    expect(t.protrusion?.red).toBeCloseTo(9.6, 9);
  });

  it('modo lateral solo define las desviaciones medibles', () => {
    const t = effectiveThresholds('lateral', CLINICAL_CONFIG, {});
    expect(Object.keys(t).sort()).toEqual(['headDown', 'protrusion', 'slouch']);
  });
});

describe('classify', () => {
  const th = effectiveThresholds('lateral', CLINICAL_CONFIG, {});
  const run = (v: number | null) => classify({ ...emptyDeviations(), protrusion: v }, th, 0.2).protrusion;

  it('valores exactamente en el límite pertenecen a la zona superior', () => {
    expect(run(4.999)?.zone).toBe('green');
    expect(run(5)?.zone).toBe('amber');
    expect(run(9.999)?.zone).toBe('amber');
    expect(run(10)?.zone).toBe('red');
  });

  it('verde de salida solo con el margen del 20 % por dentro del ámbar', () => {
    expect(run(3.9)?.exitGreen).toBe(true);
    expect(run(4)?.exitGreen).toBe(false);
    expect(run(4.5)?.exitGreen).toBe(false);
    expect(run(-3)?.exitGreen).toBe(true);
  });

  it('null / NaN / desviación sin umbral ⇒ null', () => {
    expect(run(null)).toBeNull();
    expect(run(Number.NaN)).toBeNull();
    expect(classify({ ...emptyDeviations(), proximity: 50 }, th, 0.2).proximity).toBeNull();
  });
});

describe('informativeCva', () => {
  it('es solo referencia: below / within / above', () => {
    expect(informativeCva(40, [48, 50])?.relation).toBe('below');
    expect(informativeCva(49, [48, 50])?.relation).toBe('within');
    expect(informativeCva(60, [48, 50])?.relation).toBe('above');
    expect(informativeCva(null, [48, 50])).toBeNull();
    expect(informativeCva(Number.NaN, [48, 50])).toBeNull();
  });
});
