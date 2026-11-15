import type { DeviationId, PostureLevel } from '../core/types';
import { levelRank } from '../core/types';

export interface QuietHours {
  enabled: boolean;
  startMin: number; // minutos desde medianoche
  endMin: number;
}

export interface AlertSettings {
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  positiveFeedback: boolean;
  dnd: boolean;
  cooldownMs: number;
  dailySoundCap: number;
  /** Repite el sonido mientras la mala postura persista (respeta DND, silencio y posponer). */
  repeatSound: boolean;
  repeatSoundMs: number;
  quiet: QuietHours;
  /** Máximo de duplicaciones del enfriamiento por avisos ignorados (2^n). */
  maxBackoffExponent: number;
  /** Mínimo de tiempo fuera de OK para dar refuerzo positivo al corregir. */
  positiveMinBadMs: number;
  positiveCooldownMs: number;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  soundEnabled: true,
  notificationsEnabled: true,
  positiveFeedback: true,
  dnd: false,
  cooldownMs: 5 * 60_000,
  dailySoundCap: 1000,
  repeatSound: true,
  repeatSoundMs: 5_000,
  quiet: { enabled: false, startMin: 22 * 60, endMin: 7 * 60 },
  maxBackoffExponent: 3,
  positiveMinBadMs: 20_000,
  positiveCooldownMs: 10 * 60_000,
};

export interface AlertState {
  lastLevel: PostureLevel;
  lastIntrusiveAt: number | null;
  lastSoundAt: number | null;
  dayKey: string | null;
  soundsToday: number;
  snoozedUntil: number | null;
  ignoredCount: number;
  nonOkSince: number | null;
  audioNoticeShown: boolean;
  lastPositiveAt: number | null;
  sensitivityHintShown: boolean;
}

export const initialAlertState = (): AlertState => ({
  lastLevel: 'OK',
  lastIntrusiveAt: null,
  lastSoundAt: null,
  dayKey: null,
  soundsToday: 0,
  snoozedUntil: null,
  ignoredCount: 0,
  nonOkSince: null,
  audioNoticeShown: false,
  lastPositiveAt: null,
  sensitivityHintShown: false,
});

export type AlertAction =
  | { kind: 'sound'; tone: 'MALA_POSTURA' | 'CRITICA' }
  | { kind: 'notification'; level: PostureLevel; reason: DeviationId | null }
  | { kind: 'overlay'; reason: DeviationId | null }
  | { kind: 'positive' }
  | { kind: 'audioSuspendedNotice' }
  | { kind: 'suggestSensitivity' }
  | { kind: 'hydration' };

export interface AlertInput {
  t: number; // monotónico
  level: PostureLevel;
  reason: DeviationId | null;
  localMinutes: number;
  dayKey: string;
  audio: 'running' | 'suspended' | 'unavailable';
  /** Avisos de postura suspendidos (poca luz, sin datos…). */
  suppressed: boolean;
}

export interface AlertDecision {
  state: AlertState;
  actions: AlertAction[];
  /** Estado visual a mostrar (siempre disponible, también en DND o horario silencioso). */
  indicator: PostureLevel;
}

export function inQuietHours(localMinutes: number, q: QuietHours): boolean {
  if (!q.enabled || q.startMin === q.endMin) return false;
  return q.startMin < q.endMin
    ? localMinutes >= q.startMin && localMinutes < q.endMin
    : localMinutes >= q.startMin || localMinutes < q.endMin;
}

export function snooze(state: AlertState, t: number, minutes: number): AlertState {
  return { ...state, snoozedUntil: t + minutes * 60_000 };
}

export function clearSnooze(state: AlertState): AlertState {
  return { ...state, snoozedUntil: null };
}

export function effectiveCooldown(state: AlertState, s: AlertSettings): number {
  return s.cooldownMs * 2 ** Math.min(state.ignoredCount, s.maxBackoffExponent);
}

export function stepAlerts(prev: AlertState, input: AlertInput, s: AlertSettings): AlertDecision {
  const state: AlertState = { ...prev };
  const actions: AlertAction[] = [];
  const { t, level } = input;

  if (state.dayKey !== input.dayKey) {
    state.dayKey = input.dayKey;
    state.soundsToday = 0;
  }
  const snoozed = state.snoozedUntil !== null && t < state.snoozedUntil;
  if (!snoozed && state.snoozedUntil !== null) state.snoozedUntil = null;
  const allowed = !input.suppressed && !s.dnd && !snoozed && !inQuietHours(input.localMinutes, s.quiet);

  if (level === 'OK') {
    const wasBadFor = prev.nonOkSince === null ? 0 : t - prev.nonOkSince;
    if (
      allowed &&
      s.positiveFeedback &&
      levelRank(prev.lastLevel) >= levelRank('MALA_POSTURA') &&
      wasBadFor >= s.positiveMinBadMs &&
      (state.lastPositiveAt === null || t - state.lastPositiveAt >= s.positiveCooldownMs)
    ) {
      actions.push({ kind: 'positive' });
      state.lastPositiveAt = t;
    }
    state.nonOkSince = null;
    state.lastSoundAt = null;
    if (prev.lastLevel !== 'OK' && state.ignoredCount > 0) state.ignoredCount -= 1;
    if (state.ignoredCount === 0) state.sensitivityHintShown = false;
  } else {
    state.nonOkSince ??= t;
    const intrusive = levelRank(level) >= levelRank('MALA_POSTURA');
    const cooled = state.lastIntrusiveAt === null || t - state.lastIntrusiveAt >= effectiveCooldown(state, s);
    if (intrusive && allowed && cooled) {
      if (state.lastIntrusiveAt !== null && state.nonOkSince <= state.lastIntrusiveAt)
        state.ignoredCount += 1;
      state.lastIntrusiveAt = t;
      const tone = level === 'CRITICA' ? 'CRITICA' : 'MALA_POSTURA';
      if (s.soundEnabled) {
        if (input.audio === 'running' && state.soundsToday < s.dailySoundCap) {
          actions.push({ kind: 'sound', tone });
          state.soundsToday += 1;
          state.lastSoundAt = t;
        } else if (input.audio !== 'running' && !state.audioNoticeShown) {
          actions.push({ kind: 'audioSuspendedNotice' });
          state.audioNoticeShown = true;
        }
      }
      if (level === 'CRITICA') actions.push({ kind: 'overlay', reason: input.reason });
      if (s.notificationsEnabled) actions.push({ kind: 'notification', level, reason: input.reason });
      if (state.ignoredCount >= 3 && !state.sensitivityHintShown) {
        actions.push({ kind: 'suggestSensitivity' });
        state.sensitivityHintShown = true;
      }
    } else if (
      intrusive &&
      allowed &&
      s.soundEnabled &&
      s.repeatSound &&
      input.audio === 'running' &&
      (state.lastSoundAt === null || t - state.lastSoundAt >= s.repeatSoundMs) &&
      state.soundsToday < s.dailySoundCap
    ) {
      actions.push({ kind: 'sound', tone: level === 'CRITICA' ? 'CRITICA' : 'MALA_POSTURA' });
      state.soundsToday += 1;
      state.lastSoundAt = t;
    }
  }
  state.lastLevel = level;
  return { state, actions, indicator: input.suppressed ? 'OK' : level };
}
