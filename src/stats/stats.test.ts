// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/schema';
import {
  aggregateByDay,
  aggregateByWeek,
  dayKeyOf,
  SessionRecorder,
  summarize,
  trend,
  weekKeyOf,
  type PeriodSummary,
} from './aggregate';
import { pruneStore } from './daily';
import { findForbiddenContent, migrateStore } from './migrations';
import {
  MAX_EVENTS,
  STORE_VERSION,
  defaultStore,
  emptyTotals,
  type SessionSummary,
  type Store,
} from './model';
import {
  BACKUP_KEY,
  DATA_KEY,
  eraseAll,
  exportCSV,
  exportJSON,
  loadStore,
  saveStore,
  type KeyValueStorage,
} from './storage';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../../tests/fixtures', name), 'utf8'));

class MemKV implements KeyValueStorage {
  data = new Map<string, string>();
  failNextWriteMidway = false;
  async get(k: string) {
    return this.data.get(k) ?? null;
  }
  async set(k: string, v: string) {
    if (this.failNextWriteMidway && k === DATA_KEY) {
      this.failNextWriteMidway = false;
      this.data.set(k, v.slice(0, Math.floor(v.length / 2))); // escritura no atómica a medias
      throw new Error('disco lleno');
    }
    this.data.set(k, v);
  }
  async remove(k: string) {
    this.data.delete(k);
  }
}

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  ...emptyTotals(),
  id: 'x',
  startedAt: Date.UTC(2026, 0, 5, 10),
  endedAt: Date.UTC(2026, 0, 5, 11),
  mode: 'frontal',
  hours: [],
  deviationMs: {},
  deviationActiveMs: {},
  ...over,
});

describe('migraciones', () => {
  it('migra la v1 (segundos) a la versión actual (ms) con ajustes saneados', () => {
    const res = migrateStore(fixture('store.v1.json'));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.from).toBe(1);
    expect(res.store.version).toBe(STORE_VERSION);
    expect(res.store.sessions).toHaveLength(2);
    expect(res.store.sessions[0]).toMatchObject({
      id: 'a',
      mode: 'lateral',
      okMs: 3_000_000,
      badMs: 400_000,
      absentMs: 200_000,
    });
    expect(res.store.sessions[1]?.id).toMatch(/^legacy-/);
    expect(res.store.alerts.map((a) => [a.level, a.reason])).toEqual([
      ['CRITICA', 'protrusion'],
      ['MALA_POSTURA', null],
    ]);
    expect(res.store.breaks.map((b) => b.outcome)).toEqual(['declared', 'skipped']);
    expect(res.store.settings.locale).toBe('en');
    expect(res.store.settings.fps).toBe(15);
    expect(res.store.settings.alerts.volume).toBe(0.3);
    expect(res.defaultsApplied).toContain('mode');
  });

  it('migra la v3 a la v4: contadores de parpadeo a 0 y ajuste blink desactivado', () => {
    const legacy: Record<string, unknown> = { ...session() };
    for (const k of ['blinkMs', 'blinkCount', 'lowBlinkMs']) delete legacy[k];
    const settings: Record<string, unknown> = { ...defaultStore().settings };
    delete settings.blink;
    const res = migrateStore({
      ...JSON.parse(JSON.stringify(defaultStore())),
      version: 3,
      settings,
      sessions: [legacy],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.from).toBe(3);
    expect(res.store.version).toBe(STORE_VERSION);
    expect(res.store.sessions[0]).toMatchObject({ blinkMs: 0, blinkCount: 0, lowBlinkMs: 0 });
    expect(res.store.settings.blink.enabled).toBe(false);
  });

  it('la versión actual se acepta tal cual', () => {
    const res = migrateStore(JSON.parse(JSON.stringify(defaultStore())));
    expect(res).toMatchObject({ ok: true, from: STORE_VERSION });
  });

  it('rechaza entradas no objeto, sin versión, de versión futura o sin migración', () => {
    expect(migrateStore(null)).toMatchObject({ ok: false, error: 'notAnObject' });
    expect(migrateStore([])).toMatchObject({ ok: false, error: 'notAnObject' });
    expect(migrateStore({})).toMatchObject({ ok: false, error: 'badVersion' });
    expect(migrateStore({ version: 0 })).toMatchObject({ ok: false, error: 'badVersion' });
    expect(migrateStore({ version: 1.5 })).toMatchObject({ ok: false, error: 'badVersion' });
    expect(migrateStore({ version: STORE_VERSION + 1 })).toMatchObject({ ok: false, error: 'tooNew' });
  });

  it('descarta elementos mal formados', () => {
    const res = migrateStore({
      ...defaultStore(),
      sessions: [session(), { nope: 1 }, null],
      alerts: [{ t: 'x' }],
      breaks: 7,
    });
    expect(res.ok && res.store.sessions).toHaveLength(1);
    expect(res.ok && res.store.alerts).toHaveLength(0);
    expect(res.ok && res.store.breaks).toHaveLength(0);
  });
});

describe('el esquema no admite imágenes ni landmarks', () => {
  it('detecta claves, data-URL, Blob, ImageData y buffers', () => {
    expect(findForbiddenContent({ a: { landmarks: [] } })).toBe('$.a.landmarks');
    expect(findForbiddenContent({ x: [{ image: 1 }] })).toBe('$.x[0].image');
    expect(findForbiddenContent({ v: 'data:image/png;base64,AAAA' })).toBe('$.v');
    expect(findForbiddenContent({ v: new Uint8Array(4) })).toBe('$.v');
    expect(findForbiddenContent({ v: new ArrayBuffer(4) })).toBe('$.v');
    expect(findForbiddenContent({ v: new Blob(['x']) })).toBe('$.v');
    expect(findForbiddenContent({ ok: 'texto', n: 1, arr: [1, 2], nested: { a: { b: null } } })).toBeNull();
    expect(findForbiddenContent(defaultStore())).toBeNull();
  });

  it('migrateStore y saveStore rechazan contenido prohibido', async () => {
    const bad = {
      ...defaultStore(),
      profiles: [{ id: 'p', baseline: {}, snapshot: 'data:image/png;base64,AA' }],
    };
    expect(migrateStore(bad)).toMatchObject({ ok: false, error: 'invalid' });
    const kv = new MemKV();
    await expect(saveStore(kv, bad as unknown as Store)).rejects.toThrow(/imágenes|landmarks/);
    expect(kv.data.size).toBe(0);
  });

  it('el modelo de datos no declara campos de imagen ni de landmarks', () => {
    const src = readFileSync(join(__dirname, 'model.ts'), 'utf8');
    expect(src).not.toMatch(/\b(image|imageData|landmarks?|frame|blob|dataUrl|snapshot)\s*[?:]/i);
  });
});

describe('persistencia', () => {
  it('primer arranque: almacén nuevo', async () => {
    const r = await loadStore(new MemKV());
    expect(r.status).toBe('fresh');
    expect(r.store.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('guardar y cargar ida y vuelta', async () => {
    const kv = new MemKV();
    const st = defaultStore();
    st.sessions.push(session({ okMs: 5 }));
    await saveStore(kv, st);
    const r = await loadStore(kv);
    expect(r.status).toBe('ok');
    expect(r.store.sessions[0]?.okMs).toBe(5);
  });

  it('carga datos de una versión anterior y los marca como migrados', async () => {
    const kv = new MemKV();
    kv.data.set(DATA_KEY, JSON.stringify(fixture('store.v1.json')));
    const r = await loadStore(kv);
    expect(r.status).toBe('migrated');
    expect(r.store.sessions).toHaveLength(2);
  });

  it('un fallo a mitad de escritura no pierde datos: se restaura la copia y se informa', async () => {
    const kv = new MemKV();
    const v1 = defaultStore();
    v1.sessions.push(session({ okMs: 111 }));
    await saveStore(kv, v1);
    const v2 = defaultStore();
    v2.sessions.push(session({ okMs: 222 }));
    kv.failNextWriteMidway = true;
    await expect(saveStore(kv, v2)).rejects.toThrow('disco lleno');
    const r = await loadStore(kv);
    expect(r.status).toBe('restoredFromBackup');
    expect(r.error).toBeDefined();
    expect(r.store.sessions[0]?.okMs).toBe(111);
    expect((await loadStore(kv)).status).toBe('ok'); // el principal se reparó
  });

  it('datos corruptos sin copia válida: reinicio controlado con error visible', async () => {
    const kv = new MemKV();
    kv.data.set(DATA_KEY, '{no es json');
    const r = await loadStore(kv);
    expect(r.status).toBe('reset');
    expect(r.error).toMatch(/invalid/);
    expect(r.store).toEqual(defaultStore());
    kv.data.set(BACKUP_KEY, '???');
    expect((await loadStore(kv)).status).toBe('reset');
  });

  it('versión futura: no se sobrescribe en silencio (error visible)', async () => {
    const kv = new MemKV();
    kv.data.set(DATA_KEY, JSON.stringify({ version: 99 }));
    const r = await loadStore(kv);
    expect(r.status).toBe('reset');
    expect(r.error).toMatch(/tooNew/);
  });

  it('no sobrescribe una copia válida con datos ilegibles', async () => {
    const kv = new MemKV();
    await saveStore(kv, defaultStore());
    await saveStore(kv, defaultStore());
    const good = kv.data.get(BACKUP_KEY);
    expect(good).toBeDefined();
    kv.data.set(DATA_KEY, 'basura');
    await saveStore(kv, defaultStore());
    expect(kv.data.get(BACKUP_KEY)).toBe(good);
  });

  it('borrar todos los datos elimina principal y copia', async () => {
    const kv = new MemKV();
    await saveStore(kv, defaultStore());
    await saveStore(kv, defaultStore());
    expect(kv.data.size).toBe(2);
    await eraseAll(kv);
    expect(kv.data.size).toBe(0);
  });

  it('pruneStore acota el histórico', () => {
    const st = defaultStore();
    st.alerts = Array.from({ length: MAX_EVENTS + 10 }, (_, i) => ({
      t: i,
      level: 'MALA_POSTURA' as const,
      reason: null,
    }));
    const p = pruneStore(st);
    expect(p.alerts).toHaveLength(MAX_EVENTS);
    expect(p.alerts[0]?.t).toBe(10);
  });
});

describe('exportar', () => {
  const st = defaultStore();
  st.sessions.push(session({ id: 'a,"b"', okMs: 10, badMs: 5 }));
  st.alerts.push({ t: Date.UTC(2026, 0, 5, 10, 5), level: 'CRITICA', reason: 'slouch' });
  st.breaks.push({ t: Date.UTC(2026, 0, 5, 10, 30), kind: 'micro', outcome: 'declared' });

  it('JSON conforme al esquema (se puede volver a importar)', () => {
    const back = migrateStore(JSON.parse(exportJSON(st)));
    expect(back.ok && back.store.sessions[0]?.okMs).toBe(10);
  });

  it('CSV con secciones, cabeceras y escape correcto', () => {
    const csv = exportCSV(st);
    expect(csv).toContain('# sessions');
    expect(csv).toContain('id,startedAt,endedAt,mode,okMs');
    expect(csv).toContain('notCalibratedMs,blinkMs,blinkCount,lowBlinkMs');
    expect(csv).toContain('alerts,awayCount,blinkMs,blinkCount,lowBlinkMs');
    expect(csv).toContain('"a,""b"""');
    expect(csv).toContain('2026-01-05T10:05:00.000Z,CRITICA,slouch');
    expect(csv).toContain('2026-01-05T10:30:00.000Z,micro,declared');
    expect(csv.endsWith('\n')).toBe(true);
  });
});

describe('agregación', () => {
  const st = defaultStore();
  // CET (+60): 2026-01-05 es lunes. 23:30 UTC del domingo 4 ya es lunes 5 en local.
  const sun2330utc = Date.UTC(2026, 0, 4, 23, 30);
  st.sessions.push(
    session({ startedAt: sun2330utc, okMs: 60, badMs: 40, absentMs: 7, deviationMs: { slouch: 40 } }),
    session({
      startedAt: Date.UTC(2026, 0, 5, 12),
      okMs: 100,
      mildMs: 100,
      deviationMs: { slouch: 10, headDown: 5 },
    }),
    session({ startedAt: Date.UTC(2026, 0, 6, 12), okMs: 0, absentMs: 50 }),
    session({ startedAt: Date.UTC(2026, 0, 12, 12), okMs: 90, criticalMs: 10 }),
  );
  st.alerts.push(
    { t: sun2330utc, level: 'MALA_POSTURA', reason: null },
    { t: Date.UTC(2026, 0, 6, 9), level: 'CRITICA', reason: null },
  );
  st.breaks.push(
    { t: Date.UTC(2026, 0, 5, 12), kind: 'micro', outcome: 'completed' },
    { t: Date.UTC(2026, 0, 5, 13), kind: 'micro', outcome: 'absence' },
    { t: Date.UTC(2026, 0, 5, 14), kind: 'long', outcome: 'declared' },
    { t: Date.UTC(2026, 0, 6, 14), kind: 'long', outcome: 'skipped' },
  );

  it('claves de día y semana con desfase horario', () => {
    expect(dayKeyOf(sun2330utc, 0)).toBe('2026-01-04');
    expect(dayKeyOf(sun2330utc, 60)).toBe('2026-01-05');
    expect(weekKeyOf(sun2330utc, 0)).toBe('2025-12-29');
    expect(weekKeyOf(sun2330utc, 60)).toBe('2026-01-05');
    expect(weekKeyOf(Date.UTC(2026, 0, 11, 12), 0)).toBe('2026-01-05'); // domingo ⇒ semana del lunes anterior
  });

  it('agrega por día con ratio bueno, avisos, descansos y desviaciones', () => {
    const days = aggregateByDay(st, 60);
    expect(days.map((d) => d.key)).toEqual(['2026-01-05', '2026-01-06', '2026-01-12']);
    const d5 = days[0]!;
    expect(d5.okMs).toBe(160);
    expect(d5.analysedMs).toBe(300);
    expect(d5.goodRatio).toBeCloseTo(160 / 300, 9);
    expect(d5.alerts).toBe(1);
    expect(d5.breaksCompleted).toBe(2);
    expect(d5.breaksDeclared).toBe(1);
    expect(d5.deviationMs.slouch).toBe(50);
    const d6 = days[1]!;
    expect(d6.goodRatio).toBeNull();
    expect(d6.breaksSkipped).toBe(1);
    expect(d6.alerts).toBe(1);
  });

  it('agrega por semana', () => {
    const weeks = aggregateByWeek(st, 60);
    expect(weeks.map((w) => w.key)).toEqual(['2026-01-05', '2026-01-12']);
    expect(weeks[0]?.okMs).toBe(160);
    expect(weeks[1]?.goodRatio).toBeCloseTo(0.9, 9);
  });

  it('tendencia: últimos n días frente a los n anteriores', () => {
    const mk = (r: number | null, key: string): PeriodSummary => ({
      ...summarize(key, []),
      goodRatio: r,
      reliability: r === null ? 'insufficient' : 'high',
    });
    const days = [mk(0.5, 'a'), mk(0.5, 'b'), mk(0.7, 'c'), mk(0.9, 'd')];
    expect(trend(days, 2)).toBeCloseTo(0.3, 9);
    expect(trend(days, 7)).toBeNull();
    expect(trend([mk(0.5, 'a')], 1)).toBeNull();
    expect(trend([mk(null, 'a'), mk(null, 'b')], 1)).toBeNull();
  });

  it('resultado vacío sin datos', () => {
    expect(aggregateByDay(defaultStore(), 0)).toEqual([]);
  });
});

describe('SessionRecorder', () => {
  const mk = () =>
    new SessionRecorder(
      () => 'id',
      () => 'frontal',
      0,
    );

  it('reparte el tiempo por estado, nivel y motivo', () => {
    const r = mk();
    r.add(1000, 1000, 'seated', 'OK', null);
    r.add(2000, 1000, 'seated', 'AVISO_LEVE', 'protrusion', ['protrusion']);
    r.add(3000, 2000, 'seated', 'MALA_POSTURA', 'protrusion', ['protrusion', 'slouch']);
    r.add(4000, 3000, 'seated', 'CRITICA', 'slouch', ['slouch']);
    r.add(5000, 4000, 'light', 'OK', null);
    r.add(6000, 5000, 'absent', 'OK', null);
    r.add(7000, 6000, 'nodata', 'OK', null);
    r.add(7500, 7000, 'standing', 'OK', null);
    r.add(7600, 8000, 'locked', 'OK', null);
    r.add(7700, 9000, 'paused', 'OK', null);
    r.add(7800, 10000, 'notCalibrated', 'OK', null);
    r.add(8000, 0, 'seated', 'OK', null);
    r.add(9000, -5, 'seated', 'OK', null);
    const s = r.flush(9000)!;
    expect(s).toMatchObject({
      okMs: 1000,
      mildMs: 1000,
      badMs: 2000,
      criticalMs: 3000,
      suppressedMs: 0,
      lightMs: 4000,
      absentMs: 5000,
      noDataMs: 6000,
      standingMs: 7000,
      lockedMs: 8000,
      pausedMs: 9000,
      notCalibratedMs: 10000,
      mode: 'frontal',
      endedAt: 7800,
    });
    expect(s.deviationMs).toEqual({ protrusion: 3000, slouch: 3000 });
    expect(s.deviationActiveMs).toEqual({ protrusion: 3000, slouch: 5000 });
  });

  it('registra la desviación principal también por franja horaria', () => {
    const r = mk();
    const h = 3_600_000;
    r.add(1000, 1000, 'seated', 'MALA_POSTURA', 'slouch', ['slouch']);
    r.add(h + 1000, 2000, 'seated', 'AVISO_LEVE', 'headDown', ['headDown']);
    const s = r.flush(h + 1000)!;
    expect(s.hours.find((x) => x.hour === 0)?.deviationMs).toEqual({ slouch: 1000 });
    expect(s.hours.find((x) => x.hour === 1)?.deviationMs).toEqual({ headDown: 2000 });
  });

  it('flush devuelve null si no hay datos y abre un intervalo nuevo', () => {
    const r = mk();
    expect(r.flush(10)).toBeNull();
    r.add(20, 10, 'seated', 'OK', null);
    expect(r.flush(20)?.startedAt).toBe(10);
  });
});
