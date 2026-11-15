// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { describe, expect, it } from 'vitest';
import { gaussian, mulberry32 } from '../core/testing';
import { DEFAULT_ONE_EURO, LandmarkSmoother, OneEuroFilter } from './filters';

const dt = 100; // 10 fps

describe('OneEuroFilter', () => {
  it('converge ante una señal constante', () => {
    const f = new OneEuroFilter();
    let out = 0;
    for (let i = 0; i < 50; i++) out = f.filter(5, i * dt) as number;
    expect(out).toBeCloseTo(5, 6);
  });

  it('atenúa el ruido gaussiano de σ conocida', () => {
    const rng = mulberry32(42);
    const sigma = 0.02;
    const f = new OneEuroFilter();
    const raw: number[] = [];
    const filt: number[] = [];
    for (let i = 0; i < 400; i++) {
      const v = 1 + gaussian(rng, sigma);
      raw.push(v - 1);
      if (i >= 50) filt.push((f.filter(v, i * dt) as number) - 1);
      else f.filter(v, i * dt);
    }
    const rmsOf = (a: number[]): number => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
    expect(rmsOf(filt)).toBeLessThan(rmsOf(raw.slice(50)) * 0.7);
  });

  it('responde a un escalón dentro de la latencia máxima (≤ 1 s al 90 %)', () => {
    const f = new OneEuroFilter();
    for (let i = 0; i < 20; i++) f.filter(0, i * dt);
    let reached = -1;
    for (let i = 0; i < 30; i++) {
      const y = f.filter(1, (20 + i) * dt) as number;
      if (y >= 0.9 && reached < 0) reached = i * dt;
    }
    expect(reached).toBeGreaterThanOrEqual(0);
    expect(reached).toBeLessThanOrEqual(1000);
  });

  it('descarta NaN sin alterar el estado', () => {
    const f = new OneEuroFilter();
    f.filter(1, 0);
    expect(f.filter(Number.NaN, dt)).toBeNull();
    expect(f.filter(Infinity, dt)).toBeNull();
    expect(f.filter(1, dt)).toBeCloseTo(1, 6);
  });

  it('se reinicia tras un hueco de datos o un salto atrás en el tiempo', () => {
    const f = new OneEuroFilter();
    f.filter(0, 0);
    f.filter(0, dt);
    expect(f.filter(10, dt + DEFAULT_ONE_EURO.maxGapMs + 1)).toBe(10);
    expect(f.filter(3, 0)).toBe(3);
  });
});

describe('LandmarkSmoother', () => {
  const lm = (x: number, vis: number) => ({ x, y: 0.5, visibility: vis });

  it('devuelve null para landmarks con visibilidad baja o no finitos', () => {
    const s = new LandmarkSmoother();
    const out = s.process([lm(0.1, 0.9), lm(0.2, 0.1), lm(Number.NaN, 0.9)], 0);
    expect(out[0]).not.toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
  });

  it('reinicia el filtro de un landmark tras perder visibilidad', () => {
    const s = new LandmarkSmoother();
    s.process([lm(0.1, 1)], 0);
    s.process([lm(0.1, 0)], dt);
    const out = s.process([lm(0.9, 1)], 2 * dt);
    expect(out[0]?.x).toBe(0.9);
  });

  it('reset() limpia todos los filtros', () => {
    const s = new LandmarkSmoother();
    s.process([lm(0.1, 1)], 0);
    s.reset();
    expect(s.process([lm(0.8, 1)], dt)[0]?.x).toBe(0.8);
  });
});
