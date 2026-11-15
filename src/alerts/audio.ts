import type { ToneKind, ToneSetId } from './tones';
import { toneFor } from './tones';

interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
}
interface NodeLike {
  connect(dest: unknown): unknown;
}
interface OscLike extends NodeLike {
  type: string;
  frequency: { value: number };
  start(t: number): void;
  stop(t: number): void;
}
interface GainLike extends NodeLike {
  gain: ParamLike;
}

/** Subconjunto de AudioContext que usamos (permite simularlo en tests). */
export interface AudioContextLike {
  state: string;
  currentTime: number;
  destination: unknown;
  resume(): Promise<void>;
  createOscillator(): OscLike;
  createGain(): GainLike;
}

export type AudioStatus = 'unavailable' | 'running' | 'suspended';

export class AlertAudio {
  private ctx: AudioContextLike | null = null;

  constructor(private readonly factory: () => AudioContextLike | null) {}

  /** Debe llamarse desde un gesto del usuario (política de autoplay). */
  async unlock(): Promise<AudioStatus> {
    try {
      this.ctx ??= this.factory();
      if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
    } catch {
      /* sin audio: se degrada a aviso visual */
    }
    return this.status;
  }

  get status(): AudioStatus {
    if (!this.ctx) return 'unavailable';
    return this.ctx.state === 'running' ? 'running' : 'suspended';
  }

  /** Reproduce un patrón. Si el contexto está suspendido intenta reanudarlo y suena en cuanto lo logra. */
  play(kind: ToneKind, set: ToneSetId, volume: number): boolean {
    try {
      this.ctx ??= this.factory();
    } catch {
      return false;
    }
    const ctx = this.ctx;
    if (!ctx) return false;
    if (ctx.state !== 'running') {
      ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') this.schedule(ctx, kind, set, volume);
        })
        .catch(() => undefined);
      return false;
    }
    this.schedule(ctx, kind, set, volume);
    return true;
  }

  private schedule(ctx: AudioContextLike, kind: ToneKind, set: ToneSetId, volume: number): void {
    const vol = Math.min(Math.max(volume, 0), 1);
    const t0 = ctx.currentTime;
    for (const note of toneFor(set, kind)) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.wave;
      osc.frequency.value = note.freq;
      const start = t0 + note.startMs / 1000;
      const end = start + note.durMs / 1000;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.gain * vol, start + 0.02);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }
}

export const browserAudioFactory = (): AudioContextLike | null => {
  const Ctor = (globalThis as { AudioContext?: new () => AudioContextLike }).AudioContext;
  return Ctor ? new Ctor() : null;
};
