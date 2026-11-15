// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { describe, expect, it, vi } from 'vitest';
import { backoffMs, classifyCameraError, pickDevice } from './errors';

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['PermissionDeniedError', 'denied'],
    ['SecurityError', 'insecure'],
    ['NotFoundError', 'notFound'],
    ['DevicesNotFoundError', 'notFound'],
    ['NotReadableError', 'busy'],
    ['TrackStartError', 'busy'],
    ['AbortError', 'busy'],
    ['OverconstrainedError', 'overconstrained'],
    ['ConstraintNotSatisfiedError', 'overconstrained'],
    ['Whatever', 'unknown'],
  ])('%s ⇒ %s', (name, kind) => {
    expect(classifyCameraError({ name })).toBe(kind);
  });
  it('entradas no tipo error ⇒ unknown', () => {
    expect(classifyCameraError(null)).toBe('unknown');
    expect(classifyCameraError('x')).toBe('unknown');
    expect(classifyCameraError(new DOMException('x', 'NotReadableError'))).toBe('busy');
  });
});

describe('backoffMs', () => {
  it('1 s, 2 s, 4 s … acotado a 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map((n) => backoffMs(n))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
    expect(backoffMs(-3)).toBe(1000);
  });
});

describe('pickDevice', () => {
  const devs = [
    { deviceId: 'a', label: 'FaceTime HD' },
    { deviceId: 'b', label: 'USB Cam' },
  ];
  it('por deviceId guardado', () => {
    expect(pickDevice(devs, { deviceId: 'b', label: '' })).toEqual({ device: devs[1], matched: true });
  });
  it('respaldo por etiqueta si el deviceId cambió', () => {
    expect(pickDevice(devs, { deviceId: 'zzz', label: 'USB Cam' })).toEqual({
      device: devs[1],
      matched: true,
    });
  });
  it('si no coincide devuelve la primera marcando matched=false (exige calibrar)', () => {
    expect(pickDevice(devs, { deviceId: 'zzz', label: 'otra' })).toEqual({ device: devs[0], matched: false });
  });
  it('sin preferencia guardada usa la primera como coincidencia', () => {
    expect(pickDevice(devs, { deviceId: '', label: '' })).toEqual({ device: devs[0], matched: true });
  });
  it('sin dispositivos', () => {
    expect(pickDevice([], { deviceId: 'a', label: '' })).toEqual({ device: null, matched: false });
    vi.restoreAllMocks();
  });
});
