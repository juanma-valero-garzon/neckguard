import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASPECT, frontalPose } from './core/synthetic';
import { FakeClock, gaussian, mulberry32 } from './core/testing';
import { PostureEngine } from './engine/engine';
import { CLINICAL_CONFIG } from './settings/clinical-config';
import { DEFAULT_SETTINGS } from './settings/schema';
import { defaultStore } from './stats/model';
import { findForbiddenContent } from './stats/migrations';
import { exportCSV, exportJSON, saveStore, type KeyValueStorage } from './stats/storage';

describe('privacidad: sin red y sin imágenes', () => {
  const net = {
    fetch: vi.fn(() => {
      throw new Error('fetch prohibido');
    }),
    xhr: vi.fn(() => {
      throw new Error('XHR prohibido');
    }),
    ws: vi.fn(() => {
      throw new Error('WebSocket prohibido');
    }),
    beacon: vi.fn(() => {
      throw new Error('sendBeacon prohibido');
    }),
  };
  beforeEach(() => {
    vi.stubGlobal('fetch', net.fetch);
    vi.stubGlobal('XMLHttpRequest', net.xhr);
    vi.stubGlobal('WebSocket', net.ws);
    vi.stubGlobal('navigator', { sendBeacon: net.beacon });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.values(net).forEach((m) => m.mockClear());
  });

  it('una sesión completa (calibrar, avisar, descansos, guardar, exportar) no usa la red ni guarda imágenes', async () => {
    const clock = new FakeClock(0);
    const writes: string[] = [];
    const kv: KeyValueStorage = {
      get: async () => null,
      set: async (_k, v) => void writes.push(v),
      remove: async () => undefined,
    };
    const store = defaultStore();
    const engine = new PostureEngine(
      {
        clock,
        clinical: CLINICAL_CONFIG,
        idGen: () => 'id',
        utcOffsetMin: () => 0,
        events: {
          onSummary: (s) => store.sessions.push(s),
          onBreakRecord: (r) => store.breaks.push(r),
          onAlertRecord: (r) => store.alerts.push(r),
        },
      },
      DEFAULT_SETTINGS,
    );
    const rng = mulberry32(1);
    const feed = (sec: number, p = {}, fps = 5): void => {
      for (let i = 0; i < sec * fps; i++) {
        clock.advance(1000 / fps);
        engine.processFrame({
          t: clock.nowMs(),
          poses: [
            frontalPose({
              faceScale: 0.1 * (1 + gaussian(rng, 0.002)),
              shoulderWidth: 0.4 * (1 + gaussian(rng, 0.002)),
              ...p,
            }),
          ],
          aspect: ASPECT,
        });
      }
    };
    engine.startCalibration();
    feed(8);
    const { profile } = engine.finishCalibration({ deviceId: 'd', deviceLabel: 'cam' });
    expect(profile).not.toBeNull();
    store.profiles.push(profile!);
    feed(60, { faceScale: 0.12 });
    feed(35 * 60, {}, 1);
    engine.flushStats();
    await saveStore(kv, store);
    exportJSON(store);
    exportCSV(store);

    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w).not.toMatch(/data:|ImageData|Blob|landmarks/i);
      expect(findForbiddenContent(JSON.parse(w))).toBeNull();
    }
    for (const m of Object.values(net)) expect(m).not.toHaveBeenCalled();
  });

  it('el código fuente no contiene URLs externas ni llamadas de red fuera de las capas permitidas', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(join(dir, e.name))
          : /\.(ts|tsx|css)$/.test(e.name) && !/\.test\./.test(e.name)
            ? [join(dir, e.name)]
            : [],
      );
    const root = join(__dirname);
    const offenders: string[] = [];
    for (const f of walk(root)) {
      const src = readFileSync(f, 'utf8');
      if (/https?:\/\//.test(src.replace(/\/\/.*$/gm, ''))) offenders.push(`${f}: URL`);
      if (
        /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b\s*[(.]|new\s+(WebSocket|XMLHttpRequest|EventSource)/.test(
          src.replace(/\/\/.*$/gm, ''),
        )
      ) {
        offenders.push(`${f}: red`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('el HTML de producción no referencia recursos remotos', () => {
    const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
    expect(html).not.toMatch(/https?:\/\//);
  });
});
