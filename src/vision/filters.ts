import type { Landmark } from '../core/types';
import { DEFAULT_MIN_VISIBILITY, isUsable } from './landmarks';

export interface OneEuroConfig {
  minCutoff: number; // Hz
  beta: number;
  dCutoff: number; // Hz
  /** Hueco (ms) tras el cual el filtro se reinicia. */
  maxGapMs: number;
}

export const DEFAULT_ONE_EURO: OneEuroConfig = { minCutoff: 1.0, beta: 0.05, dCutoff: 1.0, maxGapMs: 1500 };

const alpha = (cutoff: number, dtSec: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dtSec);
};

/** Filtro One-Euro con marcas de tiempo explícitas (ms). */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private lastT = 0;

  constructor(private readonly cfg: OneEuroConfig = DEFAULT_ONE_EURO) {}

  reset(): void {
    this.x = null;
    this.dx = 0;
  }

  /** Devuelve null (y no altera el estado) si la entrada no es finita. */
  filter(value: number, tMs: number): number | null {
    if (!Number.isFinite(value) || !Number.isFinite(tMs)) return null;
    if (this.x !== null && (tMs - this.lastT > this.cfg.maxGapMs || tMs < this.lastT)) this.reset();
    if (this.x === null) {
      this.x = value;
      this.lastT = tMs;
      return value;
    }
    const dt = Math.max((tMs - this.lastT) / 1000, 1e-3);
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.cfg.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.cfg.minCutoff + this.cfg.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    this.lastT = tMs;
    return this.x;
  }
}

/** Suaviza landmarks de una pose descartando los no visibles o no finitos (→ null). */
export class LandmarkSmoother {
  private readonly fx: OneEuroFilter[] = [];
  private readonly fy: OneEuroFilter[] = [];

  constructor(
    private readonly cfg: OneEuroConfig = DEFAULT_ONE_EURO,
    private readonly minVisibility = DEFAULT_MIN_VISIBILITY,
  ) {}

  reset(): void {
    this.fx.forEach((f) => f.reset());
    this.fy.forEach((f) => f.reset());
  }

  process(landmarks: readonly Landmark[], tMs: number): (Landmark | null)[] {
    return landmarks.map((lm, i) => {
      const fx = (this.fx[i] ??= new OneEuroFilter(this.cfg));
      const fy = (this.fy[i] ??= new OneEuroFilter(this.cfg));
      if (!isUsable(lm, this.minVisibility)) {
        fx.reset();
        fy.reset();
        return null;
      }
      const x = fx.filter(lm.x, tMs);
      const y = fy.filter(lm.y, tMs);
      if (x === null || y === null) return null;
      return { x, y, z: lm.z, visibility: lm.visibility };
    });
  }
}
