// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { describe, expect, it } from 'vitest';
import { ASPECT, frontalPose, lateralPose, type FrontalParams } from '../core/synthetic';
import { FakeClock, gaussian, mulberry32 } from '../core/testing';
import type { AlertAction } from '../alerts/policy';
import type { BreakEvent } from '../breaks/timers';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import { DEFAULT_SETTINGS, type Settings } from '../settings/schema';
import type { AlertEvent, AwayEpisode, BreakRecord, SessionSummary, SittingBlock } from '../stats/model';
import { BLINK_MIN_FPS, PostureEngine, type EngineSnapshot } from './engine';

function setup(settingsOver: Partial<Settings> = {}) {
  const clock = new FakeClock(0);
  const alerts: AlertAction[][] = [];
  const breaks: BreakEvent[][] = [];
  const records: BreakRecord[] = [];
  const alertRecords: unknown[] = [];
  const summaries: SessionSummary[] = [];
  const away: AwayEpisode[] = [];
  const blocks: SittingBlock[] = [];
  const alertUpdates: Pick<AlertEvent, 't' | 'recoveredMs' | 'ignored'>[] = [];
  let n = 0;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...settingsOver };
  const engine = new PostureEngine(
    {
      clock,
      clinical: CLINICAL_CONFIG,
      idGen: () => `s${n++}`,
      utcOffsetMin: () => 60,
      events: {
        onAlerts: (a) => alerts.push(a),
        onBreaks: (e) => breaks.push(e),
        onBreakRecord: (r) => records.push(r),
        onAlertRecord: (r) => alertRecords.push(r),
        onSummary: (s) => summaries.push(s),
        onAway: (e) => away.push(e),
        onBlock: (b) => blocks.push(b),
        onAlertUpdate: (u) => alertUpdates.push(u),
      },
    },
    settings,
  );
  const rng = mulberry32(5);
  const feed = (
    seconds: number,
    p: FrontalParams | null,
    opts: {
      fps?: number;
      noise?: number;
      lighting?: { meanLuma: number; centerLuma: number; edgeLuma: number };
      blink?: (tMs: number) => number | null;
    } = {},
  ): EngineSnapshot => {
    const fps = opts.fps ?? 10;
    let snap!: EngineSnapshot;
    for (let i = 0; i < seconds * fps; i++) {
      clock.advance(1000 / fps);
      const noise = opts.noise ?? 0.002;
      const poses =
        p === null
          ? []
          : [
              frontalPose({
                ...p,
                faceScale: (p.faceScale ?? 0.1) * (1 + gaussian(rng, noise)),
                shoulderWidth: (p.shoulderWidth ?? 0.4) * (1 + gaussian(rng, noise)),
              }),
            ];
      snap = engine.processFrame({
        t: clock.nowMs(),
        poses,
        aspect: ASPECT,
        lighting: opts.lighting ?? null,
        blink: opts.blink?.(clock.nowMs()) ?? null,
      });
    }
    return snap;
  };
  const calibrate = (): void => {
    engine.startCalibration();
    feed(5, {});
    const { result } = engine.finishCalibration({ deviceId: 'cam1', deviceLabel: 'FaceTime' });
    if (!result.ok) throw new Error(`calibración falló: ${result.reason} ${result.detail ?? ''}`);
  };
  return {
    engine,
    clock,
    feed,
    calibrate,
    alerts,
    breaks,
    records,
    alertRecords,
    summaries,
    away,
    blocks,
    alertUpdates,
  };
}

const BAD: FrontalParams = { faceScale: 0.118 }; // +18 % de escala facial ⇒ zona roja

describe('engine: flujo completo (modo frontal)', () => {
  it('sin calibración no avisa y lo indica', () => {
    const t = setup();
    const snap = t.feed(30, BAD);
    expect(snap.suppressed).toBe('notCalibrated');
    expect(snap.level).toBe('OK');
    expect(t.alerts).toEqual([]);
  });

  it('calibra, detecta protrusión sostenida, avisa con tono + notificación y da refuerzo al corregir', () => {
    const t = setup();
    t.calibrate();
    expect(t.feed(10, {}).level).toBe('OK');
    let snap = t.feed(15, BAD);
    expect(snap.level).toBe('AVISO_LEVE'); // ≥ 10 s y < 20 s en rojo: solo aviso leve (sin sonido)
    expect(t.alerts).toEqual([]);
    snap = t.feed(10, BAD);
    expect(snap.level).toBe('MALA_POSTURA');
    expect(snap.reason).toBe('protrusion');
    const first = t.alerts.flat();
    expect(first.map((a) => a.kind)).toEqual(['sound', 'notification']);
    expect(t.alertRecords).toHaveLength(1);

    snap = t.feed(8, {});
    expect(snap.level).toBe('OK');
    expect(t.alerts.flat().some((a) => a.kind === 'positive')).toBe(true);
  });

  it('una desviación breve no genera aviso', () => {
    const t = setup();
    t.calibrate();
    t.feed(10, {});
    t.feed(6, BAD);
    t.feed(30, {});
    expect(t.alerts).toEqual([]);
  });

  it('poca luz suspende los avisos de postura (sin falsos positivos)', () => {
    const t = setup();
    t.calibrate();
    t.feed(5, {});
    const snap = t.feed(40, BAD, { lighting: { meanLuma: 8, centerLuma: 8, edgeLuma: 8 } });
    expect(snap.suppressed).toBe('lowLight');
    expect(snap.indicator).toBe('OK');
    expect(t.alerts).toEqual([]);
  });

  it('calibración inválida (movimiento) se rechaza con motivo', () => {
    const t = setup();
    t.engine.startCalibration();
    for (let i = 0; i < 60; i++) {
      t.clock.advance(100);
      t.engine.processFrame({
        t: t.clock.nowMs(),
        poses: [frontalPose({ shoulderMidY: 0.78 + (i % 10) * 0.01 })],
        aspect: ASPECT,
      });
    }
    const { result, profile } = t.engine.finishCalibration({ deviceId: 'x', deviceLabel: 'y' });
    expect(result).toMatchObject({ ok: false, reason: 'excessiveMovement' });
    expect(profile).toBeNull();
    expect(t.engine.getProfile()).toBeNull();
    expect(t.engine.finishCalibration({ deviceId: 'x', deviceLabel: 'y' }).result).toEqual({
      ok: false,
      reason: 'tooFewSamples',
    });
  });

  it('cancelar calibración y cambiar de modo descarta el perfil', () => {
    const t = setup();
    t.engine.startCalibration();
    t.engine.cancelCalibration();
    t.calibrate();
    expect(t.engine.getProfile()?.mode).toBe('frontal');
    t.engine.configure({ ...DEFAULT_SETTINGS, mode: 'lateral' });
    expect(t.engine.getProfile()).toBeNull();
  });
});

describe('engine: descansos y presencia', () => {
  it('avisa del descanso a los 30 min, y la ausencia de 3 min lo reinicia y lo registra', () => {
    const t = setup();
    t.calibrate();
    let snap = t.feed(31 * 60, {}, { fps: 2 });
    expect(t.breaks.flat().some((e) => e.type === 'due' && e.kind === 'micro')).toBe(true);
    expect(snap.breaks.pending).toBe('micro');
    snap = t.feed(4 * 60, null, { fps: 2 });
    expect(snap.presence).toBe('absent');
    expect(t.records.at(-1)).toMatchObject({ outcome: 'absence' });
    expect(snap.breaks.pending).toBeNull();
    expect(snap.breaks.sittingMs).toBe(0);
  });

  it('"Hecho" sin ausencia = declarado; con ejercicio = cumplido', () => {
    const t = setup();
    t.calibrate();
    t.feed(31 * 60, {}, { fps: 1 });
    expect(t.engine.finishBreak('micro', 'done')).toBe('declared');
    t.feed(31 * 60, {}, { fps: 1 });
    t.engine.exerciseDone();
    expect(t.engine.finishBreak('micro', 'done')).toBe('completed');
    t.engine.snoozeBreak('micro');
    expect(t.records.map((r) => r.outcome)).toEqual(['declared', 'completed']);
  });

  it('sittingMs usa el contador del descanso más próximo (mínimo de micro y long)', () => {
    const t = setup();
    t.calibrate();
    // Justo después de 30 min: micro vence
    let snap = t.feed(30 * 60, {}, { fps: 1 });
    expect(snap.breaks.nextKind).toBe('micro');
    // Ambos acumuladores están en ~30min
    const sittingAt30min = snap.breaks.sittingMs;
    expect(sittingAt30min).toBeGreaterThanOrEqual(29 * 60 * 1000);
    expect(sittingAt30min).toBeLessThanOrEqual(31 * 60 * 1000);
    
    // Después de hacer un micro: sittingMs debe bajar significativamente
    t.engine.finishBreak('micro', 'done');
    snap = t.feed(1 * 60, {}, { fps: 1 });
    // Ahora:
    // - micro fue reiniciado, así que = ~1min
    // - long continúa, así que = ~31min
    // - nextKind será 'micro' porque falta menos para el micro (29 min) que para largo (24 min)
    // Espera, 55 - 31 = 24 min para largo. 30 - 1 = 29 min para micro. Así que long será primero.
    // Lo importante es que el mínimo sea ~1min, no ~31min
    const sittingAfterMicro = snap.breaks.sittingMs;
    expect(sittingAfterMicro).toBeLessThan(2 * 60 * 1000);
    expect(sittingAfterMicro).toBeGreaterThan(0);
    // Este valor debe ser mucho menor que el de antes (demostración del fix)
    expect(sittingAfterMicro).toBeLessThan(sittingAt30min / 10);
  });

  it('sin fotogramas (cámara tapada o desconectada) ⇒ "sin datos": el contador se pausa', () => {
    const t = setup();
    t.calibrate();
    const before = t.feed(10 * 60, {}, { fps: 2 }).breaks.sittingMs;
    for (let i = 0; i < 600; i++) {
      t.clock.advance(1000);
      t.engine.tick(t.clock.nowMs());
    }
    const snap = t.engine.getSnapshot();
    expect(snap.presence).toBe('nodata');
    expect(snap.breaks.sittingMs).toBeLessThan(before + 10_000);
  });

  it('bloqueo de pantalla cuenta como ausencia y reduce los fps sugeridos', () => {
    const t = setup();
    t.calibrate();
    t.feed(10 * 60, {}, { fps: 2 });
    t.engine.setSystemState('locked');
    for (let i = 0; i < 200; i++) {
      t.clock.advance(1000);
      t.engine.tick(t.clock.nowMs());
    }
    const snap = t.engine.getSnapshot();
    expect(snap.breaks.sittingMs).toBe(0);
    expect(snap.suppressed).toBe('locked');
    expect(snap.suggestedFps).toBe(1);
  });

  it('modo ahorro: baja los fps tras 2 min en buena postura y los sube al ver problemas; ausente ⇒ 2', () => {
    const t = setup();
    t.calibrate();
    expect(t.feed(30, {}).suggestedFps).toBe(DEFAULT_SETTINGS.fps);
    expect(t.feed(130, {}).suggestedFps).toBe(6);
    expect(t.feed(6, null).suggestedFps).toBeLessThanOrEqual(6);
    expect(t.feed(10, null).suggestedFps).toBe(2);
  });

  it('pausa del usuario ⇒ sin datos y fps mínimos', () => {
    const t = setup();
    t.calibrate();
    t.feed(5, {});
    t.engine.setPaused(true);
    t.clock.advance(5000);
    const snap = t.engine.tick(t.clock.nowMs());
    expect(snap.suppressed).toBe('paused');
    expect(snap.suggestedFps).toBe(1);
  });
});

describe('engine: ausencias en las estadísticas', () => {
  it('la ausencia no cuenta como postura: se registra aparte, como episodio y sin cortar el bloque sentado', () => {
    const t = setup();
    t.calibrate();
    t.feed(10 * 60, {}, { fps: 2 });
    t.feed(2 * 60, null, { fps: 2 });
    t.feed(10 * 60, {}, { fps: 2 });
    t.engine.closeStats();
    const sum = (k: 'okMs' | 'absentMs' | 'badMs' | 'criticalMs' | 'mildMs'): number =>
      t.summaries.reduce((a, s) => a + s[k], 0);
    expect(sum('absentMs')).toBeGreaterThan(100_000);
    expect(sum('absentMs')).toBeLessThan(125_000);
    expect(sum('badMs') + sum('criticalMs') + sum('mildMs')).toBe(0);
    expect(t.away).toHaveLength(1);
    expect(t.away[0]).toMatchObject({ kind: 'absent' });
    expect(t.away[0]!.durMs).toBeGreaterThan(100_000);
    expect(t.blocks).toHaveLength(1);
    expect(t.blocks[0]!.durMs).toBeGreaterThan(19 * 60_000);
  });

  it('una ausencia de 3 min o más corta el bloque sentado', () => {
    const t = setup();
    t.calibrate();
    t.feed(10 * 60, {}, { fps: 2 });
    t.feed(4 * 60, null, { fps: 2 });
    t.feed(5 * 60, {}, { fps: 2 });
    t.engine.closeStats();
    expect(t.blocks).toHaveLength(2);
    expect(t.blocks[0]!.durMs).toBeGreaterThan(9 * 60_000);
    expect(t.blocks[0]!.durMs).toBeLessThan(11 * 60_000);
  });

  it('una ausencia de menos de 30 s no se registra como episodio', () => {
    const t = setup();
    t.calibrate();
    t.feed(2 * 60, {}, { fps: 2 });
    t.feed(15, null, { fps: 2 });
    t.feed(2 * 60, {}, { fps: 2 });
    t.engine.closeStats();
    expect(t.away).toEqual([]);
  });

  it('equipo bloqueado se registra como bloqueo, no como ausencia', () => {
    const t = setup();
    t.calibrate();
    t.feed(2 * 60, {}, { fps: 2 });
    t.engine.setSystemState('locked');
    for (let i = 0; i < 120; i++) {
      t.clock.advance(1000);
      t.engine.tick(t.clock.nowMs());
    }
    t.engine.setSystemState('active');
    t.feed(60, {}, { fps: 2 });
    t.engine.closeStats();
    const locked = t.summaries.reduce((a, s) => a + s.lockedMs, 0);
    expect(locked).toBeGreaterThan(100_000);
    expect(t.summaries.reduce((a, s) => a + s.absentMs, 0)).toBeLessThan(5000);
    expect(t.away.map((e) => e.kind)).toEqual(['locked']);
  });

  it('un salto largo entre pasos (suspensión) se atribuye a bloqueo', () => {
    const t = setup();
    t.calibrate();
    t.feed(60, {}, { fps: 2 });
    t.clock.advance(20 * 60_000);
    t.engine.tick(t.clock.nowMs());
    t.engine.closeStats();
    expect(t.summaries.reduce((a, s) => a + s.lockedMs, 0)).toBeGreaterThan(19 * 60_000);
  });

  it('registra el tiempo con desviaciones activas y por hora local', () => {
    const t = setup();
    t.calibrate();
    t.feed(60, BAD, { fps: 2 });
    t.engine.closeStats();
    const s = t.summaries[0]!;
    expect(s.deviationActiveMs.protrusion).toBeGreaterThan(50_000);
    expect(s.hours.length).toBeGreaterThan(0);
    expect(s.utcOffsetMin).toBe(60);
  });

  it('un aviso corregido registra cuánto se tardó; sin corregir se marca como ignorado', () => {
    const t = setup();
    t.calibrate();
    t.feed(5, {});
    t.feed(30, BAD);
    expect(t.alertRecords).toHaveLength(1);
    t.feed(12, {});
    expect(t.alertUpdates).toHaveLength(1);
    expect(t.alertUpdates[0]!.recoveredMs).toBeGreaterThan(0);
    const t2 = setup();
    t2.calibrate();
    t2.feed(5, {});
    t2.feed(30, BAD);
    t2.feed(11 * 60, BAD, { fps: 2 });
    expect(t2.alertUpdates.some((u) => u.ignored === true)).toBe(true);
  });

  it('si el usuario se va tras un aviso no se concluye nada', () => {
    const t = setup();
    t.calibrate();
    t.feed(5, {});
    t.feed(30, BAD);
    t.feed(60, null, { fps: 2 });
    t.feed(30, {});
    expect(t.alertUpdates).toEqual([]);
  });

  it('el descanso registra el tiempo fuera de la silla y el ejercicio guiado', () => {
    const t = setup();
    t.calibrate();
    t.feed(31 * 60, {}, { fps: 1 });
    t.feed(90, null, { fps: 1 });
    t.engine.exerciseDone();
    t.engine.finishBreak('micro', 'done', 'chinTuck');
    expect(t.records.at(-1)).toMatchObject({ outcome: 'completed', exerciseId: 'chinTuck' });
    expect(t.records.at(-1)!.awayMs).toBeGreaterThan(60_000);
  });
});

describe('engine: estadísticas y otras señales', () => {
  it('vuelca agregados por intervalo sin imágenes ni landmarks', () => {
    const t = setup();
    t.calibrate();
    t.feed(6 * 60, {}, { fps: 2 });
    t.engine.flushStats();
    expect(t.summaries.length).toBeGreaterThan(0);
    const total = t.summaries.reduce((a, s) => a + s.okMs, 0);
    expect(total).toBeGreaterThan(5 * 60_000);
    expect(JSON.stringify(t.summaries)).not.toMatch(/landmark|data:|image/i);
  });

  it('sugiere recalibrar si hay un cambio brusco de persona', () => {
    const t = setup();
    t.calibrate();
    t.feed(5, {});
    const snap = t.feed(2, { shoulderWidth: 0.8, centerX: 0.3 * ASPECT });
    expect(snap.personChanged).toBe(true);
    t.engine.clearPersonChanged();
    expect(t.engine.getSnapshot().personChanged).toBe(false);
  });

  it('sugiere recalibrar si varias desviaciones están fuera de verde durante 5 minutos', () => {
    const t = setup();
    t.calibrate();
    const shifted: FrontalParams = {
      shoulderMidY: 0.86,
      headY: 0.53,
      shoulderWidth: 0.5,
      faceScale: 0.12,
      shoulderTiltDeg: 5,
      eyeTiltDeg: 9,
    };
    const snap = t.feed(6 * 60 + 5, shifted, { fps: 2 });
    expect(snap.suggestRecalibration).toBe(true);
  });

  it('de pie (si está activado) suprime avisos y no cuenta como sedestación', () => {
    const t = setup({ standingDetection: true });
    t.calibrate();
    t.feed(5, {});
    const snap = t.feed(60, { shoulderMidY: 0.78 - 0.4 * 0.8, headY: 0.2 }, { fps: 2 });
    expect(snap.suppressed).toBe('standing');
  });

  it('el estado de audio suspendido degrada a aviso visual', () => {
    const t = setup();
    t.engine.setAudioStatus('suspended');
    t.calibrate();
    t.feed(5, {});
    t.feed(25, BAD);
    expect(t.alerts.flat().map((a) => a.kind)).toEqual(['audioSuspendedNotice', 'notification']);
  });

  it('ignora marcas de tiempo hacia atrás', () => {
    const t = setup();
    t.calibrate();
    const snap = t.feed(3, {});
    const back = t.engine.tick(snap.t - 1000);
    expect(back.t).toBe(snap.t - 1000);
  });

  it('modo lateral con perfil lateral', () => {
    const t = setup({ mode: 'lateral', useFaceLandmarker: false });
    const rng = mulberry32(3);
    const frame = (cva: number) => {
      t.clock.advance(100);
      return t.engine.processFrame({
        t: t.clock.nowMs(),
        poses: [lateralPose({ cvaDeg: cva + gaussian(rng, 0.2) })],
        aspect: ASPECT,
      });
    };
    t.engine.startCalibration();
    for (let i = 0; i < 50; i++) frame(62);
    expect(t.engine.finishCalibration({ deviceId: 'usb', deviceLabel: 'USB' }).result.ok).toBe(true);
    let snap!: EngineSnapshot;
    for (let i = 0; i < 300; i++) snap = frame(48); // ΔCVA ≈ 14° ⇒ rojo
    expect(snap.level).toBe('MALA_POSTURA');
    expect(snap.reason).toBe('protrusion');
    expect(snap.raw?.side).toBe('left');
    expect(snap.cvaInfo?.relation).toBeDefined();
  });
});

describe('engine: parpadeo', () => {
  const every = (periodMs: number) => (tMs: number) => (tMs % periodMs < 130 ? 0.9 : 0.05);
  const on = { blink: { enabled: true } };

  it('frecuencia normal: mide ~15/min y no sugiere hidratación', () => {
    const t = setup(on);
    const snap = t.feed(120, {}, { fps: 15, blink: every(4000) });
    expect(snap.blink.enabled).toBe(true);
    expect(snap.blink.ratePerMin).toBeGreaterThan(12);
    expect(t.alerts.flat().some((a) => a.kind === 'hydration')).toBe(false);
  });

  it('frecuencia baja sostenida: sugiere hidratación una vez y registra agregados', () => {
    const t = setup(on);
    const snap = t.feed(6 * 60, {}, { fps: 15, blink: every(15_000) });
    expect(snap.blink.ratePerMin).toBeLessThan(CLINICAL_CONFIG.blink.lowBelowPerMin.value);
    expect(t.alerts.flat().filter((a) => a.kind === 'hydration')).toHaveLength(1);
    t.engine.flushStats();
    const total = t.summaries.reduce((a, s) => a + s.blinkCount, 0);
    expect(total).toBeGreaterThan(0);
    expect(t.summaries.reduce((a, s) => a + s.lowBlinkMs, 0)).toBeGreaterThan(0);
  });

  it('desactivado o en modo lateral no mide', () => {
    const off = setup();
    expect(off.feed(60, {}, { fps: 15, blink: every(4000) }).blink).toEqual({
      enabled: false,
      ratePerMin: null,
    });
    const lateral = setup({ ...on, mode: 'lateral' });
    expect(lateral.feed(60, {}, { fps: 15, blink: every(4000) }).blink.enabled).toBe(false);
  });

  it('mantiene al menos 15 fps aunque el ahorro adaptativo quiera bajarlos', () => {
    const t = setup({ ...on, fps: 10 });
    expect(t.feed(130, {}, { fps: 15, blink: every(4000) }).suggestedFps).toBe(BLINK_MIN_FPS);
  });
});
