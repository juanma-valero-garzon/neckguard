// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

export type ToneSetId = 'soft' | 'chime' | 'wood';
export type ToneKind = 'MALA_POSTURA' | 'CRITICA' | 'BREAK' | 'POSITIVE';

export interface Note {
  freq: number;
  startMs: number;
  durMs: number;
  gain: number;
  wave: 'sine' | 'triangle';
}

export const TONE_SET_IDS: readonly ToneSetId[] = ['soft', 'chime', 'wood'];

// Frecuencias en Hz; cada gravedad tiene un patrón rítmico/melódico distinto.
const PITCHES: Record<ToneSetId, { base: number; wave: Note['wave'] }> = {
  soft: { base: 440, wave: 'sine' },
  chime: { base: 659.25, wave: 'sine' },
  wood: { base: 330, wave: 'triangle' },
};

export function toneFor(set: ToneSetId, kind: ToneKind): Note[] {
  const { base, wave } = PITCHES[set];
  const n = (ratio: number, startMs: number, durMs: number, gain: number): Note => ({
    freq: base * ratio,
    startMs,
    durMs,
    gain,
    wave,
  });
  switch (kind) {
    case 'MALA_POSTURA':
      return [n(1, 0, 220, 0.5), n(0.8, 260, 320, 0.45)];
    case 'CRITICA':
      return [n(1.25, 0, 180, 0.6), n(1, 220, 180, 0.6), n(0.8, 440, 380, 0.55)];
    case 'BREAK':
      return [n(0.8, 0, 200, 0.45), n(1, 240, 200, 0.45), n(1.25, 480, 360, 0.5)];
    case 'POSITIVE':
      return [n(1, 0, 140, 0.3), n(1.5, 160, 260, 0.3)];
  }
}
