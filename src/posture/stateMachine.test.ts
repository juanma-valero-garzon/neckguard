// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { gaussian, mulberry32 } from '../core/testing';
import type { DeviationId } from '../core/types';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import { classify, effectiveThresholds, type ZoneReading, type ZoneReadings } from './classifier';
import { emptyDeviations } from './deviations';
import { initialMachineState, stepMachine, type MachineState, type StateMachineConfig } from './stateMachine';

const sm = CLINICAL_CONFIG.stateMachine;
const cfg: StateMachineConfig = {
  mildAfterAmberMs: sm.mildAfterAmberMs.value,
  badAfterRedMs: sm.badAfterRedMs.value,
  badAfterAmberMs: sm.badAfterAmberMs.value,
  criticalAfterRedMs: sm.criticalAfterRedMs.value,
  exitGreenMs: sm.exitGreenMs.value,
  maxGapMs: sm.maxGapMs.value,
};

const amber: ZoneReading = { zone: 'amber', value: 6, exitGreen: false };
const red: ZoneReading = { zone: 'red', value: 12, exitGreen: false };
const green: ZoneReading = { zone: 'green', value: 0, exitGreen: true };
const neutral: ZoneReading = { zone: 'green', value: 4.5, exitGreen: false };

/** Simula `seconds` segundos a 1 Hz con una lectura por desviación. */
function run(
  state: MachineState,
  from: number,
  seconds: number,
  readings: ZoneReadings,
  active = true,
): { state: MachineState; t: number; level: string; reason: DeviationId | null } {
  let t = from;
  let last = stepMachine(state, { t, readings, active }, cfg);
  let s = last.state;
  for (let i = 0; i < seconds; i++) {
    t += 1000;
    last = stepMachine(s, { t, readings, active }, cfg);
    s = last.state;
  }
  return { state: s, t, level: last.level, reason: last.reason };
}

describe('máquina de estados de postura', () => {
  it('OK → AVISO_LEVE a los 10 s en ámbar', () => {
    let r = run(initialMachineState(), 0, 9, { protrusion: amber });
    expect(r.level).toBe('OK');
    r = run(r.state, r.t, 1, { protrusion: amber });
    expect(r.level).toBe('AVISO_LEVE');
  });

  it('→ MALA_POSTURA a los 20 s en rojo', () => {
    const r = run(initialMachineState(), 0, 20, { protrusion: red });
    expect(r.level).toBe('MALA_POSTURA');
  });

  it('→ MALA_POSTURA a los 2 min en ámbar', () => {
    expect(run(initialMachineState(), 0, 119, { headDown: amber }).level).toBe('AVISO_LEVE');
    expect(run(initialMachineState(), 0, 120, { headDown: amber }).level).toBe('MALA_POSTURA');
  });

  it('→ CRITICA a los 5 min en rojo, y no antes', () => {
    expect(run(initialMachineState(), 0, 299, { protrusion: red }).level).toBe('MALA_POSTURA');
    expect(run(initialMachineState(), 0, 300, { protrusion: red }).level).toBe('CRITICA');
  });

  it('una desviación puntual menor que N s no cambia el estado', () => {
    let r = run(initialMachineState(), 0, 8, { protrusion: red });
    r = run(r.state, r.t, 30, { protrusion: green });
    expect(r.level).toBe('OK');
    r = run(r.state, r.t, 8, { protrusion: amber });
    expect(r.level).toBe('OK');
  });

  it('histéresis: salida a OK solo tras ≥ 5 s en verde con margen', () => {
    let r = run(initialMachineState(), 0, 20, { protrusion: red });
    expect(r.level).toBe('MALA_POSTURA');
    r = run(r.state, r.t, 30, { protrusion: neutral }); // verde sin margen: no sale
    expect(r.level).toBe('MALA_POSTURA');
    r = run(r.state, r.t, 4, { protrusion: green });
    expect(r.level).toBe('MALA_POSTURA');
    r = run(r.state, r.t, 1, { protrusion: green });
    expect(r.level).toBe('OK');
  });

  it('un blip por fuera del verde reinicia el conteo de salida', () => {
    let r = run(initialMachineState(), 0, 20, { protrusion: red });
    r = run(r.state, r.t, 4, { protrusion: green });
    r = run(r.state, r.t, 1, { protrusion: neutral });
    r = run(r.state, r.t, 4, { protrusion: green });
    expect(r.level).toBe('MALA_POSTURA');
  });

  it('cada desviación tiene estado propio; global = más grave; un solo mensaje por prioridad', () => {
    const r = run(initialMachineState(), 0, 20, { slouch: red, headTilt: red, headDown: amber });
    expect(r.level).toBe('MALA_POSTURA');
    expect(r.reason).toBe('slouch'); // prioridad: slouch antes que headTilt
    const out = stepMachine(
      r.state,
      { t: r.t + 1000, readings: { slouch: red, headTilt: red, headDown: amber }, active: true },
      cfg,
    );
    expect(out.levels.headDown).toBe('AVISO_LEVE');
    expect(out.levels.protrusion).toBe('OK');
  });

  it('la protrusión prevalece sobre otras desviaciones del mismo nivel', () => {
    const r = run(initialMachineState(), 0, 20, { headTilt: red, protrusion: red });
    expect(r.reason).toBe('protrusion');
  });

  it('es pura: mismas entradas ⇒ misma salida y no muta la entrada', () => {
    const s0 = initialMachineState();
    const snapshot = JSON.stringify(s0);
    const input = { t: 1000, readings: { protrusion: amber }, active: true };
    const a = stepMachine(s0, input, cfg);
    const b = stepMachine(s0, input, cfg);
    expect(a).toEqual(b);
    expect(JSON.stringify(s0)).toBe(snapshot);
    expect(a.state).not.toBe(s0);
  });

  it('un salto grande de tiempo (suspensión) reinicia los cronómetros sin error', () => {
    let r = run(initialMachineState(), 0, 9, { protrusion: amber });
    const jumped = stepMachine(
      r.state,
      { t: r.t + 3_600_000, readings: { protrusion: amber }, active: true },
      cfg,
    );
    expect(jumped.level).toBe('OK');
    r = run(jumped.state, r.t + 3_600_000, 9, { protrusion: amber });
    expect(r.level).toBe('OK');
  });

  it('marcas de tiempo no monótonas o no finitas se ignoran', () => {
    const r = run(initialMachineState(), 0, 12, { protrusion: amber });
    const back = stepMachine(r.state, { t: r.t - 5000, readings: { protrusion: green }, active: true }, cfg);
    expect(back.level).toBe('AVISO_LEVE');
    expect(back.state).toBe(r.state);
    expect(stepMachine(r.state, { t: Number.NaN, readings: {}, active: true }, cfg).level).toBe('AVISO_LEVE');
  });

  it('con datos inactivos (poca luz) se congelan los cronómetros y no se escala', () => {
    let r = run(initialMachineState(), 0, 5, { protrusion: amber });
    r = run(r.state, r.t, 600, { protrusion: amber }, false);
    expect(r.level).toBe('OK');
    r = run(r.state, r.t, 9, { protrusion: amber });
    expect(r.level).toBe('OK');
  });

  it('una lectura null (no medible) mantiene el nivel pero reinicia los cronómetros', () => {
    let r = run(initialMachineState(), 0, 12, { protrusion: amber });
    expect(r.level).toBe('AVISO_LEVE');
    r = run(r.state, r.t, 100, { protrusion: null });
    expect(r.level).toBe('AVISO_LEVE');
  });

  it('el nivel nunca baja salvo por verde sostenido (ámbar tras rojo conserva el nivel)', () => {
    let r = run(initialMachineState(), 0, 20, { protrusion: red });
    r = run(r.state, r.t, 10, { protrusion: amber });
    expect(r.level).toBe('MALA_POSTURA');
  });
});

describe('máquina de estados (propiedades)', () => {
  const th = effectiveThresholds('lateral', CLINICAL_CONFIG, {});
  const noisy = (center: number, sigma: number, seed: number, steps: number) => {
    const rng = mulberry32(seed);
    let s = initialMachineState();
    const levels: string[] = [];
    for (let i = 1; i <= steps; i++) {
      const v = center + gaussian(rng, sigma);
      const readings = classify({ ...emptyDeviations(), protrusion: v }, th, 0.2);
      const o = stepMachine(s, { t: i * 1000, readings, active: true }, cfg);
      s = o.state;
      levels.push(o.level);
    }
    return levels;
  };

  it('ruido ≤ σ alrededor de un valor en verde ⇒ sin transiciones', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), (seed) => {
        const levels = noisy(0, 0.8, seed, 600);
        expect(levels.every((l) => l === 'OK')).toBe(true);
      }),
      { numRuns: 25 },
    );
  });

  it('ruido alrededor del umbral: las oscilaciones quedan acotadas', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), (seed) => {
        const levels = noisy(5, 1.0, seed, 900);
        let transitions = 0;
        for (let i = 1; i < levels.length; i++) if (levels[i] !== levels[i - 1]) transitions++;
        expect(transitions).toBeLessThanOrEqual(6);
      }),
      { numRuns: 25 },
    );
  });

  it('es reproducible con la misma semilla', () => {
    expect(noisy(5, 1, 7, 300)).toEqual(noisy(5, 1, 7, 300));
  });
});
