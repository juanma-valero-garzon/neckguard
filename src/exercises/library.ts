import type { DeviationId } from '../core/types';
import type { BreakKind } from '../breaks/timers';
import type { PresetId } from '../settings/schema';

export type ExerciseLevel = 'basic' | 'advanced';
export type IllustrationId = 'chinTuck' | 'chinTuckExt' | 'neckExt' | 'thoracic' | 'shoulders' | 'lumbarRoll';

export interface Exercise {
  id: string;
  level: ExerciseLevel;
  /** Nº de pasos y de precauciones; los textos viven en el catálogo i18n. */
  steps: number;
  cautions: number;
  illustration: IllustrationId;
  /** Duración orientativa de la versión guiada (s). */
  guidedSeconds: number;
}

export const EXERCISES: readonly Exercise[] = [
  { id: 'chinTuck', level: 'basic', steps: 4, cautions: 2, illustration: 'chinTuck', guidedSeconds: 60 },
  {
    id: 'chinTuckExt',
    level: 'advanced',
    steps: 4,
    cautions: 3,
    illustration: 'chinTuckExt',
    guidedSeconds: 60,
  },
  {
    id: 'neckExt',
    level: 'advanced',
    steps: 4,
    cautions: 3,
    illustration: 'neckExt',
    guidedSeconds: 60,
  },
  { id: 'thoracic', level: 'basic', steps: 4, cautions: 2, illustration: 'thoracic', guidedSeconds: 45 },
  { id: 'shoulders', level: 'basic', steps: 3, cautions: 1, illustration: 'shoulders', guidedSeconds: 45 },
  { id: 'lumbarRoll', level: 'basic', steps: 3, cautions: 2, illustration: 'lumbarRoll', guidedSeconds: 0 },
];

/** Claves i18n que cada ejercicio necesita (para verificar paridad es/en). */
export function exerciseKeys(ex: Exercise): string[] {
  const p = `exercise.${ex.id}`;
  return [
    `${p}.name`,
    `${p}.objective`,
    `${p}.reps`,
    `${p}.stop`,
    ...Array.from({ length: ex.steps }, (_, i) => `${p}.step.${i + 1}`),
    ...Array.from({ length: ex.cautions }, (_, i) => `${p}.caution.${i + 1}`),
  ];
}

export interface ExerciseGate {
  /** Confirmado en el onboarding: ninguna señal de alerta. Sin esto no se muestra ningún ejercicio. */
  redFlagsConfirmed: boolean;
  advancedAccepted: boolean;
  preset: PresetId;
}

export const canUseExercises = (g: ExerciseGate): boolean => g.redFlagsConfirmed;

export function canShow(ex: Exercise, g: ExerciseGate): boolean {
  if (!canUseExercises(g)) return false;
  if (ex.level === 'basic') return true;
  return g.advancedAccepted && g.preset !== 'sensitive';
}

export const visibleExercises = (g: ExerciseGate): Exercise[] => EXERCISES.filter((e) => canShow(e, g));

const BY_DEVIATION: Partial<Record<DeviationId, string>> = {
  protrusion: 'chinTuck',
  headDown: 'chinTuck',
  slouch: 'thoracic',
  shoulderElevation: 'shoulders',
  shoulderAsymmetry: 'shoulders',
};

/** Ejercicio sugerido para un descanso (o para una desviación persistente); siempre uno visible. */
export function suggestExercise(
  kind: BreakKind,
  g: ExerciseGate,
  reason?: DeviationId | null,
): Exercise | null {
  const visible = visibleExercises(g);
  if (visible.length === 0) return null;
  const preferred = kind === 'long' ? 'thoracic' : ((reason && BY_DEVIATION[reason]) ?? 'chinTuck');
  return visible.find((e) => e.id === preferred) ?? (visible[0] as Exercise);
}

/** Regla de seguridad: si el síntoma se extiende al brazo o empeora ⇒ parar. */
export const SYMPTOM_RULE_KEY = 'exercise.rule.symptoms';
