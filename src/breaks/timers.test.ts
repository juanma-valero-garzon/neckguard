import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BREAK_CONFIG,
  finishBreak,
  initialBreakState,
  markExerciseDone,
  nextBreak,
  pendingBreak,
  snoozeBreak,
  stepBreaks,
  type BreakConfig,
  type BreakEvent,
  type BreakPresence,
  type BreakState,
} from './timers';

const MIN = 60_000;
const cfg: BreakConfig = { ...DEFAULT_BREAK_CONFIG };

function run(
  s: BreakState,
  t0: number,
  ms: number,
  presence: BreakPresence,
  c: BreakConfig = cfg,
  step = 1000,
) {
  let state = s;
  let t = t0;
  const events: { at: number; e: BreakEvent }[] = [];
  const first = stepBreaks(state, { t, presence }, c);
  state = first.state;
  for (const e of first.events) events.push({ at: t, e });
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    t += step;
    const r = stepBreaks(state, { t, presence }, c);
    state = r.state;
    for (const e of r.events) events.push({ at: t, e });
  }
  return { state, t, events };
}

describe('temporizadores de descanso', () => {
  it('aviso previo a los 2 min y microdescanso a los 30 min', () => {
    const r = run(initialBreakState(), 0, 31 * MIN, 'present');
    const pre = r.events.find((x) => x.e.type === 'prewarn' && x.e.kind === 'micro');
    const due = r.events.find((x) => x.e.type === 'due' && x.e.kind === 'micro');
    expect(pre?.at).toBe(28 * MIN);
    expect(due?.at).toBe(30 * MIN);
    expect(r.events.filter((x) => x.e.type === 'due')).toHaveLength(1);
  });

  it('descanso largo a los 55 min; no se dispara además el micro coincidente', () => {
    const r = run(initialBreakState(), 0, 56 * MIN, 'present');
    const dues = r.events
      .filter((x) => x.e.type === 'due')
      .map((x) => [x.at / MIN, (x.e as { kind: string }).kind]);
    expect(dues).toEqual([
      [30, 'micro'],
      [55, 'long'],
    ]);
    expect(pendingBreak(r.state)).toBe('long');
  });

  it('20-20-20 solo si está activado y se repite cada 20 min sentado', () => {
    const on = { ...cfg, eyeEnabled: true };
    const r = run(initialBreakState(), 0, 41 * MIN, 'present', on);
    expect(r.events.filter((x) => x.e.type === 'eye').map((x) => x.at / MIN)).toEqual([20, 40]);
    expect(run(initialBreakState(), 0, 41 * MIN, 'present').events.some((x) => x.e.type === 'eye')).toBe(
      false,
    );
  });

  it('ausencia ≥ 3 min reinicia el contador y emite absenceReset una sola vez', () => {
    let r = run(initialBreakState(), 0, 20 * MIN, 'present');
    r = run(r.state, r.t, 5 * MIN, 'absent');
    expect(r.events.filter((x) => x.e.type === 'absenceReset')).toHaveLength(1);
    expect(r.events.find((x) => x.e.type === 'absenceReset')?.at).toBe(20 * MIN + 3 * MIN);
    expect(r.state.micro).toBe(0);
    r = run(r.state, r.t, 29 * MIN, 'present');
    expect(r.events.some((x) => x.e.type === 'due')).toBe(false);
  });

  it('una ausencia corta no reinicia', () => {
    let r = run(initialBreakState(), 0, 20 * MIN, 'present');
    r = run(r.state, r.t, 2 * MIN, 'absent');
    expect(r.state.micro).toBe(20 * MIN);
    expect(r.events.some((x) => x.e.type === 'absenceReset')).toBe(false);
  });

  it('"sin datos" pausa el contador: no cuenta como sentado ni como descanso', () => {
    let r = run(initialBreakState(), 0, 10 * MIN, 'present');
    r = run(r.state, r.t, 60 * MIN, 'nodata');
    expect(r.state.micro).toBe(10 * MIN);
    expect(r.events).toEqual([]);
    expect(r.state.absentMs).toBe(0);
  });

  it('bloqueo/suspensión cuentan como ausencia', () => {
    let r = run(initialBreakState(), 0, 10 * MIN, 'present');
    r = run(r.state, r.t, 4 * MIN, 'locked');
    expect(r.state.micro).toBe(0);
  });

  it('un hueco grande sin pasos (suspensión) se trata como ausencia y recalcula con marcas de tiempo', () => {
    let r = run(initialBreakState(), 0, 10 * MIN, 'present');
    const jump = stepBreaks(r.state, { t: r.t + 2 * 3600_000, presence: 'present' }, cfg);
    expect(jump.events).toEqual([{ type: 'absenceReset' }]);
    expect(jump.state.micro).toBe(0);
    r = run(jump.state, r.t + 2 * 3600_000, 29 * MIN, 'present');
    expect(r.events.some((x) => x.e.type === 'due')).toBe(false);
  });

  it('de pie no cuenta como sedestación continua', () => {
    let r = run(initialBreakState(), 0, 20 * MIN, 'present');
    r = run(r.state, r.t, 4 * MIN, 'standing');
    expect(r.state.micro).toBe(0);
  });

  it('marcas no monótonas o no finitas se ignoran; desactivado no hace nada', () => {
    const r = run(initialBreakState(), 0, 5 * MIN, 'present');
    expect(stepBreaks(r.state, { t: 1000, presence: 'present' }, cfg).state).toBe(r.state);
    expect(stepBreaks(r.state, { t: Number.NaN, presence: 'present' }, cfg).state).toBe(r.state);
    const off = stepBreaks(r.state, { t: r.t + 1000, presence: 'present' }, { ...cfg, enabled: false });
    expect(off.state).toBe(r.state);
  });

  it('"Hecho" sin ausencia ni ejercicio ⇒ declarado; con ausencia ≥ mínimo o ejercicio ⇒ cumplido', () => {
    let r = run(initialBreakState(), 0, 31 * MIN, 'present');
    expect(pendingBreak(r.state)).toBe('micro');
    expect(finishBreak(r.state, 'micro', 'done', cfg).outcome).toBe('declared');
    expect(finishBreak(markExerciseDone(r.state), 'micro', 'done', cfg).outcome).toBe('completed');
    r = run(r.state, r.t, 90_000, 'absent');
    expect(r.state.awaySinceDue).toBe(90_000);
    expect(finishBreak(r.state, 'micro', 'done', cfg).outcome).toBe('completed');
    expect(finishBreak(r.state, 'micro', 'skip', cfg).outcome).toBe('skipped');
  });

  it('terminar un micro reinicia solo el micro; terminar un largo reinicia ambos', () => {
    const r = run(initialBreakState(), 0, 56 * MIN, 'present');
    const micro = finishBreak(r.state, 'micro', 'done', cfg).state;
    expect(micro.micro).toBe(0);
    expect(micro.long).toBe(56 * MIN);
    const long = finishBreak(r.state, 'long', 'done', cfg).state;
    expect([long.micro, long.long]).toEqual([0, 0]);
    expect(pendingBreak(long)).toBeNull();
  });

  it('posponer 5 min: vuelve a avisar tras 5 min de tiempo sentado', () => {
    let r = run(initialBreakState(), 0, 31 * MIN, 'present');
    const snoozed = snoozeBreak(r.state, 'micro', cfg);
    expect(pendingBreak(snoozed)).toBeNull();
    r = run(snoozed, r.t, 4 * MIN + 50_000, 'present');
    expect(r.events.some((x) => x.e.type === 'due')).toBe(false);
    r = run(r.state, r.t, 20_000, 'present');
    expect(r.events.filter((x) => x.e.type === 'due')).toHaveLength(1);
    const snoozedLong = snoozeBreak(run(initialBreakState(), 0, 56 * MIN, 'present').state, 'long', cfg);
    expect(pendingBreak(snoozedLong)).toBe('micro'); // el micro de los 30 min sigue pendiente
  });

  it('nextBreak devuelve el descanso más próximo y su tiempo restante', () => {
    const r = run(initialBreakState(), 0, 10 * MIN, 'present');
    expect(nextBreak(r.state, cfg)).toEqual({ kind: 'micro', remainingMs: 20 * MIN });
    const s = { ...initialBreakState(), micro: 0, long: 0 };
    expect(nextBreak(s, { ...cfg, microIntervalMs: 90 * MIN }).kind).toBe('long');
  });

  it('presets: el intervalo "Sensible" avisa antes', () => {
    const sensible = { ...cfg, microIntervalMs: 20 * MIN, longIntervalMs: 45 * MIN };
    const r = run(initialBreakState(), 0, 21 * MIN, 'present', sensible);
    expect(r.events.find((x) => x.e.type === 'due')?.at).toBe(20 * MIN);
  });
});
