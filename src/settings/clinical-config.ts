// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

// Fuente única de umbrales clínicos. TODOS son valores de partida NO validados clínicamente.
// Deben ser revisados por un/a fisioterapeuta humano/a antes de cualquier uso real (ver docs/CLINICAL.md).
import type { CaptureMode, Confidence, DeviationId } from '../core/types';

export interface Sourced<T> {
  value: T;
  confidence: Confidence;
  note: string;
}

export interface ThresholdSpec {
  /** Desviación (respecto a la línea base personal) a partir de la cual se considera zona ámbar. */
  amber: number;
  /** Idem para zona roja. */
  red: number;
  unit: 'deg' | 'pct';
  confidence: Confidence;
  note: string;
}

export type ThresholdTable = Partial<Record<DeviationId, ThresholdSpec>>;

export interface ClinicalConfig {
  version: number;
  /** false hasta que una persona profesional revise los valores. */
  clinicianReviewed: boolean;
  thresholds: Record<CaptureMode, ThresholdTable>;
  /** Margen de ruido: umbral efectivo = max(config, k·σ de calibración). */
  sigmaMultiplier: Sourced<number>;
  stateMachine: {
    mildAfterAmberMs: Sourced<number>;
    badAfterRedMs: Sourced<number>;
    badAfterAmberMs: Sourced<number>;
    criticalAfterRedMs: Sourced<number>;
    exitGreenMs: Sourced<number>;
    /** Fracción del umbral ámbar bajo la que debe estar el valor para considerar "verde de salida". */
    exitMargin: Sourced<number>;
    /** Un salto temporal mayor reinicia los cronómetros sostenidos (suspensión, throttling). */
    maxGapMs: Sourced<number>;
  };
  /** Referencia informativa de la literatura (nunca veredicto). */
  cvaReference: Sourced<{ lowBelowDeg: [number, number] }>;
  /** Frecuencia de parpadeo y aviso de hidratación ocular (heurístico, sin validación clínica). */
  blink: {
    /** Por debajo de esta frecuencia (parpadeos/min) se considera baja. */
    lowBelowPerMin: Sourced<number>;
    /** Tiempo continuo con frecuencia baja antes de sugerir hidratación. */
    sustainedLowMs: Sourced<number>;
    /** Tiempo mínimo entre dos sugerencias. */
    cooldownMs: Sourced<number>;
  };
  /** Umbrales de los resúmenes y las pautas (todos heurísticos, sin validación clínica). */
  statistics: {
    /** Una ausencia más corta no cuenta como pausa (parpadeo del detector). */
    minAwayMs: Sourced<number>;
    /** Sedestación continua a partir de la cual se sugiere levantarse. */
    longSittingMs: Sourced<number>;
    /** Tiempo sentado analizado mínimo para una fiabilidad alta / baja. */
    reliableSeatedMs: Sourced<number>;
    lowSeatedMs: Sourced<number>;
    /** Cobertura (sentado analizado / tiempo con persona o cámara) mínima para fiabilidad alta / baja. */
    reliableCoverage: Sourced<number>;
    lowCoverage: Sourced<number>;
    /** Tiempo sentado mínimo en una hora para tenerla en cuenta en patrones horarios. */
    minHourSeatedMs: Sourced<number>;
    /** Fracción mínima del tiempo mal que debe acumular una desviación para considerarla dominante. */
    dominantShare: Sourced<number>;
    /** Porcentaje de buena postura por debajo del cual se sugiere actuar. */
    goodRatioTarget: Sourced<number>;
    /** Fracción de descansos omitidos / avisos sin corregir a partir de la cual se comenta. */
    skippedBreaksShare: Sourced<number>;
    ignoredAlertsShare: Sourced<number>;
    /** Ausencias por hora sentada por debajo de las cuales se anima a moverse más. */
    minAwayPerSeatedHour: Sourced<number>;
    /** Diferencia de buena postura entre la primera y la segunda mitad de la jornada para hablar de fatiga. */
    fatigueDrop: Sourced<number>;
  };
}

const H: Confidence = 'heurística';

export const CLINICAL_CONFIG: ClinicalConfig = {
  version: 1,
  clinicianReviewed: false,
  thresholds: {
    frontal: {
      protrusion: {
        amber: 6,
        red: 12,
        unit: 'pct',
        confidence: H,
        note: 'Aumento de escala facial respecto a la escala de hombros (% sobre la base). Proxy de protrusión; no es CVA.',
      },
      headDown: {
        amber: 8,
        red: 15,
        unit: 'deg',
        confidence: H,
        note: 'Cabeceo hacia abajo respecto a la base (Face Landmarker o proxy nariz-ojos).',
      },
      slouch: {
        amber: 6,
        red: 12,
        unit: 'pct',
        confidence: H,
        note: 'Descenso del tronco en imagen, en % del ancho de hombros base. Requiere cámara y silla fijas.',
      },
      shoulderElevation: {
        amber: 6,
        red: 12,
        unit: 'pct',
        confidence: H,
        note: 'Acortamiento cuello-hombro en % del ancho de hombros base.',
      },
      shoulderAsymmetry: {
        amber: 3,
        red: 6,
        unit: 'deg',
        confidence: H,
        note: 'Cambio de inclinación de la línea de hombros respecto a la base.',
      },
      headTilt: {
        amber: 6,
        red: 10,
        unit: 'deg',
        confidence: H,
        note: 'Cambio de inclinación de la línea de ojos respecto a la base.',
      },
      headRotation: {
        amber: 15,
        red: 25,
        unit: 'deg',
        confidence: H,
        note: 'Rotación (yaw) respecto a la base. Girar la cabeza con frecuencia es normal; solo cuenta si se mantiene.',
      },
      proximity: {
        amber: 10,
        red: 20,
        unit: 'pct',
        confidence: H,
        note: 'Crecimiento de la escala de hombros (tronco más cerca de la pantalla).',
      },
    },
    lateral: {
      protrusion: {
        amber: 5,
        red: 10,
        unit: 'deg',
        confidence: H,
        note: 'ΔCVA aproximado (oreja-hombro con C7 estimado) por debajo de la base.',
      },
      headDown: {
        amber: 8,
        red: 15,
        unit: 'deg',
        confidence: H,
        note: 'Aumento del ángulo oreja-nariz hacia abajo respecto a la base.',
      },
      slouch: {
        amber: 6,
        red: 12,
        unit: 'deg',
        confidence: H,
        note: 'Aumento de inclinación anterior del tronco (hombro-cadera); solo si la cadera es visible.',
      },
    },
    oblique: {
      protrusion: {
        amber: 4,
        red: 8,
        unit: 'deg',
        confidence: H,
        note: 'ΔCVA aproximado del lado más visible visto en ángulo; el escorzo reduce la sensibilidad, por eso el umbral es menor que en lateral.',
      },
      headDown: {
        amber: 8,
        red: 15,
        unit: 'deg',
        confidence: H,
        note: 'Cabeceo hacia abajo respecto a la base (Face Landmarker o ángulo oreja-nariz).',
      },
      slouch: {
        amber: 10,
        red: 20,
        unit: 'pct',
        confidence: H,
        note: 'Descenso del lado visible en imagen, en % de la distancia oreja-hombro base. Requiere cámara y silla fijas.',
      },
      shoulderElevation: {
        amber: 10,
        red: 20,
        unit: 'pct',
        confidence: H,
        note: 'Acortamiento cuello-hombro del lado visible, en % de la distancia oreja-hombro base.',
      },
      headTilt: {
        amber: 6,
        red: 10,
        unit: 'deg',
        confidence: H,
        note: 'Cambio de inclinación de la línea de ojos respecto a la base (si ambos ojos son visibles).',
      },
      headRotation: {
        amber: 15,
        red: 25,
        unit: 'deg',
        confidence: H,
        note: 'Rotación (yaw) respecto a la base, solo con Face Landmarker. Mirar a otra pantalla es normal: se calibra en esa postura.',
      },
    },
  },
  sigmaMultiplier: { value: 2, confidence: 'consenso', note: '≥ 2σ del ruido medido en la calibración.' },
  stateMachine: {
    mildAfterAmberMs: { value: 10_000, confidence: H, note: 'AVISO_LEVE tras ≥ 10 s en ámbar.' },
    badAfterRedMs: { value: 20_000, confidence: H, note: 'MALA_POSTURA tras ≥ 20 s en rojo.' },
    badAfterAmberMs: { value: 120_000, confidence: H, note: 'MALA_POSTURA tras ≥ 2 min en ámbar.' },
    criticalAfterRedMs: { value: 300_000, confidence: H, note: 'CRITICA tras ≥ 5 min en rojo.' },
    exitGreenMs: { value: 5_000, confidence: H, note: 'Salida a OK tras ≥ 5 s en verde (histéresis).' },
    exitMargin: { value: 0.2, confidence: H, note: 'Verde de salida: 20 % por dentro del umbral ámbar.' },
    maxGapMs: { value: 5_000, confidence: H, note: 'Hueco temporal que invalida la continuidad.' },
  },
  cvaReference: {
    value: { lowBelowDeg: [48, 50] },
    confidence: 'literatura limitada',
    note: 'CVA < ~48–50° sugiere protrusión; el corte varía entre estudios. Solo informativo.',
  },
  blink: {
    lowBelowPerMin: {
      value: 10,
      confidence: 'literatura limitada',
      note: 'En reposo ~15–20 parpadeos/min; frente a pantallas baja a ~5–7. Por debajo de 10 se sugiere hidratar.',
    },
    sustainedLowMs: { value: 3 * 60_000, confidence: H, note: 'Frecuencia baja sostenida ≥ 3 min.' },
    cooldownMs: { value: 20 * 60_000, confidence: H, note: 'Máximo una sugerencia cada 20 min.' },
  },
  statistics: {
    minAwayMs: { value: 30_000, confidence: H, note: 'Ausencias < 30 s no cuentan como pausa.' },
    longSittingMs: { value: 60 * 60_000, confidence: H, note: 'Sedestación continua prolongada: 60 min.' },
    reliableSeatedMs: {
      value: 60 * 60_000,
      confidence: H,
      note: '≥ 60 min sentado y analizado: fiabilidad alta.',
    },
    lowSeatedMs: {
      value: 15 * 60_000,
      confidence: H,
      note: '≥ 15 min sentado y analizado: fiabilidad baja.',
    },
    reliableCoverage: { value: 0.7, confidence: H, note: 'Cobertura ≥ 70 %: fiabilidad alta.' },
    lowCoverage: {
      value: 0.3,
      confidence: H,
      note: 'Cobertura ≥ 30 %: fiabilidad baja; por debajo no hay conclusiones.',
    },
    minHourSeatedMs: {
      value: 5 * 60_000,
      confidence: H,
      note: 'Una hora con < 5 min sentado no entra en patrones.',
    },
    dominantShare: {
      value: 0.35,
      confidence: H,
      note: 'Una desviación con ≥ 35 % del tiempo mal es la dominante.',
    },
    goodRatioTarget: {
      value: 0.8,
      confidence: H,
      note: 'Objetivo orientativo: ≥ 80 % del tiempo en buena postura.',
    },
    skippedBreaksShare: { value: 0.4, confidence: H, note: '≥ 40 % de descansos omitidos.' },
    ignoredAlertsShare: { value: 0.5, confidence: H, note: '≥ 50 % de avisos sin corregir la postura.' },
    minAwayPerSeatedHour: {
      value: 1,
      confidence: H,
      note: '< 1 pausa por hora sentada: poca variación de postura.',
    },
    fatigueDrop: { value: 0.15, confidence: H, note: 'Caída ≥ 15 puntos de la primera a la segunda mitad.' },
  },
};

const CONFIDENCES: readonly Confidence[] = ['consenso', 'literatura limitada', 'heurística'];

/** Devuelve una lista de problemas; vacía si la configuración es válida. */
export function validateClinicalConfig(cfg: ClinicalConfig): string[] {
  const errors: string[] = [];
  const checkConf = (path: string, c: unknown): void => {
    if (!CONFIDENCES.includes(c as Confidence)) errors.push(`${path}: nivel de confianza inválido`);
  };
  for (const mode of ['frontal', 'lateral', 'oblique'] as const) {
    for (const [id, spec] of Object.entries(cfg.thresholds[mode])) {
      const p = `thresholds.${mode}.${id}`;
      if (!spec) continue;
      if (!(spec.amber > 0) || !(spec.red > spec.amber)) errors.push(`${p}: se exige 0 < amber < red`);
      if (spec.unit !== 'deg' && spec.unit !== 'pct') errors.push(`${p}: unidad inválida`);
      checkConf(p, spec.confidence);
    }
  }
  const sm = cfg.stateMachine;
  for (const [k, v] of Object.entries(sm)) {
    checkConf(`stateMachine.${k}`, v.confidence);
    if (!(v.value > 0)) errors.push(`stateMachine.${k}: debe ser positivo`);
  }
  if (sm.exitMargin.value >= 1) errors.push('stateMachine.exitMargin: debe ser < 1');
  if (!(cfg.sigmaMultiplier.value >= 2)) errors.push('sigmaMultiplier: debe ser ≥ 2');
  checkConf('sigmaMultiplier', cfg.sigmaMultiplier.confidence);
  checkConf('cvaReference', cfg.cvaReference.confidence);
  for (const [k, v] of Object.entries(cfg.blink)) {
    checkConf(`blink.${k}`, v.confidence);
    if (!(v.value > 0)) errors.push(`blink.${k}: debe ser positivo`);
  }
  for (const [k, v] of Object.entries(cfg.statistics)) {
    checkConf(`statistics.${k}`, v.confidence);
    if (!(v.value > 0)) errors.push(`statistics.${k}: debe ser positivo`);
  }
  return errors;
}
