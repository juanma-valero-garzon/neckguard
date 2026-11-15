import type { CaptureMode, Side } from '../core/types';

export type PresetId = 'standard' | 'sensitive' | 'custom';
export type Locale = 'es' | 'en';
export type ToneSet = 'soft' | 'chime' | 'wood';

export interface Settings {
  locale: Locale;
  preset: PresetId;
  mode: CaptureMode;
  cameraDeviceId: string;
  cameraLabel: string;
  preferredSide: Side | null;
  /** Modo de uso recordado por cámara (clave: etiqueta o deviceId): cualquier cámara puede ser frontal o lateral. */
  cameraModes: Record<string, CaptureMode>;
  /** Tarjetas del panel contraídas (ids). */
  collapsedCards: string[];
  showPreview: boolean;
  showSkeleton: boolean;
  fps: number;
  useFaceLandmarker: boolean;
  standingDetection: boolean;
  powerSaving: boolean;
  /** Solo preset "Personalizado": multiplica los umbrales (>1 = menos sensible). */
  sensitivity: number;
  launchAtLogin: boolean;
  /** ON: avisos sonoros de mala postura e indicadores en la miniatura; OFF: sin sonido de postura y miniatura solo con el tiempo hasta la pausa. */
  hypervigilance: boolean;
  alerts: {
    soundEnabled: boolean;
    volume: number;
    toneSet: ToneSet;
    notificationsEnabled: boolean;
    positiveFeedback: boolean;
    cooldownMin: number;
    dailySoundCap: number;
    repeatSound: boolean;
    repeatSeconds: number;
    quietEnabled: boolean;
    quietStartMin: number;
    quietEndMin: number;
    dnd: boolean;
  };
  breaks: {
    enabled: boolean;
    microMin: number;
    longMin: number;
    preWarnMin: number;
    eyeEnabled: boolean;
    resetAfterAbsentMin: number;
    snoozeMin: number;
  };
  /** Monitorización del parpadeo y sugerencia de hidratación ocular (requiere cámara frontal u oblicua). */
  blink: {
    enabled: boolean;
  };
  onboarding: {
    completed: boolean;
    redFlagsConfirmed: boolean;
    advancedExercisesAccepted: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'es',
  preset: 'standard',
  mode: 'frontal',
  cameraDeviceId: '',
  cameraLabel: '',
  preferredSide: null,
  cameraModes: {},
  collapsedCards: [],
  showPreview: true,
  showSkeleton: true,
  fps: 12,
  useFaceLandmarker: true,
  standingDetection: false,
  powerSaving: true,
  sensitivity: 1,
  launchAtLogin: false,
  hypervigilance: true,
  alerts: {
    soundEnabled: true,
    volume: 0.5,
    toneSet: 'soft',
    notificationsEnabled: true,
    positiveFeedback: true,
    cooldownMin: 5,
    dailySoundCap: 1000,
    repeatSound: true,
    repeatSeconds: 5,
    quietEnabled: false,
    quietStartMin: 22 * 60,
    quietEndMin: 7 * 60,
    dnd: false,
  },
  breaks: {
    enabled: true,
    microMin: 30,
    longMin: 55,
    preWarnMin: 2,
    eyeEnabled: false,
    resetAfterAbsentMin: 3,
    snoozeMin: 5,
  },
  blink: { enabled: false },
  onboarding: { completed: false, redFlagsConfirmed: false, advancedExercisesAccepted: false },
};

type FieldSpec =
  | { kind: 'bool' }
  | { kind: 'num'; min: number; max: number; int?: boolean }
  | { kind: 'enum'; values: readonly (string | null)[] }
  | { kind: 'string'; max: number };

const FIELDS: Record<string, FieldSpec> = {
  locale: { kind: 'enum', values: ['es', 'en'] },
  preset: { kind: 'enum', values: ['standard', 'sensitive', 'custom'] },
  mode: { kind: 'enum', values: ['frontal', 'lateral', 'oblique'] },
  cameraDeviceId: { kind: 'string', max: 512 },
  cameraLabel: { kind: 'string', max: 256 },
  preferredSide: { kind: 'enum', values: ['left', 'right', null] },
  showPreview: { kind: 'bool' },
  showSkeleton: { kind: 'bool' },
  fps: { kind: 'num', min: 5, max: 30, int: true },
  useFaceLandmarker: { kind: 'bool' },
  standingDetection: { kind: 'bool' },
  powerSaving: { kind: 'bool' },
  sensitivity: { kind: 'num', min: 0.6, max: 1.5 },
  launchAtLogin: { kind: 'bool' },
  hypervigilance: { kind: 'bool' },
  'alerts.soundEnabled': { kind: 'bool' },
  'alerts.volume': { kind: 'num', min: 0, max: 1 },
  'alerts.toneSet': { kind: 'enum', values: ['soft', 'chime', 'wood'] },
  'alerts.notificationsEnabled': { kind: 'bool' },
  'alerts.positiveFeedback': { kind: 'bool' },
  'alerts.cooldownMin': { kind: 'num', min: 1, max: 120, int: true },
  'alerts.dailySoundCap': { kind: 'num', min: 0, max: 5000, int: true },
  'alerts.repeatSound': { kind: 'bool' },
  'alerts.repeatSeconds': { kind: 'num', min: 3, max: 600, int: true },
  'alerts.quietEnabled': { kind: 'bool' },
  'alerts.quietStartMin': { kind: 'num', min: 0, max: 1439, int: true },
  'alerts.quietEndMin': { kind: 'num', min: 0, max: 1439, int: true },
  'alerts.dnd': { kind: 'bool' },
  'breaks.enabled': { kind: 'bool' },
  'breaks.microMin': { kind: 'num', min: 5, max: 120, int: true },
  'breaks.longMin': { kind: 'num', min: 10, max: 240, int: true },
  'breaks.preWarnMin': { kind: 'num', min: 0, max: 10, int: true },
  'breaks.eyeEnabled': { kind: 'bool' },
  'breaks.resetAfterAbsentMin': { kind: 'num', min: 1, max: 30, int: true },
  'breaks.snoozeMin': { kind: 'num', min: 1, max: 30, int: true },
  'blink.enabled': { kind: 'bool' },
  'onboarding.completed': { kind: 'bool' },
  'onboarding.redFlagsConfirmed': { kind: 'bool' },
  'onboarding.advancedExercisesAccepted': { kind: 'bool' },
};

function valid(spec: FieldSpec, v: unknown): boolean {
  switch (spec.kind) {
    case 'bool':
      return typeof v === 'boolean';
    case 'num':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        v >= spec.min &&
        v <= spec.max &&
        (!spec.int || Number.isInteger(v))
      );
    case 'enum':
      return (spec.values as readonly unknown[]).includes(v);
    case 'string':
      return typeof v === 'string' && v.length <= spec.max;
  }
}

const getPath = (obj: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    );

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj;
  for (const k of keys.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  cur[keys[keys.length - 1] as string] = value;
}

export interface SanitizeResult {
  settings: Settings;
  /** Rutas cuyo valor faltaba o era inválido y se sustituyó por el valor por defecto (se registra). */
  defaultsApplied: string[];
}

/** Valida contra el esquema; los campos ausentes/fuera de rango toman su valor por defecto y se registran. */
export function sanitizeSettings(input: unknown): SanitizeResult {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const defaultsApplied: string[] = [];
  for (const [path, spec] of Object.entries(FIELDS)) {
    const v = getPath(input, path);
    if (valid(spec, v)) setPath(settings as unknown as Record<string, unknown>, path, v);
    else defaultsApplied.push(path);
  }
  settings.cameraModes = sanitizeCameraModes(getPath(input, 'cameraModes'));
  settings.collapsedCards = sanitizeCollapsedCards(getPath(input, 'collapsedCards'));
  return { settings, defaultsApplied };
}

const MAX_COLLAPSED_CARDS = 20;

function sanitizeCollapsedCards(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const ids = v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40);
  return [...new Set(ids)].slice(0, MAX_COLLAPSED_CARDS);
}

const MAX_CAMERA_MODES = 20;

function sanitizeCameraModes(v: unknown): Record<string, CaptureMode> {
  const out: Record<string, CaptureMode> = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out;
  for (const [k, m] of Object.entries(v)) {
    if (Object.keys(out).length >= MAX_CAMERA_MODES) break;
    if (k.length > 0 && k.length <= 512 && (m === 'frontal' || m === 'lateral' || m === 'oblique'))
      out[k] = m;
  }
  return out;
}

/** Clave con la que se recuerda el modo de una cámara. */
export const cameraModeKey = (cam: { deviceId: string; label: string }): string => cam.label || cam.deviceId;

/** Errores de un parche parcial (para mostrar en Ajustes). */
export function validateSettingsPatch(patch: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const [path, v] of Object.entries(patch)) {
    const spec = FIELDS[path];
    if (!spec) errors.push(`${path}: campo desconocido`);
    else if (!valid(spec, v)) errors.push(`${path}: valor fuera de rango`);
  }
  return errors;
}

export const SETTINGS_FIELD_PATHS = Object.keys(FIELDS);
