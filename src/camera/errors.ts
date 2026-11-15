// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

export type CameraErrorKind = 'denied' | 'notFound' | 'busy' | 'overconstrained' | 'insecure' | 'unknown';

export interface CameraInfo {
  deviceId: string;
  label: string;
}

/** Clasifica un error de getUserMedia en un caso que la UI sabe explicar. */
export function classifyCameraError(err: unknown): CameraErrorKind {
  const name =
    typeof err === 'object' && err !== null && 'name' in err ? String((err as { name: unknown }).name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return name === 'SecurityError' ? 'insecure' : 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'notFound';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'overconstrained';
    default:
      return 'unknown';
  }
}

/** Reintentos con retardo exponencial acotado: 1 s, 2 s, 4 s … hasta 30 s. */
export function backoffMs(attempt: number, base = 1000, max = 30_000): number {
  return Math.min(base * 2 ** Math.max(attempt, 0), max);
}

/**
 * Elige la cámara a usar: la guardada por deviceId; si cambió (revocar permisos regenera ids),
 * por etiqueta; si no, la primera. `matched` indica si coincide con la guardada.
 */
export function pickDevice(
  devices: readonly CameraInfo[],
  saved: { deviceId: string; label: string },
): { device: CameraInfo | null; matched: boolean } {
  if (devices.length === 0) return { device: null, matched: false };
  const byId = saved.deviceId ? devices.find((d) => d.deviceId === saved.deviceId) : undefined;
  if (byId) return { device: byId, matched: true };
  const byLabel = saved.label ? devices.find((d) => d.label === saved.label) : undefined;
  if (byLabel) return { device: byLabel, matched: true };
  return { device: devices[0] as CameraInfo, matched: !saved.deviceId && !saved.label };
}
