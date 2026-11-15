export type BreakKind = 'micro' | 'long';
/** Estado de presencia relevante para los descansos. 'locked' incluye suspensión y bloqueo de pantalla. */
export type BreakPresence = 'present' | 'absent' | 'nodata' | 'locked' | 'standing';

export interface BreakConfig {
  enabled: boolean;
  microIntervalMs: number;
  longIntervalMs: number;
  preWarnMs: number;
  eyeEnabled: boolean;
  eyeIntervalMs: number;
  /** Ausencia continua que reinicia el contador y cuenta como descanso cumplido. */
  resetAfterAbsentMs: number;
  /** Ausencia (o ejercicio guiado) mínima para que "Hecho" cuente como cumplido y no solo declarado. */
  minAwayForCompletedMs: number;
  snoozeMs: number;
  /** Hueco entre pasos a partir del cual se asume suspensión del equipo (= ausencia). */
  maxGapMs: number;
}

export const DEFAULT_BREAK_CONFIG: BreakConfig = {
  enabled: true,
  microIntervalMs: 30 * 60_000,
  longIntervalMs: 55 * 60_000,
  preWarnMs: 2 * 60_000,
  eyeEnabled: false,
  eyeIntervalMs: 20 * 60_000,
  resetAfterAbsentMs: 3 * 60_000,
  minAwayForCompletedMs: 60_000,
  snoozeMs: 5 * 60_000,
  maxGapMs: 30_000,
};

export interface BreakState {
  lastT: number | null;
  micro: number;
  long: number;
  eye: number;
  microSnooze: number;
  longSnooze: number;
  firedPre: Record<BreakKind, boolean>;
  firedDue: Record<BreakKind, boolean>;
  absentMs: number;
  absentResetDone: boolean;
  awaySinceDue: number;
  exerciseDone: boolean;
}

export type BreakEvent =
  | { type: 'prewarn'; kind: BreakKind; inMs: number }
  | { type: 'due'; kind: BreakKind }
  | { type: 'eye' }
  | { type: 'absenceReset' };

export type BreakOutcome = 'completed' | 'declared' | 'skipped';

export const initialBreakState = (): BreakState => ({
  lastT: null,
  micro: 0,
  long: 0,
  eye: 0,
  microSnooze: 0,
  longSnooze: 0,
  firedPre: { micro: false, long: false },
  firedDue: { micro: false, long: false },
  absentMs: 0,
  absentResetDone: false,
  awaySinceDue: 0,
  exerciseDone: false,
});

const resetAll = (s: BreakState): BreakState => ({
  ...initialBreakState(),
  lastT: s.lastT,
  absentMs: s.absentMs,
  absentResetDone: s.absentResetDone,
});

export function dueAt(s: BreakState, kind: BreakKind, cfg: BreakConfig): number {
  return kind === 'micro' ? cfg.microIntervalMs + s.microSnooze : cfg.longIntervalMs + s.longSnooze;
}

const counter = (s: BreakState, kind: BreakKind): number => (kind === 'micro' ? s.micro : s.long);

export function stepBreaks(
  prev: BreakState,
  input: { t: number; presence: BreakPresence },
  cfg: BreakConfig,
): { state: BreakState; events: BreakEvent[] } {
  const events: BreakEvent[] = [];
  const { t } = input;
  if (!cfg.enabled || !Number.isFinite(t) || (prev.lastT !== null && t < prev.lastT)) {
    return { state: prev, events };
  }
  const dt = prev.lastT === null ? 0 : t - prev.lastT;
  const s: BreakState = { ...prev, lastT: t, firedPre: { ...prev.firedPre }, firedDue: { ...prev.firedDue } };

  // Un hueco largo sin pasos implica suspensión del equipo: se atribuye a ausencia.
  const effective: BreakPresence = dt > cfg.maxGapMs ? 'locked' : input.presence;

  if (effective === 'nodata') return { state: s, events };

  if (effective === 'present') {
    s.absentMs = 0;
    s.absentResetDone = false;
    s.micro += dt;
    s.long += dt;
    s.eye += dt;
    emitSittingEvents(s, cfg, events);
    return { state: s, events };
  }

  // ausente / bloqueado / de pie
  s.absentMs += dt;
  if (s.firedDue.micro || s.firedDue.long) s.awaySinceDue += dt;
  if (!s.absentResetDone && s.absentMs >= cfg.resetAfterAbsentMs) {
    const reset = resetAll(s);
    reset.absentResetDone = true;
    events.push({ type: 'absenceReset' });
    return { state: reset, events };
  }
  return { state: s, events };
}

function emitSittingEvents(s: BreakState, cfg: BreakConfig, events: BreakEvent[]): void {
  const longCovers = (): boolean => s.firedPre.long || s.firedDue.long;
  for (const kind of ['long', 'micro'] as const) {
    const thr = dueAt(s, kind, cfg);
    const c = counter(s, kind);
    if (kind === 'micro' && longCovers()) continue;
    if (!s.firedPre[kind] && c >= thr - cfg.preWarnMs && c < thr) {
      s.firedPre[kind] = true;
      events.push({ type: 'prewarn', kind, inMs: Math.max(thr - c, 0) });
    }
    if (!s.firedDue[kind] && c >= thr) {
      s.firedPre[kind] = true;
      s.firedDue[kind] = true;
      events.push({ type: 'due', kind });
    }
  }
  if (cfg.eyeEnabled && s.eye >= cfg.eyeIntervalMs) {
    s.eye = 0;
    events.push({ type: 'eye' });
  }
}

export function markExerciseDone(s: BreakState): BreakState {
  return { ...s, exerciseDone: true };
}

/** "Hecho" (completed/declared según ausencia o ejercicio) o "Saltar" (skipped). Reinicia contadores. */
export function finishBreak(
  s: BreakState,
  kind: BreakKind,
  how: 'done' | 'skip',
  cfg: BreakConfig,
): { state: BreakState; outcome: BreakOutcome } {
  const outcome: BreakOutcome =
    how === 'skip'
      ? 'skipped'
      : s.awaySinceDue >= cfg.minAwayForCompletedMs || s.exerciseDone
        ? 'completed'
        : 'declared';
  const next: BreakState = { ...s, awaySinceDue: 0, exerciseDone: false };
  next.micro = 0;
  next.microSnooze = 0;
  next.firedPre = { ...s.firedPre, micro: false };
  next.firedDue = { ...s.firedDue, micro: false };
  next.eye = 0;
  if (kind === 'long') {
    next.long = 0;
    next.longSnooze = 0;
    next.firedPre.long = false;
    next.firedDue.long = false;
  }
  return { state: next, outcome };
}

/** Pospone el descanso `snoozeMs` de tiempo sentado a partir de ahora. */
export function snoozeBreak(s: BreakState, kind: BreakKind, cfg: BreakConfig): BreakState {
  const next: BreakState = { ...s, firedDue: { ...s.firedDue }, firedPre: { ...s.firedPre } };
  if (kind === 'micro') next.microSnooze = s.micro + cfg.snoozeMs - cfg.microIntervalMs;
  else next.longSnooze = s.long + cfg.snoozeMs - cfg.longIntervalMs;
  next.firedDue[kind] = false;
  next.firedPre[kind] = true;
  return next;
}

export function nextBreak(s: BreakState, cfg: BreakConfig): { kind: BreakKind; remainingMs: number } {
  const micro = dueAt(s, 'micro', cfg) - s.micro;
  const long = dueAt(s, 'long', cfg) - s.long;
  return micro <= long
    ? { kind: 'micro', remainingMs: Math.max(micro, 0) }
    : { kind: 'long', remainingMs: Math.max(long, 0) };
}

/** Descanso actualmente pendiente de atender, si lo hay (el largo prevalece). */
export function pendingBreak(s: BreakState): BreakKind | null {
  return s.firedDue.long ? 'long' : s.firedDue.micro ? 'micro' : null;
}
