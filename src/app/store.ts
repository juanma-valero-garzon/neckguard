// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { create } from 'zustand';
import type { CalibrationFailure, CalibrationProfile } from '../posture/calibration';
import type { CameraState } from '../camera/camera';
import type { EngineSnapshot } from '../engine/engine';
import type { AudioStatus } from '../alerts/audio';
import type { BreakKind } from '../breaks/timers';
import type { Settings } from '../settings/schema';
import { DEFAULT_SETTINGS } from '../settings/schema';
import type { LoadStatus } from '../stats/storage';
import { defaultStore, type Store } from '../stats/model';

export type Screen =
  'onboarding' | 'main' | 'calibration' | 'stats' | 'settings' | 'exercises' | 'about' | 'break';

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'cpu' | 'error';

export interface Toast {
  id: number;
  kind: 'info' | 'positive' | 'warning';
  key: string;
  params?: Record<string, string | number>;
}

export interface CalibrationUi {
  state: 'idle' | 'capturing' | 'done' | 'failed';
  startedAt: number;
  durationMs: number;
  failure: CalibrationFailure | null;
  detail: string | null;
}

export interface BreakUi {
  kind: BreakKind;
  startedAt: number;
  /** Inicio de la cuenta atrás (null hasta pulsar «Empezar»); compartido con la miniatura. */
  timerStartedAt: number | null;
}

export const BREAK_DURATION_MS = { micro: 90_000, long: 300_000 } as const;

export interface AppState {
  ready: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  persistError: string | null;
  settings: Settings;
  store: Store;
  profile: CalibrationProfile | null;
  snapshot: EngineSnapshot | null;
  camera: CameraState;
  model: ModelStatus;
  modelError: string | null;
  audio: AudioStatus;
  screen: Screen;
  toasts: Toast[];
  calibration: CalibrationUi;
  breakUi: BreakUi | null;
  paused: boolean;
  alertBorder: boolean;
  notificationAccess: string;
}

export const useApp = create<AppState>(() => ({
  ready: false,
  loadStatus: 'fresh',
  loadError: null,
  persistError: null,
  settings: DEFAULT_SETTINGS,
  store: defaultStore(),
  profile: null,
  snapshot: null,
  camera: { status: 'idle', error: null, devices: [], active: null, deviceChanged: false, attempt: 0 },
  model: 'idle',
  modelError: null,
  audio: 'unavailable',
  screen: 'onboarding',
  toasts: [],
  calibration: { state: 'idle', startedAt: 0, durationMs: 5000, failure: null, detail: null },
  breakUi: null,
  paused: false,
  alertBorder: false,
  notificationAccess: 'default',
}));
