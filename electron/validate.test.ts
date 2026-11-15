import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_ORIGIN,
  CSP,
  clampOverlayMs,
  isTrustedUrl,
  resolveInside,
  trayIconFor,
  validNotify,
  validStorageKey,
  validStorageValue,
  validTrayCommand,
  validTraySnapshot,
} from './validate.cts';

const snap = {
  level: 'OK',
  locale: 'es',
  suppressed: null,
  paused: false,
  sittingMin: 3,
  nextBreakMin: 27,
  goodPercent: 80,
  labels: { status: 'a', sitting: 'b', nextBreak: 'c', good: '' },
};

describe('validación IPC de Electron', () => {
  it('claves de almacenamiento: solo neckguard.*', () => {
    expect(validStorageKey('neckguard.data')).toBe(true);
    expect(validStorageKey('neckguard.data.bak')).toBe(true);
    for (const k of [
      '../etc/passwd',
      'neckguard.',
      'neckguard.a/b',
      'other',
      5,
      null,
      'neckguard.' + 'x'.repeat(50),
    ]) {
      expect(validStorageKey(k)).toBe(false);
    }
    expect(validStorageValue('{}')).toBe(true);
    expect(validStorageValue(5)).toBe(false);
    expect(validStorageValue('x'.repeat(5 * 1024 * 1024 + 1))).toBe(false);
  });

  it('notificaciones: tipos y longitudes', () => {
    expect(validNotify({ title: 't', body: 'b' })).toBe(true);
    expect(validNotify({ title: 't', body: 'b', silent: true })).toBe(true);
    expect(validNotify({ title: 't', body: 'b', silent: 'x' })).toBe(false);
    expect(validNotify({ title: 'x'.repeat(121), body: 'b' })).toBe(false);
    expect(validNotify({ title: 't', body: 'x'.repeat(301) })).toBe(false);
    expect(validNotify(null)).toBe(false);
    expect(validNotify([])).toBe(false);
    expect(validNotify({ title: 1, body: 'b' })).toBe(false);
  });

  it('comandos de bandeja', () => {
    for (const c of [
      'togglePause',
      'snooze15',
      'recalibrate',
      'openWindow',
      'breakStart',
      'breakDone',
      'breakSnooze',
      'breakSkip',
    ])
      expect(validTrayCommand(c)).toBe(true);
    for (const c of ['quit', '', 1, undefined]) expect(validTrayCommand(c)).toBe(false);
  });

  it('instantánea de bandeja', () => {
    expect(validTraySnapshot(snap)).toBe(true);
    expect(validTraySnapshot({ ...snap, level: 'X' })).toBe(false);
    expect(validTraySnapshot({ ...snap, locale: 'fr' })).toBe(false);
    expect(validTraySnapshot({ ...snap, sittingMin: Number.NaN })).toBe(false);
    expect(validTraySnapshot({ ...snap, labels: { ...snap.labels, status: 'x'.repeat(201) } })).toBe(false);
    expect(validTraySnapshot({ ...snap, labels: null })).toBe(false);
    expect(validTraySnapshot({ ...snap, goodPercent: null, suppressed: 'lowLight' })).toBe(true);
    expect(validTraySnapshot('x')).toBe(false);
  });

  it('datos de la miniatura', () => {
    const mini = {
      hypervigilance: true,
      sitting: '45:00',
      sittingLabel: 'Tiempo sentado',
      meters: [{ label: 'Cabeza', text: '+3.0°', zone: 'amber', fill: 0.4, amberAt: 0.3, redAt: null }],
      remaining: '12:34',
      remainingLabel: 'Próximo descanso',
    };
    expect(validTraySnapshot({ ...snap, mini })).toBe(true);
    expect(validTraySnapshot({ ...snap, mini: { ...mini, remaining: 'x'.repeat(21) } })).toBe(false);
    expect(
      validTraySnapshot({ ...snap, mini: { ...mini, meters: [{ ...mini.meters[0], zone: 'x' }] } }),
    ).toBe(false);
    expect(validTraySnapshot({ ...snap, mini: { ...mini, meters: Array(7).fill(mini.meters[0]) } })).toBe(
      false,
    );
    expect(validTraySnapshot({ ...snap, mini: 5 })).toBe(false);
    expect(validTraySnapshot({ ...snap, mini: { ...mini, hypervigilance: 'x' } })).toBe(false);
    const breakInfo = {
      kind: 'micro',
      title: 'Microdescanso',
      body: 'Levántate',
      exercise: 'Retracción cervical',
      illustration: 'chinTuck',
      steps: ['Uno', 'Dos'],
      countdown: '1:30',
      started: false,
      snoozeMin: 5,
    };
    expect(validTraySnapshot({ ...snap, mini: { ...mini, breakInfo } })).toBe(true);
    expect(
      validTraySnapshot({ ...snap, mini: { ...mini, breakInfo: { ...breakInfo, illustration: null } } }),
    ).toBe(true);
    expect(
      validTraySnapshot({ ...snap, mini: { ...mini, breakInfo: { ...breakInfo, illustration: 'x' } } }),
    ).toBe(false);
    expect(validTraySnapshot({ ...snap, mini: { ...mini, breakInfo: { ...breakInfo, kind: 'x' } } })).toBe(
      false,
    );
    expect(
      validTraySnapshot({
        ...snap,
        mini: { ...mini, breakInfo: { ...breakInfo, steps: Array(9).fill('a') } },
      }),
    ).toBe(false);
  });

  it('overlay acotado y emisor de confianza', () => {
    expect(clampOverlayMs(10)).toBe(500);
    expect(clampOverlayMs(99_999)).toBe(8000);
    expect(clampOverlayMs(4000)).toBe(4000);
    expect(clampOverlayMs('x')).toBe(3000);
    expect(isTrustedUrl(`${APP_ORIGIN}/index.html`)).toBe(true);
    expect(isTrustedUrl(`${APP_ORIGIN}/index.html#/menubar`)).toBe(true);
    expect(isTrustedUrl(APP_ORIGIN)).toBe(true);
    for (const u of [
      'https://evil.example/',
      'app://neckguard.evil.com/',
      'file:///etc/passwd',
      undefined,
      3,
    ])
      expect(isTrustedUrl(u)).toBe(false);
  });

  it('icono de bandeja según estado', () => {
    expect(trayIconFor({ level: 'OK', suppressed: null, paused: false })).toBe('ok');
    expect(trayIconFor({ level: 'AVISO_LEVE', suppressed: null, paused: false })).toBe('warn');
    expect(trayIconFor({ level: 'CRITICA', suppressed: null, paused: false })).toBe('bad');
    expect(trayIconFor({ level: 'MALA_POSTURA', suppressed: null, paused: false })).toBe('bad');
    expect(trayIconFor({ level: 'CRITICA', suppressed: 'lowLight', paused: false })).toBe('off');
    expect(trayIconFor({ level: 'OK', suppressed: null, paused: true })).toBe('off');
    const mini = {
      hypervigilance: false,
      sitting: '',
      sittingLabel: '',
      meters: [],
      remaining: '',
      remainingLabel: '',
    };
    expect(trayIconFor({ level: 'CRITICA', suppressed: null, paused: false, mini })).toBe('off');
    expect(
      trayIconFor({ level: 'OK', suppressed: null, paused: false, mini: { ...mini, hypervigilance: true } }),
    ).toBe('ok');
  });

  it('el protocolo no permite salir del directorio de la app', () => {
    const root = '/app/dist';
    const r = (p: string) => resolveInside(root, p, join, sep);
    expect(r('/')).toBe('/app/dist/index.html');
    expect(r('/assets/a.js')).toBe('/app/dist/assets/a.js');
    expect(r('/../secret')).toBeNull();
    expect(r('/assets/../../secret')).toBeNull();
    expect(r('/%2e%2e/secret')).toBeNull();
    expect(r('/a%00b')).toBeNull();
    expect(r('/%E0%A4%A')).toBeNull();
  });

  it('la CSP permite WASM y bloquea el resto', () => {
    expect(CSP).toContain("'wasm-unsafe-eval'");
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).not.toMatch(/'unsafe-inline'|'unsafe-eval'|https?:/);
  });
});
