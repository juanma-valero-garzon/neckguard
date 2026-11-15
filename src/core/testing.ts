// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { Clock, Rng } from './types';

export class FakeClock implements Clock {
  constructor(
    private mono = 0,
    private wall = Date.UTC(2026, 0, 5, 9, 0, 0),
  ) {}
  nowMs(): number {
    return this.mono;
  }
  wallMs(): number {
    return this.wall;
  }
  advance(ms: number): void {
    this.mono += ms;
    this.wall += ms;
  }
  set(mono: number): void {
    this.wall += mono - this.mono;
    this.mono = mono;
  }
}

/** PRNG determinista (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Normal(0, sigma) por Box-Muller con un Rng inyectado. */
export function gaussian(rng: Rng, sigma: number): number {
  const u = Math.max(rng.next(), 1e-12);
  const v = rng.next();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
