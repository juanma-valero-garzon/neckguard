// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

export const DAY_MS = 86_400_000;

/** Clave de día local (YYYY-MM-DD) para un desfase UTC dado en minutos (p. ej. +60 en CET). */
export function dayKeyOf(ts: number, utcOffsetMin: number): string {
  return new Date(ts + utcOffsetMin * 60_000).toISOString().slice(0, 10);
}

/** Hora local (0-23) para un desfase UTC dado en minutos. */
export function hourOf(ts: number, utcOffsetMin: number): number {
  return new Date(ts + utcOffsetMin * 60_000).getUTCHours();
}

/** Lunes (YYYY-MM-DD) de la semana local que contiene `ts`. */
export function weekKeyOf(ts: number, utcOffsetMin: number): string {
  const local = ts + utcOffsetMin * 60_000;
  const dow = (new Date(local).getUTCDay() + 6) % 7; // lunes = 0
  return new Date(local - dow * DAY_MS).toISOString().slice(0, 10);
}

/** Lunes (YYYY-MM-DD) de la semana que contiene el día `YYYY-MM-DD`. */
export function weekKeyOfDay(dayKey: string): string {
  return weekKeyOf(Date.parse(`${dayKey}T00:00:00Z`), 0);
}

/** Mes (YYYY-MM) al que pertenece el día `YYYY-MM-DD`. */
export const monthKeyOfDay = (dayKey: string): string => dayKey.slice(0, 7);

/** Día (YYYY-MM-DD) desplazado `n` días respecto a otro. */
export function addDays(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
