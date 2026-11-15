// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from '../core/types';
import { anglesFromFaceMatrix } from '../posture/metrics';

export type Delegate = 'GPU' | 'CPU';
export type ModelVariant = 'lite' | 'full';

export interface VisionInit {
  /** Base URL de activos empaquetados (relativa al documento; nunca remota). */
  baseUrl: string;
  variant?: ModelVariant;
  withFace: boolean;
  /** Activa los blendshapes del Face Landmarker (coste extra de CPU) para medir el parpadeo. */
  withBlink?: boolean;
}

export interface VisionResult {
  poses: Landmark[][];
  face: { pitchDeg: number; yawDeg: number } | null;
  /** Cierre ocular medio (0 abierto – 1 cerrado); null si no se midió. */
  blink: number | null;
}

/** Media de `eyeBlinkLeft` y `eyeBlinkRight`; null si falta alguna. */
export function blinkScore(
  categories: readonly { categoryName: string; score: number }[] | undefined,
): number | null {
  const l = categories?.find((c) => c.categoryName === 'eyeBlinkLeft')?.score;
  const r = categories?.find((c) => c.categoryName === 'eyeBlinkRight')?.score;
  return l === undefined || r === undefined ? null : (l + r) / 2;
}

/** Envoltorio de MediaPipe Tasks Vision: modelos y WASM se cargan siempre de rutas locales. */
export class VisionEngine {
  private pose: PoseLandmarker | null = null;
  private face: FaceLandmarker | null = null;
  delegate: Delegate = 'GPU';
  faceAvailable = false;

  async init(opts: VisionInit): Promise<void> {
    const base = new URL(opts.baseUrl, document.baseURI).toString().replace(/\/$/, '');
    const fileset = await FilesetResolver.forVisionTasks(`${base}/wasm`);
    const variant = opts.variant ?? 'lite';
    const build = async (delegate: Delegate): Promise<void> => {
      this.pose = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}/models/pose_landmarker_${variant}.task`, delegate },
        runningMode: 'VIDEO',
        numPoses: 2,
      });
      if (opts.withFace) {
        try {
          this.face = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: `${base}/models/face_landmarker.task`, delegate },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFacialTransformationMatrixes: true,
            outputFaceBlendshapes: !!opts.withBlink,
          });
          this.faceAvailable = true;
        } catch {
          this.face = null; // el análisis sigue solo con Pose
        }
      }
      this.delegate = delegate;
    };
    try {
      await build('GPU');
    } catch {
      this.close();
      await build('CPU'); // fallback a CPU; si también falla, se propaga el error
    }
  }

  detect(video: HTMLVideoElement, tsMs: number): VisionResult {
    if (!this.pose) return { poses: [], face: null, blink: null };
    const res = this.pose.detectForVideo(video, tsMs);
    const poses = res.landmarks.map((p) =>
      p.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })),
    );
    let face: VisionResult['face'] = null;
    let blink: number | null = null;
    if (this.face && poses.length) {
      const fr = this.face.detectForVideo(video, tsMs);
      const m = fr.facialTransformationMatrixes?.[0]?.data;
      face = m ? anglesFromFaceMatrix(m) : null;
      blink = blinkScore(fr.faceBlendshapes?.[0]?.categories);
    }
    return { poses, face, blink };
  }

  close(): void {
    this.pose?.close();
    this.face?.close();
    this.pose = null;
    this.face = null;
    this.faceAvailable = false;
  }
}

/** Luminancia muestreada de un fotograma reducido (solo estadísticos; no se conserva la imagen). */
export function sampleLuminance(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): { meanLuma: number; centerLuma: number; edgeLuma: number } | null {
  const w = 32;
  const h = 24;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || video.videoWidth === 0) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  let cSum = 0;
  let cN = 0;
  let eSum = 0;
  let eN = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l =
        0.2126 * (data[i] as number) + 0.7152 * (data[i + 1] as number) + 0.0722 * (data[i + 2] as number);
      sum += l;
      const central = x >= w / 4 && x < (3 * w) / 4 && y >= h / 4 && y < (3 * h) / 4;
      if (central) {
        cSum += l;
        cN++;
      } else {
        eSum += l;
        eN++;
      }
    }
  }
  return { meanLuma: sum / (w * h), centerLuma: cSum / cN, edgeLuma: eSum / eN };
}
