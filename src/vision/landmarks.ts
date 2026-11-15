import type { Landmark } from '../core/types';

/** Índices de MediaPipe Pose (33 landmarks). */
export const LM = {
  NOSE: 0,
  L_EYE: 2,
  R_EYE: 5,
  L_EAR: 7,
  R_EAR: 8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_HIP: 23,
  R_HIP: 24,
} as const;

export const POSE_LANDMARK_COUNT = 33;

export const DEFAULT_MIN_VISIBILITY = 0.5;

export function isUsable(
  lm: Landmark | null | undefined,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): lm is Landmark {
  if (!lm) return false;
  if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y)) return false;
  return (lm.visibility ?? 1) >= minVisibility;
}
