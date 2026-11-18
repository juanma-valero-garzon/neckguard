// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { BreakKind } from '../breaks/timers';
import type { CaptureMode, DeviationId } from '../core/types';
import type { CalibrationProfile } from '../posture/calibration';
import type { Settings } from '../settings/schema';
import { DEFAULT_SETTINGS } from '../settings/schema';

export const STORE_VERSION = 4;

/**
 * Qué estaba pasando en cada instante. Solo `seated` se analiza; el resto es tiempo "no analizado"
 * y nunca cuenta ni como buena ni como mala postura.
 */
export type ActivityState =
  'seated' | 'absent' | 'standing' | 'locked' | 'paused' | 'nodata' | 'light' | 'notCalibrated';

/** Causas por las que la persona no está sentada delante de la cámara. */
export type AwayKind = 'absent' | 'standing' | 'locked';

/** Reparto del tiempo por nivel y por causa de no análisis. Nunca contiene imágenes ni landmarks. */
export interface TimeTotals {
  okMs: number;
  mildMs: number;
  badMs: number;
  criticalMs: number;
  /** Sin causa conocida (datos anteriores a la v3: presente pero con avisos suspendidos). */
  suppressedMs: number;
  /** No se detectó a nadie delante de la cámara. */
  absentMs: number;
  /** De pie (solo con la detección activada). */
  standingMs: number;
  /** Equipo bloqueado o suspendido. */
  lockedMs: number;
  pausedMs: number;
  /** Cámara sin imagen. */
  noDataMs: number;
  /** Sentado pero sin analizar por poca luz, contraluz o baja confianza. */
  lightMs: number;
  notCalibratedMs: number;
  /** Tiempo con medida de parpadeo válida (no entra en el reparto de tiempo anterior). */
  blinkMs: number;
  blinkCount: number;
  /** Parte de `blinkMs` con frecuencia por debajo del umbral. */
  lowBlinkMs: number;
}

export const emptyTotals = (): TimeTotals => ({
  okMs: 0,
  mildMs: 0,
  badMs: 0,
  criticalMs: 0,
  suppressedMs: 0,
  absentMs: 0,
  standingMs: 0,
  lockedMs: 0,
  pausedMs: 0,
  noDataMs: 0,
  lightMs: 0,
  notCalibratedMs: 0,
  blinkMs: 0,
  blinkCount: 0,
  lowBlinkMs: 0,
});

/** Franja horaria local (0-23) dentro de una sesión o un día. */
export interface HourBucket {
  hour: number;
  okMs: number;
  mildMs: number;
  badMs: number;
  criticalMs: number;
  /** Fuera de la silla (ausente, de pie o equipo bloqueado). */
  awayMs: number;
  /** Tiempo en mala postura por desviación principal; ausente en datos anteriores. */
  deviationMs?: Partial<Record<DeviationId, number>>;
}

/** Agregados por intervalo (≈ 5 min), cortados al cambiar de día local. */
export interface SessionSummary extends TimeTotals {
  id: string;
  startedAt: number;
  endedAt: number;
  mode: CaptureMode;
  /** Desfase UTC (min) con el que se registró; ausente en datos antiguos. */
  utcOffsetMin?: number;
  hours: HourBucket[];
  /** Tiempo en el que la desviación fue el motivo principal del nivel. */
  deviationMs: Partial<Record<DeviationId, number>>;
  /** Tiempo con la desviación en zona ámbar o roja (puede coincidir con otras). */
  deviationActiveMs: Partial<Record<DeviationId, number>>;
}

export interface AlertEvent {
  t: number;
  level: 'MALA_POSTURA' | 'CRITICA';
  reason: DeviationId | null;
  /** Tiempo hasta volver a postura correcta tras el aviso. */
  recoveredMs?: number;
  /** No se corrigió la postura tras el aviso. */
  ignored?: boolean;
}

export type BreakOutcomeRecord = 'completed' | 'declared' | 'skipped' | 'absence';

export interface BreakRecord {
  t: number;
  kind: BreakKind;
  outcome: BreakOutcomeRecord;
  exerciseId?: string;
  /** Tiempo fuera de la silla durante el descanso. */
  awayMs?: number;
}

/** Periodo continuo fuera de la silla (≥ mínimo configurado). */
export interface AwayEpisode {
  t: number;
  durMs: number;
  kind: AwayKind;
}

/** Periodo sentado sin ausencias que lo corten (las ausencias cortas no lo interrumpen). */
export interface SittingBlock {
  t: number;
  durMs: number;
}

/** Resumen permanente de un día local; sustituye a las sesiones antiguas. */
export interface DailyRecord extends TimeTotals {
  dayKey: string;
  hours: HourBucket[];
  deviationMs: Partial<Record<DeviationId, number>>;
  deviationActiveMs: Partial<Record<DeviationId, number>>;
  alerts: number;
  alertsCritical: number;
  alertsIgnored: number;
  alertsRecovered: number;
  alertRecoveredMs: number;
  alertsByReason: Partial<Record<DeviationId, number>>;
  breaksCompleted: number;
  breaksDeclared: number;
  breaksSkipped: number;
  /** Subconjunto de `breaksCompleted` cumplido por una ausencia natural. */
  breaksByAbsence: number;
  awayCount: number;
  longestAwayMs: number;
  blocksCount: number;
  blocksMs: number;
  longestBlockMs: number;
  /** Bloques sentados por encima del umbral de sedestación prolongada. */
  blocksLong: number;
}

export interface Store {
  version: number;
  settings: Settings;
  profiles: CalibrationProfile[];
  sessions: SessionSummary[];
  alerts: AlertEvent[];
  breaks: BreakRecord[];
  away: AwayEpisode[];
  blocks: SittingBlock[];
  daily: DailyRecord[];
}

export const defaultStore = (): Store => ({
  version: STORE_VERSION,
  settings: structuredClone(DEFAULT_SETTINGS),
  profiles: [],
  sessions: [],
  alerts: [],
  breaks: [],
  away: [],
  blocks: [],
  daily: [],
});

export const MAX_SESSIONS = 5000;
export const MAX_EVENTS = 5000;
export const MAX_DAILY = 366 * 5;
/** Las sesiones y eventos más antiguos que esto se compactan en resúmenes diarios. */
export const DETAIL_DAYS = 45;
