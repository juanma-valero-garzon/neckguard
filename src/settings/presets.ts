// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { AlertSettings } from '../alerts/policy';
import { DEFAULT_ALERT_SETTINGS } from '../alerts/policy';
import type { BreakConfig } from '../breaks/timers';
import { DEFAULT_BREAK_CONFIG } from '../breaks/timers';
import type { PresetId, Settings } from './schema';

export interface ResolvedPreset {
  sensitivityScale: number;
  breaks: BreakConfig;
  alerts: AlertSettings;
  showAdvancedExercises: boolean;
}

const MIN = 60_000;

const PRESET_BREAKS: Record<Exclude<PresetId, 'custom'>, { micro: number; long: number; pre: number }> = {
  standard: { micro: 30, long: 55, pre: 2 },
  sensitive: { micro: 20, long: 45, pre: 2 },
};

/** Combina el preset elegido con los ajustes de usuario en la configuración operativa del núcleo. */
export function resolvePreset(s: Settings): ResolvedPreset {
  const p = s.preset === 'custom' ? null : PRESET_BREAKS[s.preset];
  const breaks: BreakConfig = {
    ...DEFAULT_BREAK_CONFIG,
    enabled: s.breaks.enabled,
    microIntervalMs: (p?.micro ?? s.breaks.microMin) * MIN,
    longIntervalMs: Math.max(p?.long ?? s.breaks.longMin, (p?.micro ?? s.breaks.microMin) + 1) * MIN,
    preWarnMs: (p?.pre ?? s.breaks.preWarnMin) * MIN,
    eyeEnabled: s.breaks.eyeEnabled,
    eyeIntervalMs: s.breaks.eyeIntervalMin * MIN,
    resetAfterAbsentMs: s.breaks.resetAfterAbsentMin * MIN,
    snoozeMs: s.breaks.snoozeMin * MIN,
  };
  const alerts: AlertSettings = {
    ...DEFAULT_ALERT_SETTINGS,
    soundEnabled: s.alerts.soundEnabled,
    notificationsEnabled: s.alerts.notificationsEnabled,
    positiveFeedback: s.alerts.positiveFeedback,
    dnd: s.alerts.dnd,
    cooldownMs: s.alerts.cooldownMin * MIN,
    dailySoundCap: s.alerts.dailySoundCap,
    repeatSound: s.alerts.repeatSound,
    repeatSoundMs: s.alerts.repeatSeconds * 1000,
    quiet: { enabled: s.alerts.quietEnabled, startMin: s.alerts.quietStartMin, endMin: s.alerts.quietEndMin },
  };
  return {
    sensitivityScale: s.preset === 'sensitive' ? 0.8 : s.preset === 'custom' ? s.sensitivity : 1,
    breaks,
    alerts,
    showAdvancedExercises: s.preset !== 'sensitive',
  };
}
