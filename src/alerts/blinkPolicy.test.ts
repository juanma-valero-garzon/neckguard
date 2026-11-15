// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { describe, expect, it } from 'vitest';
import type { BlinkAlertInput } from './blinkPolicy';
import { initialBlinkAlertState, stepBlinkAlert } from './blinkPolicy';

const MIN = 60_000;
const CFG = { lowBelowPerMin: 10, sustainedLowMs: 3 * MIN, cooldownMs: 20 * MIN };
const inp = (over: Partial<BlinkAlertInput>): BlinkAlertInput => ({
  t: 0,
  ratePerMin: 5,
  localMinutes: 12 * 60,
  dnd: false,
  snoozed: false,
  quiet: { enabled: false, startMin: 22 * 60, endMin: 7 * 60 },
  ...over,
});

describe('stepBlinkAlert', () => {
  it('avisa solo tras mantener la frecuencia baja el tiempo exigido', () => {
    let r = stepBlinkAlert(initialBlinkAlertState(), inp({ t: 0 }), CFG);
    expect(r.fire).toBe(false);
    r = stepBlinkAlert(r.state, inp({ t: 3 * MIN - 1 }), CFG);
    expect(r.fire).toBe(false);
    r = stepBlinkAlert(r.state, inp({ t: 3 * MIN }), CFG);
    expect(r.fire).toBe(true);
  });

  it('una frecuencia normal o sin medida reinicia la cuenta', () => {
    let r = stepBlinkAlert(initialBlinkAlertState(), inp({ t: 0 }), CFG);
    r = stepBlinkAlert(r.state, inp({ t: 2 * MIN, ratePerMin: 16 }), CFG);
    expect(r.state.lowSince).toBeNull();
    r = stepBlinkAlert(r.state, inp({ t: 3 * MIN }), CFG);
    r = stepBlinkAlert(r.state, inp({ t: 4 * MIN, ratePerMin: null }), CFG);
    expect(r.state.lowSince).toBeNull();
    expect(r.fire).toBe(false);
  });

  it('respeta el enfriamiento', () => {
    let r = stepBlinkAlert({ lowSince: 0, lastAt: null }, inp({ t: 3 * MIN }), CFG);
    expect(r.fire).toBe(true);
    r = stepBlinkAlert(r.state, inp({ t: 22 * MIN }), CFG);
    expect(r.fire).toBe(false);
    r = stepBlinkAlert(r.state, inp({ t: 23 * MIN }), CFG);
    expect(r.fire).toBe(true);
  });

  it.each([
    ['DND', { dnd: true }],
    ['posponer', { snoozed: true }],
    ['horario silencioso', { quiet: { enabled: true, startMin: 11 * 60, endMin: 13 * 60 } }],
  ])('no avisa con %s', (_n, over) => {
    const r = stepBlinkAlert({ lowSince: 0, lastAt: null }, inp({ t: 10 * MIN, ...over }), CFG);
    expect(r.fire).toBe(false);
  });
});
