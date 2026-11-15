// Generador de poses sintéticas con geometría conocida (tests, fixtures y simulación). Sin imágenes.
import type { Landmark, Side } from './types';
import { LM, POSE_LANDMARK_COUNT } from '../vision/landmarks';

export const ASPECT = 16 / 9;

const blank = (): Landmark[] =>
  Array.from({ length: POSE_LANDMARK_COUNT }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));

const put = (arr: Landmark[], i: number, ux: number, uy: number, aspect: number, visibility = 1): void => {
  arr[i] = { x: ux / aspect, y: uy, z: 0, visibility };
};

export interface FrontalParams {
  aspect?: number;
  /** Todas las longitudes en unidades de altura de imagen. */
  shoulderWidth?: number;
  shoulderMidY?: number;
  shoulderTiltDeg?: number;
  faceScale?: number;
  headY?: number;
  eyeTiltDeg?: number;
  noseDrop?: number; // proporción de faceScale
  yawProxy?: number; // proporción de faceScale
  centerX?: number;
  visibility?: number;
}

export function frontalPose(p: FrontalParams = {}): Landmark[] {
  const aspect = p.aspect ?? ASPECT;
  const cx = p.centerX ?? 0.5 * aspect;
  const sw = p.shoulderWidth ?? 0.4;
  const smy = p.shoulderMidY ?? 0.78;
  const fs = p.faceScale ?? 0.1;
  const hy = p.headY ?? 0.45;
  const vis = p.visibility ?? 1;
  const out = blank();
  const st = ((p.shoulderTiltDeg ?? 0) * Math.PI) / 180;
  const et = ((p.eyeTiltDeg ?? 0) * Math.PI) / 180;
  // Hombro "izquierdo del sujeto" a la derecha de la imagen.
  put(out, LM.R_SHOULDER, cx - (sw / 2) * Math.cos(st), smy - (sw / 2) * Math.sin(st), aspect, vis);
  put(out, LM.L_SHOULDER, cx + (sw / 2) * Math.cos(st), smy + (sw / 2) * Math.sin(st), aspect, vis);
  put(out, LM.R_EYE, cx - (fs / 2) * Math.cos(et), hy - (fs / 2) * Math.sin(et), aspect, vis);
  put(out, LM.L_EYE, cx + (fs / 2) * Math.cos(et), hy + (fs / 2) * Math.sin(et), aspect, vis);
  put(out, LM.NOSE, cx + (p.yawProxy ?? 0) * fs, hy + (p.noseDrop ?? 0.7) * fs, aspect, vis);
  put(out, LM.L_EAR, cx + fs * 1.1, hy + 0.01, aspect, vis);
  put(out, LM.R_EAR, cx - fs * 1.1, hy + 0.01, aspect, vis);
  return out;
}

export interface LateralParams {
  aspect?: number;
  /** Ángulo línea (C7=hombro)–oreja con la horizontal, en grados. */
  cvaDeg: number;
  /** +1 mira a la derecha de la imagen, -1 a la izquierda. */
  facing?: 1 | -1;
  side?: Side;
  length?: number;
  noseDy?: number; // desplazamiento vertical nariz respecto a oreja (positivo = abajo)
  noseDx?: number;
  hipLeanDeg?: number | null; // inclinación anterior del tronco; null = cadera no visible
  shiftX?: number;
  shiftY?: number;
  scale?: number;
  mirror?: boolean;
}

export function lateralPose(p: LateralParams): Landmark[] {
  const aspect = p.aspect ?? ASPECT;
  const facing = p.facing ?? 1;
  const side = p.side ?? 'left';
  const scale = p.scale ?? 1;
  const len = (p.length ?? 0.25) * scale;
  const sx = 0.5 * aspect + (p.shiftX ?? 0);
  const sy = 0.7 + (p.shiftY ?? 0);
  const rad = (p.cvaDeg * Math.PI) / 180;
  const ear = { x: sx + facing * len * Math.cos(rad), y: sy - len * Math.sin(rad) };
  const nose = { x: ear.x + facing * (p.noseDx ?? 0.06) * scale, y: ear.y + (p.noseDy ?? 0.02) * scale };
  const out = blank();
  const earI = side === 'left' ? LM.L_EAR : LM.R_EAR;
  const shI = side === 'left' ? LM.L_SHOULDER : LM.R_SHOULDER;
  const hipI = side === 'left' ? LM.L_HIP : LM.R_HIP;
  put(out, earI, ear.x, ear.y, aspect);
  put(out, shI, sx, sy, aspect);
  put(out, LM.NOSE, nose.x, nose.y, aspect);
  if (p.hipLeanDeg !== null && p.hipLeanDeg !== undefined) {
    const lean = (p.hipLeanDeg * Math.PI) / 180;
    const trunk = 0.3 * scale;
    put(out, hipI, sx - facing * trunk * Math.sin(lean), sy + trunk * Math.cos(lean), aspect);
  }
  if (p.mirror) for (const lm of out) lm.x = 1 - lm.x;
  return out;
}

export interface ObliquePoseParams extends LateralParams {
  eyeTiltDeg?: number;
  /** Desplazamientos verticales (altura de imagen) del hombro y de la oreja visibles. */
  shoulderDy?: number;
  earDy?: number;
  /** Visibilidad del lado lejano (hombro y oreja contrarios). */
  farVisibility?: number;
}

/** Vista ladeada: lado cercano completo, ojos visibles y lado lejano con menor visibilidad. */
export function obliquePose(p: ObliquePoseParams): Landmark[] {
  const aspect = p.aspect ?? ASPECT;
  const side = p.side ?? 'left';
  const out = lateralPose(p);
  const earI = side === 'left' ? LM.L_EAR : LM.R_EAR;
  const shI = side === 'left' ? LM.L_SHOULDER : LM.R_SHOULDER;
  (out[shI] as Landmark).y += p.shoulderDy ?? 0;
  (out[earI] as Landmark).y += p.earDy ?? 0;
  const nose = out[LM.NOSE] as Landmark;
  const tilt = ((p.eyeTiltDeg ?? 0) * Math.PI) / 180;
  const half = 0.02 / aspect;
  out[LM.L_EYE] = {
    x: nose.x - half * Math.cos(tilt),
    y: nose.y - 0.03 - 0.02 * Math.sin(tilt),
    z: 0,
    visibility: 1,
  };
  out[LM.R_EYE] = {
    x: nose.x + half * Math.cos(tilt),
    y: nose.y - 0.03 + 0.02 * Math.sin(tilt),
    z: 0,
    visibility: 1,
  };
  const farEar = side === 'left' ? LM.R_EAR : LM.L_EAR;
  const farSh = side === 'left' ? LM.R_SHOULDER : LM.L_SHOULDER;
  const near = out[shI] as Landmark;
  const far = p.farVisibility ?? 0;
  out[farSh] = { x: near.x + 0.1 / aspect, y: near.y - 0.01, z: 0, visibility: far };
  out[farEar] = { x: nose.x + 0.04 / aspect, y: (out[earI] as Landmark).y, z: 0, visibility: far };
  return out;
}
