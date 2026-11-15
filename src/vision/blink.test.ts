import { describe, expect, it } from 'vitest';
import { BlinkDetector } from './blink';

const FRAME = 1000 / 15;

/** Alimenta `seconds` de vídeo a 15 fps; `blinkEverySec` inserta un cierre de `closedFrames` fotogramas. */
function run(d: BlinkDetector, seconds: number, blinkEverySec: number, closedFrames = 2, startT = 0): number {
  let t = startT;
  const frames = Math.round((seconds * 1000) / FRAME);
  const period = Math.round((blinkEverySec * 1000) / FRAME);
  for (let i = 0; i < frames; i++) {
    t += FRAME;
    const closed = i % period < closedFrames && blinkEverySec > 0;
    d.step(t, closed ? 0.9 : 0.05);
  }
  return t;
}

describe('BlinkDetector', () => {
  it('cuenta ~15 parpadeos/min con un parpadeo cada 4 s', () => {
    const d = new BlinkDetector();
    const t = run(d, 60, 4);
    expect(d.ratePerMin(t)).toBeCloseTo(15, 0);
  });

  it('detecta una frecuencia baja', () => {
    const d = new BlinkDetector();
    const t = run(d, 60, 15);
    expect(d.ratePerMin(t)).toBeLessThan(5);
  });

  it('devuelve null sin cobertura suficiente', () => {
    const d = new BlinkDetector();
    const t = run(d, 20, 4);
    expect(d.ratePerMin(t)).toBeNull();
  });

  it('un cierre prolongado no cuenta como parpadeo', () => {
    const d = new BlinkDetector();
    const t = run(d, 60, 20, 30);
    expect(d.ratePerMin(t)).toBe(0);
  });

  it('la histéresis ignora el ruido entre los umbrales', () => {
    const d = new BlinkDetector();
    let t = 0;
    for (let i = 0; i < 15 * 60; i++) {
      t += FRAME;
      d.step(t, i % 2 ? 0.45 : 0.35);
    }
    expect(d.ratePerMin(t)).toBe(0);
  });

  it('las muestras no válidas no aportan cobertura', () => {
    const d = new BlinkDetector();
    let t = 0;
    for (let i = 0; i < 15 * 60; i++) {
      t += FRAME;
      d.step(t, null);
    }
    expect(d.ratePerMin(t)).toBeNull();
  });

  it('un hueco largo reinicia el cierre en curso', () => {
    const d = new BlinkDetector();
    d.step(0, 0.9);
    expect(d.step(5000, 0.05).blinked).toBe(false);
  });

  it('reset borra el historial', () => {
    const d = new BlinkDetector();
    const t = run(d, 60, 4);
    d.reset();
    expect(d.ratePerMin(t)).toBeNull();
  });
});
