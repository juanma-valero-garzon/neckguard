export interface BlinkConfig {
  /** Puntuación (0-1) a partir de la cual el ojo se considera cerrado. */
  closeAbove: number;
  /** Puntuación por debajo de la cual vuelve a considerarse abierto (histéresis). */
  openBelow: number;
  /** Un cierre más largo no es un parpadeo (mirada hacia abajo, somnolencia). */
  maxClosedMs: number;
  /** Un hueco entre muestras mayor que este rompe la continuidad. */
  maxGapMs: number;
  windowMs: number;
  /** Tiempo válido mínimo dentro de la ventana para dar una frecuencia. */
  minCoverageMs: number;
}

export const DEFAULT_BLINK_CONFIG: BlinkConfig = {
  closeAbove: 0.5,
  openBelow: 0.3,
  maxClosedMs: 600,
  maxGapMs: 500,
  windowMs: 60_000,
  minCoverageMs: 45_000,
};

export interface BlinkStep {
  /** Se completó un parpadeo en esta muestra. */
  blinked: boolean;
  /** Tiempo válido que aporta esta muestra. */
  validMs: number;
}

/** Cuenta parpadeos a partir de la puntuación de cierre ocular; solo guarda marcas de tiempo, nunca imágenes. */
export class BlinkDetector {
  private closedSince: number | null = null;
  private lastT: number | null = null;
  private blinks: number[] = [];
  private valid: { t: number; dt: number }[] = [];

  constructor(private readonly cfg: BlinkConfig = DEFAULT_BLINK_CONFIG) {}

  reset(): void {
    this.closedSince = null;
    this.lastT = null;
    this.blinks = [];
    this.valid = [];
  }

  /** `score` null: no hay medida fiable (sin cara, ojos fuera de cuadro…). */
  step(t: number, score: number | null): BlinkStep {
    const none: BlinkStep = { blinked: false, validMs: 0 };
    const prev = this.lastT;
    this.lastT = t;
    if (score === null || !Number.isFinite(score)) {
      this.closedSince = null;
      return none;
    }
    const gap = prev === null ? Infinity : t - prev;
    if (gap > this.cfg.maxGapMs) {
      this.closedSince = null;
      this.prune(t);
      if (score > this.cfg.closeAbove) this.closedSince = t;
      return none;
    }
    this.valid.push({ t, dt: gap });
    let blinked = false;
    if (this.closedSince === null) {
      if (score > this.cfg.closeAbove) this.closedSince = t;
    } else if (score < this.cfg.openBelow) {
      if (t - this.closedSince <= this.cfg.maxClosedMs) {
        this.blinks.push(t);
        blinked = true;
      }
      this.closedSince = null;
    }
    this.prune(t);
    return { blinked, validMs: gap };
  }

  /** Parpadeos por minuto en la ventana reciente; null si no hay cobertura suficiente. */
  ratePerMin(t: number): number | null {
    this.prune(t);
    let coverage = 0;
    for (const v of this.valid) coverage += v.dt;
    if (coverage < this.cfg.minCoverageMs) return null;
    return (this.blinks.length * 60_000) / coverage;
  }

  private prune(t: number): void {
    const cutoff = t - this.cfg.windowMs;
    let i = 0;
    while (i < this.blinks.length && (this.blinks[i] as number) < cutoff) i++;
    if (i) this.blinks.splice(0, i);
    i = 0;
    while (i < this.valid.length && (this.valid[i] as { t: number }).t < cutoff) i++;
    if (i) this.valid.splice(0, i);
  }
}
