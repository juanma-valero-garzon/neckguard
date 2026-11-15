// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { DeviationId } from '../core/types';
import { suggestExercise, type ExerciseGate } from '../exercises/library';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import { compareGood, type PeriodSummary } from './aggregate';
import { dominantDeviation, fatigueDrop, worstHour, worstWeekday } from './insights';

export type AdviceId =
  | 'insufficientData'
  | 'lowCoverage'
  | 'dominantDeviation'
  | 'worstHour'
  | 'worstWeekday'
  | 'fatigue'
  | 'longSitting'
  | 'fewPauses'
  | 'goodMovement'
  | 'skippedBreaks'
  | 'ignoredAlerts'
  | 'improving'
  | 'worsening'
  | 'goalReached';

export interface Advice {
  id: AdviceId;
  severity: 'warning' | 'info' | 'positive';
  /** Valores para el texto traducido (los porcentajes ya van redondeados). */
  params: Record<string, number | string>;
  deviation?: DeviationId;
  /** Ejercicio sugerido; solo si el usuario puede ver ejercicios. */
  exerciseId?: string;
  /** Causa de la baja cobertura (clave i18n `advice.lowCoverage.<cause>`). */
  cause?: 'light' | 'calibration' | 'camera';
}

const RANK: Record<Advice['severity'], number> = { warning: 0, info: 1, positive: 2 };
const pct = (x: number): number => Math.round(x * 100);
const min = (ms: number): number => Math.round(ms / 60_000);

export interface AdviceInput {
  current: PeriodSummary;
  previous?: PeriodSummary;
  /** Días del periodo (para detectar el peor día de la semana en semanas y meses). */
  days?: readonly PeriodSummary[];
  gate: ExerciseGate;
}

function sort(xs: Advice[]): Advice[] {
  return xs
    .map((a, i) => ({ a, i }))
    .sort((x, y) => RANK[x.a.severity] - RANK[y.a.severity] || x.i - y.i)
    .map((x) => x.a);
}

/**
 * Pautas deterministas a partir de los agregados. Sin tiempo sentado analizado suficiente no hay
 * conclusiones sobre postura; el tiempo ausente nunca se interpreta como mala ni como buena postura.
 */
export function buildAdvice({ current: p, previous, days, gate }: AdviceInput): Advice[] {
  const st = CLINICAL_CONFIG.statistics;
  const out: Advice[] = [];

  if (p.coverage !== null && p.coverage < st.reliableCoverage.value) {
    const n = p.notAnalysed;
    const cause =
      n.light >= n.notCalibrated && n.light >= n.nodata + n.unknown
        ? 'light'
        : n.notCalibrated >= n.nodata + n.unknown
          ? 'calibration'
          : 'camera';
    out.push({ id: 'lowCoverage', severity: 'info', params: { coverage: pct(p.coverage) }, cause });
  }
  if (p.reliability === 'insufficient') {
    out.push({ id: 'insufficientData', severity: 'info', params: { minutes: min(p.analysedMs) } });
    return sort(out);
  }

  const dev = dominantDeviation(p);
  if (dev && p.goodRatio !== null && p.goodRatio < st.goodRatioTarget.value) {
    const ex = suggestExercise('micro', gate, dev.id);
    out.push({
      id: 'dominantDeviation',
      severity: 'warning',
      params: { share: pct(dev.share) },
      deviation: dev.id,
      ...(ex ? { exerciseId: ex.id } : {}),
    });
  }

  const wh = worstHour(p);
  if (wh) out.push({ id: 'worstHour', severity: 'info', params: { hour: wh.hour, good: pct(wh.goodRatio) } });

  const drop = fatigueDrop(p);
  if (drop !== null) out.push({ id: 'fatigue', severity: 'info', params: { drop: pct(drop) } });

  const wd = days ? worstWeekday(days) : null;
  if (wd) {
    out.push({
      id: 'worstWeekday',
      severity: 'info',
      params: { weekday: wd.weekday, good: pct(wd.goodRatio) },
    });
  }

  if (p.blocksLong > 0 || p.longestBlockMs >= st.longSittingMs.value) {
    out.push({
      id: 'longSitting',
      severity: 'warning',
      params: { longest: min(p.longestBlockMs), count: p.blocksLong },
    });
  } else if (p.awayPerSeatedHour !== null && p.analysedMs >= 2 * 3_600_000) {
    if (p.awayPerSeatedHour < st.minAwayPerSeatedHour.value) {
      out.push({
        id: 'fewPauses',
        severity: 'info',
        params: { perHour: Math.round(p.awayPerSeatedHour * 10) / 10 },
      });
    } else if (p.awayPerSeatedHour >= 2 * st.minAwayPerSeatedHour.value) {
      out.push({ id: 'goodMovement', severity: 'positive', params: { count: p.awayCount } });
    }
  }

  const breaks = p.breaksCompleted + p.breaksDeclared + p.breaksSkipped;
  if (breaks >= 3 && p.breaksSkipped / breaks >= st.skippedBreaksShare.value) {
    out.push({ id: 'skippedBreaks', severity: 'info', params: { share: pct(p.breaksSkipped / breaks) } });
  }
  if (p.alerts >= 3 && p.alertsIgnored / p.alerts >= st.ignoredAlertsShare.value) {
    out.push({ id: 'ignoredAlerts', severity: 'info', params: { share: pct(p.alertsIgnored / p.alerts) } });
  }

  const delta = compareGood(p, previous);
  if (delta !== null && delta >= 0.05) {
    out.push({ id: 'improving', severity: 'positive', params: { points: pct(delta) } });
  } else if (delta !== null && delta <= -0.05) {
    out.push({ id: 'worsening', severity: 'warning', params: { points: pct(-delta) } });
  }

  if (p.goodRatio !== null && p.reliability === 'high' && p.goodRatio >= st.goodRatioTarget.value) {
    out.push({ id: 'goalReached', severity: 'positive', params: { good: pct(p.goodRatio) } });
  }
  return sort(out);
}
