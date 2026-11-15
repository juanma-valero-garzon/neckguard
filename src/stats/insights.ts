// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { DeviationId } from '../core/types';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import { hasReliableData, type PeriodSummary } from './aggregate';

const cfg = (): typeof CLINICAL_CONFIG.statistics => CLINICAL_CONFIG.statistics;

export interface HourStat {
  hour: number;
  seatedMs: number;
  goodRatio: number;
}

/** Buena postura por hora local. Solo entran las horas con tiempo sentado suficiente. */
export function hourlyProfile(p: PeriodSummary): HourStat[] {
  const out: HourStat[] = [];
  for (const h of p.hours) {
    const seatedMs = h.okMs + h.mildMs + h.badMs + h.criticalMs;
    if (seatedMs >= cfg().minHourSeatedMs.value)
      out.push({ hour: h.hour, seatedMs, goodRatio: h.okMs / seatedMs });
  }
  return out.sort((a, b) => a.hour - b.hour);
}

/** Franja con peor postura; null si hay menos de 3 franjas comparables o no hay diferencia apreciable. */
export function worstHour(p: PeriodSummary): HourStat | null {
  if (p.reliability === 'insufficient') return null;
  const hs = hourlyProfile(p);
  if (hs.length < 3) return null;
  const worst = hs.reduce((a, b) => (b.goodRatio < a.goodRatio ? b : a));
  const best = hs.reduce((a, b) => (b.goodRatio > a.goodRatio ? b : a));
  return best.goodRatio - worst.goodRatio >= 0.15 ? worst : null;
}

/** Desviación con mayor parte del tiempo en mala postura; null si ninguna llega al umbral. */
export function dominantDeviation(p: PeriodSummary): { id: DeviationId; share: number } | null {
  if (p.reliability === 'insufficient') return null;
  const entries = Object.entries(p.deviationMs) as [DeviationId, number][];
  const total = entries.reduce((a, [, ms]) => a + ms, 0);
  if (total <= 0) return null;
  const [id, ms] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const share = ms / total;
  return share >= cfg().dominantShare.value ? { id, share } : null;
}

/** Caída de buena postura entre la primera y la segunda mitad de la jornada (positiva = empeora). */
export function fatigueDrop(p: PeriodSummary): number | null {
  if (p.reliability === 'insufficient') return null;
  const hs = hourlyProfile(p);
  if (hs.length < 4) return null;
  const half = Math.floor(hs.length / 2);
  const ratio = (xs: HourStat[]): number => {
    const seated = xs.reduce((a, h) => a + h.seatedMs, 0);
    return xs.reduce((a, h) => a + h.goodRatio * h.seatedMs, 0) / seated;
  };
  const drop = ratio(hs.slice(0, half)) - ratio(hs.slice(-half));
  return drop >= cfg().fatigueDrop.value ? drop : null;
}

/** Día de la semana (0 = lunes) con peor postura media; exige días fiables de al menos 3 días distintos de la semana. */
export function worstWeekday(days: readonly PeriodSummary[]): { weekday: number; goodRatio: number } | null {
  const acc = new Map<number, { sum: number; n: number }>();
  for (const d of days) {
    if (!hasReliableData(d)) continue;
    const wd = (new Date(`${d.key}T00:00:00Z`).getUTCDay() + 6) % 7;
    const a = acc.get(wd) ?? { sum: 0, n: 0 };
    a.sum += d.goodRatio as number;
    a.n += 1;
    acc.set(wd, a);
  }
  if (acc.size < 3) return null;
  const rows = [...acc.entries()].map(([weekday, a]) => ({ weekday, goodRatio: a.sum / a.n }));
  const worst = rows.reduce((a, b) => (b.goodRatio < a.goodRatio ? b : a));
  const best = rows.reduce((a, b) => (b.goodRatio > a.goodRatio ? b : a));
  return best.goodRatio - worst.goodRatio >= 0.15 ? worst : null;
}
