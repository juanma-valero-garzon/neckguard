// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { describe, expect, it } from 'vitest';
import { ASPECT, frontalPose } from '../core/synthetic';
import { buildBaseline } from '../posture/deviations';
import { computeRawMetrics } from '../posture/metrics';
import type { Landmark } from '../core/types';
import {
  assessLighting,
  initialPresence,
  isStanding,
  poseSignature,
  selectPrimaryPerson,
  stepPresence,
  trackPrimary,
  type PresenceState,
} from './presence';

function drive(
  s: PresenceState,
  from: number,
  seconds: number,
  hasPerson: boolean,
  cameraOk = true,
): PresenceState {
  let st = s;
  for (let i = 0; i <= seconds; i++) st = stepPresence(st, { t: from + i * 1000, cameraOk, hasPerson });
  return st;
}

describe('presencia con debounce', () => {
  it('pasa a presente tras 1 s y no antes', () => {
    let s = stepPresence(initialPresence(), { t: 0, cameraOk: true, hasPerson: true });
    expect(s.status).toBe('nodata');
    s = stepPresence(s, { t: 500, cameraOk: true, hasPerson: true });
    expect(s.status).toBe('nodata');
    s = stepPresence(s, { t: 1000, cameraOk: true, hasPerson: true });
    expect(s.status).toBe('present');
  });

  it('una pérdida breve de la persona (< 3 s) no cuenta como ausencia', () => {
    let s = drive(initialPresence(), 0, 5, true);
    expect(s.status).toBe('present');
    s = drive(s, 6000, 2, false);
    expect(s.status).toBe('present');
    s = drive(s, 9000, 3, true);
    expect(s.status).toBe('present');
    expect(s.candidate).toBeNull();
  });

  it('ausente tras 3 s sin persona', () => {
    let s = drive(initialPresence(), 0, 5, true);
    s = drive(s, 6000, 3, false);
    expect(s.status).toBe('absent');
  });

  it('sin cámara ⇒ nodata inmediato (distinto de ausente)', () => {
    const s = drive(drive(initialPresence(), 0, 5, true), 6000, 0, false, false);
    expect(s.status).toBe('nodata');
  });
});

describe('iluminación', () => {
  const ok = { meanLuma: 120, centerLuma: 120, edgeLuma: 120, meanVisibility: 0.9 };
  it('clasifica poca luz, contraluz y confianza baja; si no, ok', () => {
    expect(assessLighting(ok)).toBe('ok');
    expect(assessLighting({ ...ok, meanLuma: 20 })).toBe('lowLight');
    expect(assessLighting({ ...ok, centerLuma: 50, edgeLuma: 200 })).toBe('backlit');
    expect(assessLighting({ ...ok, meanVisibility: 0.3 })).toBe('lowConfidence');
  });
});

describe('persona principal', () => {
  const big = frontalPose({ shoulderWidth: 0.5, centerX: 0.5 * ASPECT });
  const small = frontalPose({ shoulderWidth: 0.2, centerX: 0.8 * ASPECT });
  it('elige la más grande y centrada', () => {
    expect(selectPrimaryPerson([small, big], ASPECT)).toBe(1);
    expect(selectPrimaryPerson([big, small], ASPECT)).toBe(0);
  });
  it('-1 si no hay poses utilizables', () => {
    expect(selectPrimaryPerson([], ASPECT)).toBe(-1);
    const empty: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
    expect(selectPrimaryPerson([empty], ASPECT)).toBe(-1);
    expect(poseSignature(empty, ASPECT)).toBeNull();
  });
  it('usa las orejas como respaldo si faltan hombros', () => {
    const p = frontalPose({});
    p[11] = { x: 0, y: 0, visibility: 0 };
    expect(poseSignature(p, ASPECT)?.scale).toBeGreaterThan(0);
  });
  it('detecta un cambio brusco de persona (posición o tamaño) y no uno gradual', () => {
    const a = poseSignature(big, ASPECT)!;
    const b = poseSignature(small, ASPECT)!;
    let r = trackPrimary({ last: null }, a, 0);
    expect(r.jump).toBe(false);
    r = trackPrimary(r.state, { ...a, scale: a.scale * 1.1 }, 100);
    expect(r.jump).toBe(false);
    r = trackPrimary(r.state, b, 200);
    expect(r.jump).toBe(true);
    r = trackPrimary(r.state, a, 5000); // tras un hueco largo no se compara
    expect(r.jump).toBe(false);
    expect(trackPrimary(r.state, null, 6000).jump).toBe(false);
  });
});

describe('de pie', () => {
  const m = (p: Parameters<typeof frontalPose>[0]) =>
    computeRawMetrics({ landmarks: frontalPose(p), aspect: ASPECT, mode: 'frontal' });
  const baseline = buildBaseline([m({}), m({}), m({})]);
  it('hombros muy por encima de la base ⇒ de pie', () => {
    expect(isStanding(m({}), baseline)).toBe(false);
    expect(isStanding(m({ shoulderMidY: 0.78 - 0.4 * 0.7 }), baseline)).toBe(true);
  });
  it('sin base o en modo lateral ⇒ false', () => {
    expect(isStanding(m({ shoulderMidY: 0.2 }), {})).toBe(false);
    expect(isStanding({ ...m({ shoulderMidY: 0.2 }), mode: 'lateral' }, baseline)).toBe(false);
  });
});
