import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALERT_SETTINGS,
  clearSnooze,
  effectiveCooldown,
  initialAlertState,
  inQuietHours,
  snooze,
  stepAlerts,
  type AlertInput,
  type AlertSettings,
  type AlertState,
} from './policy';
import { AlertAudio, browserAudioFactory, type AudioContextLike } from './audio';
import { TONE_SET_IDS, toneFor, type ToneKind } from './tones';

const S: AlertSettings = { ...DEFAULT_ALERT_SETTINGS, repeatSound: false };
const R: AlertSettings = { ...DEFAULT_ALERT_SETTINGS, repeatSound: true, repeatSoundMs: 60_000 };
const MIN = 60_000;
const inp = (over: Partial<AlertInput>): AlertInput => ({
  t: 0,
  level: 'OK',
  reason: null,
  localMinutes: 12 * 60,
  dayKey: '2026-01-05',
  audio: 'running',
  suppressed: false,
  ...over,
});
const kinds = (a: { kind: string }[]) => a.map((x) => x.kind);

describe('escalado por gravedad', () => {
  it('AVISO_LEVE = solo indicador visual', () => {
    const d = stepAlerts(initialAlertState(), inp({ level: 'AVISO_LEVE', reason: 'protrusion' }), S);
    expect(d.actions).toEqual([]);
    expect(d.indicator).toBe('AVISO_LEVE');
  });

  it('MALA_POSTURA = tono + notificación', () => {
    const d = stepAlerts(initialAlertState(), inp({ level: 'MALA_POSTURA', reason: 'headDown' }), S);
    expect(d.actions).toEqual([
      { kind: 'sound', tone: 'MALA_POSTURA' },
      { kind: 'notification', level: 'MALA_POSTURA', reason: 'headDown' },
    ]);
  });

  it('CRITICA = segundo tono + overlay + notificación', () => {
    const d = stepAlerts(initialAlertState(), inp({ level: 'CRITICA', reason: 'protrusion' }), S);
    expect(kinds(d.actions)).toEqual(['sound', 'overlay', 'notification']);
    expect(d.actions[0]).toEqual({ kind: 'sound', tone: 'CRITICA' });
  });

  it('la opción solo visual no emite sonido ni aviso de audio suspendido', () => {
    const d = stepAlerts(initialAlertState(), inp({ level: 'MALA_POSTURA' }), { ...S, soundEnabled: false });
    expect(kinds(d.actions)).toEqual(['notification']);
  });
});

describe('enfriamiento, tope, silencio, DND y posponer', () => {
  const bad = (t: number, st: AlertState, over: Partial<AlertInput> = {}, s = S) =>
    stepAlerts(st, inp({ t, level: 'MALA_POSTURA', ...over }), s);

  it('no repite antes del enfriamiento y sí después', () => {
    let d = bad(0, initialAlertState());
    expect(d.actions.length).toBeGreaterThan(0);
    d = bad(4 * MIN, d.state);
    expect(d.actions).toEqual([]);
    d = bad(5 * MIN, d.state);
    expect(kinds(d.actions)).toContain('sound');
  });

  it('el tope diario limita solo el sonido y se reinicia al cambiar de día', () => {
    const s = { ...S, dailySoundCap: 2, cooldownMs: 1000, maxBackoffExponent: 0 };
    let st = initialAlertState();
    const sounds: number[] = [];
    for (let i = 0; i < 4; i++) {
      const d = bad(i * 2000, st, {}, s);
      st = d.state;
      sounds.push(d.actions.filter((a) => a.kind === 'sound').length);
      if (i >= 2) expect(kinds(d.actions)).toContain('notification');
    }
    expect(sounds).toEqual([1, 1, 0, 0]);
    const next = bad(10_000, st, { dayKey: '2026-01-06' }, s);
    expect(kinds(next.actions)).toContain('sound');
  });

  it('horario silencioso, incluido el que cruza medianoche', () => {
    const q = { enabled: true, startMin: 22 * 60, endMin: 7 * 60 };
    expect(inQuietHours(23 * 60, q)).toBe(true);
    expect(inQuietHours(3 * 60, q)).toBe(true);
    expect(inQuietHours(7 * 60, q)).toBe(false);
    expect(inQuietHours(12 * 60, q)).toBe(false);
    const same = { enabled: true, startMin: 9 * 60, endMin: 17 * 60 };
    expect(inQuietHours(10 * 60, same)).toBe(true);
    expect(inQuietHours(18 * 60, same)).toBe(false);
    expect(inQuietHours(10 * 60, { ...same, enabled: false })).toBe(false);
    expect(inQuietHours(10 * 60, { enabled: true, startMin: 5, endMin: 5 })).toBe(false);
    const d = bad(0, initialAlertState(), { localMinutes: 23 * 60 }, { ...S, quiet: q });
    expect(d.actions).toEqual([]);
    expect(d.indicator).toBe('MALA_POSTURA');
  });

  it('No molestar y avisos suspendidos silencian lo intrusivo pero no el indicador', () => {
    expect(bad(0, initialAlertState(), {}, { ...S, dnd: true }).actions).toEqual([]);
    const sup = bad(0, initialAlertState(), { suppressed: true });
    expect(sup.actions).toEqual([]);
    expect(sup.indicator).toBe('OK');
  });

  it('posponer 15/30/60 min', () => {
    for (const m of [15, 30, 60]) {
      const st = snooze(initialAlertState(), 0, m);
      expect(bad(m * MIN - 1, st).actions).toEqual([]);
      expect(bad(m * MIN, st).actions.length).toBeGreaterThan(0);
    }
    expect(bad(1, clearSnooze(snooze(initialAlertState(), 0, 15))).actions.length).toBeGreaterThan(0);
  });

  it('AudioContext suspendido ⇒ degrada a visual y avisa una sola vez', () => {
    const s = { ...S, cooldownMs: 1000, maxBackoffExponent: 0 };
    let d = bad(0, initialAlertState(), { audio: 'suspended' }, s);
    expect(kinds(d.actions)).toEqual(['audioSuspendedNotice', 'notification']);
    d = bad(5000, d.state, { audio: 'suspended' }, s);
    expect(kinds(d.actions)).toEqual(['notification']);
  });
});

describe('repetición del sonido mientras persiste la mala postura', () => {
  const run = (
    s: AlertSettings,
    level: 'MALA_POSTURA' | 'CRITICA',
    seconds: number,
    over: Partial<AlertInput> = {},
  ) => {
    let st = initialAlertState();
    const sounds: number[] = [];
    for (let t = 0; t <= seconds * 1000; t += 1000) {
      const d = stepAlerts(st, inp({ t, level, ...over }), s);
      st = d.state;
      if (d.actions.some((a) => a.kind === 'sound')) sounds.push(t / 1000);
    }
    return { sounds, st };
  };

  it('repite el sonido cada intervalo sin repetir notificaciones', () => {
    const notes: number[] = [];
    let st = initialAlertState();
    for (let t = 0; t <= 200_000; t += 1000) {
      const d = stepAlerts(st, inp({ t, level: 'MALA_POSTURA' }), R);
      st = d.state;
      if (d.actions.some((a) => a.kind === 'notification')) notes.push(t);
    }
    expect(run(R, 'MALA_POSTURA', 200).sounds).toEqual([0, 60, 120, 180]);
    expect(notes).toEqual([0]);
  });

  it('usa el tono de gravedad crítica y no repite en AVISO_LEVE', () => {
    expect(run(R, 'CRITICA', 70).sounds).toEqual([0, 60]);
    let st = initialAlertState();
    for (let t = 0; t <= 300_000; t += 1000) {
      const d = stepAlerts(st, inp({ t, level: 'AVISO_LEVE' }), R);
      st = d.state;
      expect(d.actions).toEqual([]);
    }
  });

  it('se detiene al corregir y vuelve a sonar de inmediato si reaparece, aunque haya enfriamiento', () => {
    let st = initialAlertState();
    st = stepAlerts(st, inp({ t: 0, level: 'MALA_POSTURA' }), R).state;
    st = stepAlerts(st, inp({ t: 30_000, level: 'OK' }), R).state;
    expect(st.lastSoundAt).toBeNull();
    const d = stepAlerts(st, inp({ t: 100_000, level: 'MALA_POSTURA' }), R);
    expect(d.actions).toEqual([{ kind: 'sound', tone: 'MALA_POSTURA' }]); // sin notificación: sigue el enfriamiento
    expect(stepAlerts(d.state, inp({ t: 160_000, level: 'MALA_POSTURA' }), R).actions).toEqual([
      { kind: 'sound', tone: 'MALA_POSTURA' },
    ]);
  });

  it('respeta DND, silencio, posponer, avisos suspendidos, audio bloqueado y sonido desactivado', () => {
    expect(run({ ...R, dnd: true }, 'MALA_POSTURA', 200).sounds).toEqual([]);
    expect(run(R, 'MALA_POSTURA', 200, { suppressed: true }).sounds).toEqual([]);
    expect(run(R, 'MALA_POSTURA', 200, { audio: 'suspended' }).sounds).toEqual([]);
    expect(run({ ...R, soundEnabled: false }, 'MALA_POSTURA', 200).sounds).toEqual([]);
    expect(run({ ...R, repeatSound: false }, 'MALA_POSTURA', 200).sounds).toEqual([0]);
    let st = snooze(initialAlertState(), 0, 2);
    const sounds: number[] = [];
    for (let t = 0; t <= 200_000; t += 1000) {
      const d = stepAlerts(st, inp({ t, level: 'MALA_POSTURA' }), R);
      st = d.state;
      if (d.actions.some((a) => a.kind === 'sound')) sounds.push(t / 1000);
    }
    expect(sounds[0]).toBe(120);
    expect(sounds[1]).toBe(180);
  });

  it('respeta el tope diario', () => {
    expect(run({ ...R, dailySoundCap: 2 }, 'MALA_POSTURA', 300).sounds).toEqual([0, 60]);
  });

  it('el enfriamiento por avisos ignorados no frena la repetición del sonido', () => {
    const s = { ...R, cooldownMs: 600_000 };
    expect(run(s, 'MALA_POSTURA', 130).sounds).toEqual([0, 60, 120]);
  });
});

describe('avisos ignorados y refuerzo positivo', () => {
  it('duplica el enfriamiento por cada aviso ignorado (con tope) y sugiere ajustar sensibilidad', () => {
    const s = { ...S, cooldownMs: MIN, maxBackoffExponent: 2 };
    let st = initialAlertState();
    let t = 0;
    const gaps: number[] = [];
    let hint = 0;
    let last = 0;
    for (let i = 0; i < 6; i++) {
      while (true) {
        const d = stepAlerts(st, inp({ t, level: 'MALA_POSTURA' }), s);
        st = d.state;
        if (d.actions.length) {
          gaps.push(t - last);
          last = t;
          hint += d.actions.filter((a) => a.kind === 'suggestSensitivity').length;
          break;
        }
        t += 1000;
      }
    }
    expect(gaps.slice(1)).toEqual([MIN, 2 * MIN, 4 * MIN, 4 * MIN, 4 * MIN]);
    expect(hint).toBe(1);
    expect(effectiveCooldown(st, s)).toBe(4 * MIN);
  });

  it('corregir tras una alerta da refuerzo positivo (con enfriamiento) y baja el contador de ignorados', () => {
    let d = stepAlerts(initialAlertState(), inp({ t: 0, level: 'MALA_POSTURA' }), S);
    d = stepAlerts(d.state, inp({ t: 30_000, level: 'OK' }), S);
    expect(d.actions).toEqual([{ kind: 'positive' }]);
    d = stepAlerts(d.state, inp({ t: 40_000, level: 'MALA_POSTURA' }), S);
    d = stepAlerts(d.state, inp({ t: 90_000, level: 'OK' }), S);
    expect(d.actions).toEqual([]); // dentro del enfriamiento positivo
  });

  it('sin refuerzo si fue AVISO_LEVE, si está desactivado o si la mala postura duró poco', () => {
    let d = stepAlerts(initialAlertState(), inp({ t: 0, level: 'AVISO_LEVE' }), S);
    expect(stepAlerts(d.state, inp({ t: 40_000, level: 'OK' }), S).actions).toEqual([]);
    d = stepAlerts(initialAlertState(), inp({ t: 0, level: 'MALA_POSTURA' }), S);
    expect(stepAlerts(d.state, inp({ t: 5_000, level: 'OK' }), S).actions).toEqual([]);
    d = stepAlerts(initialAlertState(), inp({ t: 0, level: 'MALA_POSTURA' }), {
      ...S,
      positiveFeedback: false,
    });
    expect(
      stepAlerts(d.state, inp({ t: 40_000, level: 'OK' }), { ...S, positiveFeedback: false }).actions,
    ).toEqual([]);
  });
});

describe('tonos y AudioContext simulado', () => {
  class FakeCtx implements AudioContextLike {
    state = 'suspended';
    currentTime = 10;
    destination = {};
    oscs: { freq: number; start: number; stop: number; type: string }[] = [];
    resumed = 0;
    async resume() {
      this.resumed++;
      this.state = 'running';
    }
    createOscillator() {
      const rec = { freq: 0, start: 0, stop: 0, type: '' };
      this.oscs.push(rec);
      return {
        set type(v: string) {
          rec.type = v;
        },
        frequency: {
          set value(v: number) {
            rec.freq = v;
          },
        },
        connect: () => undefined,
        start: (t: number) => (rec.start = t),
        stop: (t: number) => (rec.stop = t),
      } as never;
    }
    createGain() {
      return {
        gain: { value: 0, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined },
        connect: () => undefined,
      } as never;
    }
  }

  it('cada gravedad tiene un patrón distinto, en todos los juegos de sonido', () => {
    const kindsList: ToneKind[] = ['MALA_POSTURA', 'CRITICA', 'BREAK', 'POSITIVE'];
    for (const set of TONE_SET_IDS) {
      const patterns = kindsList.map((k) => JSON.stringify(toneFor(set, k).map((n) => [n.freq, n.startMs])));
      expect(new Set(patterns).size).toBe(4);
    }
    expect(toneFor('soft', 'MALA_POSTURA')).toHaveLength(2);
    expect(toneFor('soft', 'CRITICA')).toHaveLength(3);
  });

  it('unlock reanuda el contexto; play programa un oscilador por nota', async () => {
    const ctx = new FakeCtx();
    const audio = new AlertAudio(() => ctx);
    expect(audio.status).toBe('unavailable');
    expect(await audio.unlock()).toBe('running');
    expect(ctx.resumed).toBe(1);
    expect(audio.play('CRITICA', 'chime', 0.5)).toBe(true);
    expect(ctx.oscs).toHaveLength(3);
    expect(ctx.oscs[0]?.start).toBe(10);
    expect(ctx.oscs[0]?.freq).toBeCloseTo(659.25 * 1.25, 6);
  });

  it('si el contexto está suspendido, play lo reanuda y suena en cuanto puede (sin esperar a unlock)', async () => {
    const ctx = new FakeCtx();
    const audio = new AlertAudio(() => ctx);
    expect(audio.play('CRITICA', 'soft', 1)).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.resumed).toBe(1);
    expect(ctx.oscs).toHaveLength(3);
    expect(audio.play('MALA_POSTURA', 'soft', 1)).toBe(true);
    expect(ctx.oscs).toHaveLength(5);
  });

  it('contexto suspendido o ausente ⇒ no suena y se degrada', async () => {
    const ctx = new FakeCtx();
    ctx.resume = async () => undefined;
    const audio = new AlertAudio(() => ctx);
    expect(await audio.unlock()).toBe('suspended');
    expect(audio.play('MALA_POSTURA', 'soft', 1)).toBe(false);
    expect(await new AlertAudio(() => null).unlock()).toBe('unavailable');
    expect(new AlertAudio(() => null).play('CRITICA', 'soft', 1)).toBe(false);
    ctx.resume = async () => {
      throw new Error('bloqueado');
    };
    expect(audio.play('CRITICA', 'soft', 1)).toBe(false);
    const failing = new AlertAudio(() => {
      throw new Error('no audio');
    });
    expect(await failing.unlock()).toBe('unavailable');
    expect(failing.play('CRITICA', 'soft', 1)).toBe(false);
  });

  it('browserAudioFactory devuelve null sin AudioContext', () => {
    expect(browserAudioFactory()).toBeNull();
  });
});
