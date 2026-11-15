// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { Clock, DeviationId, PostureLevel } from '../core/types';

export const systemClock: Clock = {
  nowMs: () => performance.now(),
  wallMs: () => Date.now(),
};

export const alertMessageKey = (reason: DeviationId | null): string => `alert.msg.${reason ?? 'generic'}`;
export const deviationLabelKey = (id: DeviationId): string => `deviation.${id}`;
export const levelLabelKey = (l: PostureLevel): string => `level.${l}`;

/** Indicadores que se muestran siempre (panel y ventana miniatura). */
export const KEY_METERS: DeviationId[] = ['protrusion', 'headDown', 'slouch'];

export type MeterZone = 'none' | 'green' | 'amber' | 'red';

export function meterZone(
  value: number | null,
  amber: number | undefined,
  red: number | undefined,
): MeterZone {
  if (value === null || amber === undefined || red === undefined) return 'none';
  return value >= red ? 'red' : value >= amber ? 'amber' : 'green';
}

export const formatMeterValue = (value: number | null, unit: string): string =>
  value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}${unit}`;

/** Geometría de la barra (fracciones 0..1 del ancho); los umbrales sin definir son null. */
export function meterBar(
  value: number | null,
  amber: number | undefined,
  red: number | undefined,
): { fill: number; amberAt: number | null; redAt: number | null } {
  const max = (red ?? 10) * 1.6;
  return {
    fill: value === null ? 0 : Math.min(Math.max(value, 0), max) / max,
    amberAt: amber === undefined ? null : amber / max,
    redAt: red === undefined ? null : red / max,
  };
}
