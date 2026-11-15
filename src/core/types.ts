// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

// Tipos compartidos por el núcleo (sin dependencias de DOM ni de Electron).

export interface Landmark {
  x: number; // normalizado [0,1] sobre el ancho de la imagen SIN espejo
  y: number; // normalizado [0,1] sobre el alto
  z?: number;
  visibility?: number;
}

/** frontal: cámara de frente; lateral: de perfil; oblique: ladeada (p. ej. portátil junto a una pantalla adicional). */
export type CaptureMode = 'frontal' | 'lateral' | 'oblique';
export const CAPTURE_MODES: readonly CaptureMode[] = ['frontal', 'lateral', 'oblique'];
export type Side = 'left' | 'right';

export type PostureLevel = 'OK' | 'AVISO_LEVE' | 'MALA_POSTURA' | 'CRITICA';
export const LEVELS: readonly PostureLevel[] = ['OK', 'AVISO_LEVE', 'MALA_POSTURA', 'CRITICA'];
export const levelRank = (l: PostureLevel): number => LEVELS.indexOf(l);

/** Orden = prioridad clínica (sección 4 del prompt). */
export const DEVIATION_IDS = [
  'protrusion',
  'headDown',
  'slouch',
  'shoulderElevation',
  'shoulderAsymmetry',
  'headTilt',
  'headRotation',
  'proximity',
] as const;
export type DeviationId = (typeof DEVIATION_IDS)[number];

export type Confidence = 'consenso' | 'literatura limitada' | 'heurística';

/** Reloj inyectado: `nowMs` es monotónico; `wallMs` es hora de pared (epoch). */
export interface Clock {
  nowMs(): number;
  wallMs(): number;
}

export interface Rng {
  next(): number; // [0,1)
}

export type PresenceStatus = 'present' | 'absent' | 'nodata';
