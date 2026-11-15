// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { CaptureMode, Confidence, DeviationId } from '../core/types';
import { DEVIATION_IDS } from '../core/types';
import type { ClinicalConfig } from '../settings/clinical-config';
import type { DeviationValues } from './deviations';

export type Zone = 'green' | 'amber' | 'red';

export interface EffectiveThreshold {
  amber: number;
  red: number;
  unit: 'deg' | 'pct';
  confidence: Confidence;
  /** true si el ruido de calibración (k·σ) elevó el umbral por encima del configurado. */
  noiseFloorApplied: boolean;
}

export type EffectiveThresholds = Partial<Record<DeviationId, EffectiveThreshold>>;

export interface ZoneReading {
  zone: Zone;
  value: number;
  /** Verde con margen (histéresis de salida): valor por dentro de (1 - exitMargin)·ámbar. */
  exitGreen: boolean;
}

export type ZoneReadings = Partial<Record<DeviationId, ZoneReading | null>>;

/** Umbral efectivo = máx(umbral configurado × escala, k·σ). La escala >1 baja la sensibilidad. */
export function effectiveThresholds(
  mode: CaptureMode,
  clinical: ClinicalConfig,
  deviationSigma: Partial<Record<DeviationId, number>>,
  sensitivityScale = 1,
): EffectiveThresholds {
  const out: EffectiveThresholds = {};
  const k = clinical.sigmaMultiplier.value;
  for (const id of DEVIATION_IDS) {
    const spec = clinical.thresholds[mode][id];
    if (!spec) continue;
    const baseAmber = spec.amber * sensitivityScale;
    const baseRed = spec.red * sensitivityScale;
    const floor = k * (deviationSigma[id] ?? 0);
    const amber = Math.max(baseAmber, floor);
    const red = Math.max(baseRed, amber + (baseRed - baseAmber));
    out[id] = {
      amber,
      red,
      unit: spec.unit,
      confidence: spec.confidence,
      noiseFloorApplied: floor > baseAmber,
    };
  }
  return out;
}

export function classify(
  values: DeviationValues,
  thresholds: EffectiveThresholds,
  exitMargin: number,
): ZoneReadings {
  const out: ZoneReadings = {};
  for (const id of DEVIATION_IDS) {
    const v = values[id];
    const th = thresholds[id];
    if (v === null || !th || !Number.isFinite(v)) {
      out[id] = null;
      continue;
    }
    const zone: Zone = v >= th.red ? 'red' : v >= th.amber ? 'amber' : 'green';
    out[id] = { zone, value: v, exitGreen: zone === 'green' && v < th.amber * (1 - exitMargin) };
  }
  return out;
}

/** CVA absoluto solo como referencia informativa: nunca un veredicto. */
export function informativeCva(
  cvaDeg: number | null,
  reference: [number, number],
): { cvaDeg: number; relation: 'below' | 'within' | 'above' } | null {
  if (cvaDeg === null || !Number.isFinite(cvaDeg)) return null;
  const [lo, hi] = reference;
  return { cvaDeg, relation: cvaDeg < lo ? 'below' : cvaDeg <= hi ? 'within' : 'above' };
}
