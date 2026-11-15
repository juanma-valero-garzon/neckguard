import type { DeviationId } from '../core/types';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import { addDaily, allDaily, defaultOffset, emptyDaily } from './daily';
import type { DailyRecord, HourBucket, Store } from './model';
import { monthKeyOfDay, weekKeyOfDay } from './time';

export { addDays, dayKeyOf, hourOf, monthKeyOfDay, weekKeyOf, weekKeyOfDay } from './time';
export { SessionRecorder, activityOf } from './recorder';

/** Fiabilidad de un resumen: con poco tiempo sentado analizado no se sacan conclusiones. */
export type Reliability = 'high' | 'low' | 'insufficient';

/** Tiempo sin analizar por causa. */
export interface NotAnalysed {
  absent: number;
  standing: number;
  locked: number;
  paused: number;
  nodata: number;
  light: number;
  notCalibrated: number;
  unknown: number;
}

export interface PeriodSummary {
  key: string;
  /** Días con datos dentro del periodo. */
  days: number;
  okMs: number;
  /** Tiempo sentado y analizado (solo este tiempo cuenta para el porcentaje de buena postura). */
  analysedMs: number;
  /** Fracción de tiempo analizado en buena postura (null si no hay datos). */
  goodRatio: number | null;
  alerts: number;
  alertsCritical: number;
  alertsIgnored: number;
  alertsRecovered: number;
  alertRecoveredMs: number;
  breaksCompleted: number;
  breaksDeclared: number;
  breaksSkipped: number;
  breaksByAbsence: number;
  /** completados / (completados + declarados + omitidos); null sin descansos. */
  breakCompliance: number | null;
  /** Tiempo ausente (no se detectó a nadie). */
  absentMs: number;
  /** Fuera de la silla por cualquier causa (ausente, de pie, equipo bloqueado). */
  awayMs: number;
  notAnalysed: NotAnalysed;
  /** Analizado / (analizado + sentado sin analizar + cámara sin imagen); null sin base. */
  coverage: number | null;
  reliability: Reliability;
  awayCount: number;
  longestAwayMs: number;
  /** Pausas por hora sentada; null sin tiempo sentado. */
  awayPerSeatedHour: number | null;
  blocksCount: number;
  blocksMs: number;
  longestBlockMs: number;
  blocksLong: number;
  /** Tiempo con parpadeo medido; 0 si no se activó la monitorización. */
  blinkMs: number;
  /** Parpadeos/min medios; null sin medida. */
  blinkRatePerMin: number | null;
  /** Fracción del tiempo medido con frecuencia baja; null sin medida. */
  lowBlinkShare: number | null;
  hours: HourBucket[];
  deviationMs: Partial<Record<DeviationId, number>>;
  deviationActiveMs: Partial<Record<DeviationId, number>>;
  alertsByReason: Partial<Record<DeviationId, number>>;
}

export function reliabilityOf(seatedMs: number, coverage: number | null): Reliability {
  const st = CLINICAL_CONFIG.statistics;
  if (coverage === null) return 'insufficient';
  if (seatedMs >= st.reliableSeatedMs.value && coverage >= st.reliableCoverage.value) return 'high';
  if (seatedMs >= st.lowSeatedMs.value && coverage >= st.lowCoverage.value) return 'low';
  return 'insufficient';
}

/** Resumen de un conjunto de días (un día, una semana, un mes…). */
export function summarize(key: string, recs: readonly DailyRecord[]): PeriodSummary {
  const d = emptyDaily(key);
  for (const r of recs) addDaily(d, r);
  const analysedMs = d.okMs + d.mildMs + d.badMs + d.criticalMs;
  const awayMs = d.absentMs + d.standingMs + d.lockedMs;
  const base = analysedMs + d.lightMs + d.notCalibratedMs + d.suppressedMs + d.noDataMs;
  const coverage = base > 0 ? analysedMs / base : null;
  const breaksTotal = d.breaksCompleted + d.breaksDeclared + d.breaksSkipped;
  return {
    key,
    days: recs.length,
    okMs: d.okMs,
    analysedMs,
    goodRatio: analysedMs > 0 ? d.okMs / analysedMs : null,
    alerts: d.alerts,
    alertsCritical: d.alertsCritical,
    alertsIgnored: d.alertsIgnored,
    alertsRecovered: d.alertsRecovered,
    alertRecoveredMs: d.alertRecoveredMs,
    breaksCompleted: d.breaksCompleted,
    breaksDeclared: d.breaksDeclared,
    breaksSkipped: d.breaksSkipped,
    breaksByAbsence: d.breaksByAbsence,
    breakCompliance: breaksTotal > 0 ? d.breaksCompleted / breaksTotal : null,
    absentMs: d.absentMs,
    awayMs,
    notAnalysed: {
      absent: d.absentMs,
      standing: d.standingMs,
      locked: d.lockedMs,
      paused: d.pausedMs,
      nodata: d.noDataMs,
      light: d.lightMs,
      notCalibrated: d.notCalibratedMs,
      unknown: d.suppressedMs,
    },
    coverage,
    reliability: reliabilityOf(analysedMs, coverage),
    awayCount: d.awayCount,
    longestAwayMs: d.longestAwayMs,
    awayPerSeatedHour: analysedMs > 0 ? d.awayCount / (analysedMs / 3_600_000) : null,
    blocksCount: d.blocksCount,
    blocksMs: d.blocksMs,
    longestBlockMs: d.longestBlockMs,
    blocksLong: d.blocksLong,
    blinkMs: d.blinkMs,
    blinkRatePerMin: d.blinkMs > 0 ? (d.blinkCount * 60_000) / d.blinkMs : null,
    lowBlinkShare: d.blinkMs > 0 ? d.lowBlinkMs / d.blinkMs : null,
    hours: d.hours,
    deviationMs: d.deviationMs,
    deviationActiveMs: d.deviationActiveMs,
    alertsByReason: d.alertsByReason,
  };
}

function aggregate(store: Store, offset: number, keyOf: (dayKey: string) => string): PeriodSummary[] {
  const groups = new Map<string, DailyRecord[]>();
  for (const r of allDaily(store, offset)) {
    const k = keyOf(r.dayKey);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.entries()]
    .map(([k, recs]) => summarize(k, recs))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export const aggregateByDay = (store: Store, utcOffsetMin: number = defaultOffset()): PeriodSummary[] =>
  aggregate(store, utcOffsetMin, (k) => k);

export const aggregateByWeek = (store: Store, utcOffsetMin: number = defaultOffset()): PeriodSummary[] =>
  aggregate(store, utcOffsetMin, weekKeyOfDay);

export const aggregateByMonth = (store: Store, utcOffsetMin: number = defaultOffset()): PeriodSummary[] =>
  aggregate(store, utcOffsetMin, monthKeyOfDay);

/** Un periodo sin tiempo sentado suficiente no admite conclusiones sobre postura. */
export const hasReliableData = (p: PeriodSummary | undefined): p is PeriodSummary =>
  !!p && p.reliability !== 'insufficient' && p.goodRatio !== null;

/** Diferencia de buena postura entre dos periodos; null si alguno es insuficiente. */
export function compareGood(cur: PeriodSummary | undefined, prev: PeriodSummary | undefined): number | null {
  return hasReliableData(cur) && hasReliableData(prev)
    ? (cur.goodRatio as number) - (prev.goodRatio as number)
    : null;
}

/** Diferencia de la fracción buena media: últimos `n` días fiables frente a los `n` anteriores. */
export function trend(days: readonly PeriodSummary[], n = 7): number | null {
  const withData = days.filter(hasReliableData);
  if (withData.length < 2) return null;
  const avg = (xs: PeriodSummary[]): number =>
    xs.reduce((a, d) => a + (d.goodRatio as number), 0) / xs.length;
  const recent = withData.slice(-n);
  const prior = withData.slice(-2 * n, -n);
  if (prior.length === 0) return null;
  return avg(recent) - avg(prior);
}
