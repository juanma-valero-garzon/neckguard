import type { QuietHours } from './policy';
import { inQuietHours } from './policy';

export interface BlinkAlertConfig {
  lowBelowPerMin: number;
  sustainedLowMs: number;
  cooldownMs: number;
}

export interface BlinkAlertState {
  lowSince: number | null;
  lastAt: number | null;
}

export const initialBlinkAlertState = (): BlinkAlertState => ({ lowSince: null, lastAt: null });

export interface BlinkAlertInput {
  t: number; // monotónico
  /** Parpadeos/min; null si no hay medida fiable. */
  ratePerMin: number | null;
  localMinutes: number;
  dnd: boolean;
  snoozed: boolean;
  quiet: QuietHours;
}

/** Sugiere hidratación si la frecuencia se mantiene baja; respeta enfriamiento, DND, silencio y posponer. */
export function stepBlinkAlert(
  prev: BlinkAlertState,
  input: BlinkAlertInput,
  cfg: BlinkAlertConfig,
): { state: BlinkAlertState; fire: boolean } {
  const state = { ...prev };
  const low = input.ratePerMin !== null && input.ratePerMin < cfg.lowBelowPerMin;
  if (!low) {
    state.lowSince = null;
    return { state, fire: false };
  }
  state.lowSince ??= input.t;
  const allowed = !input.dnd && !input.snoozed && !inQuietHours(input.localMinutes, input.quiet);
  const sustained = input.t - state.lowSince >= cfg.sustainedLowMs;
  const cooled = state.lastAt === null || input.t - state.lastAt >= cfg.cooldownMs;
  if (!(allowed && sustained && cooled)) return { state, fire: false };
  state.lastAt = input.t;
  return { state, fire: true };
}
