import { describe, expect, it } from 'vitest';
import {
  EXERCISES,
  SYMPTOM_RULE_KEY,
  canShow,
  canUseExercises,
  exerciseKeys,
  suggestExercise,
  visibleExercises,
  type ExerciseGate,
} from './library';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const gate = (over: Partial<ExerciseGate> = {}): ExerciseGate => ({
  redFlagsConfirmed: true,
  advancedAccepted: false,
  preset: 'standard',
  ...over,
});
const advanced = EXERCISES.find((e) => e.level === 'advanced')!;
const basic = EXERCISES.find((e) => e.level === 'basic')!;

describe('biblioteca de ejercicios', () => {
  it('cada ejercicio tiene objetivo, pasos, repeticiones, cuándo parar, precauciones y nivel (en es y en)', () => {
    for (const ex of EXERCISES) {
      expect(['basic', 'advanced']).toContain(ex.level);
      expect(ex.steps).toBeGreaterThan(0);
      expect(ex.cautions).toBeGreaterThan(0);
      const ks = exerciseKeys(ex);
      expect(ks.some((k) => k.endsWith('.objective'))).toBe(true);
      expect(ks.some((k) => k.endsWith('.stop'))).toBe(true);
      expect(ks.some((k) => k.endsWith('.reps'))).toBe(true);
      for (const k of ks) {
        expect(k in es, k).toBe(true);
        expect(k in en, k).toBe(true);
      }
    }
    expect(SYMPTOM_RULE_KEY in es).toBe(true);
  });

  it('incluye los ejercicios del plan y exactamente dos avanzados', () => {
    expect(EXERCISES.map((e) => e.id)).toEqual([
      'chinTuck',
      'chinTuckExt',
      'neckExt',
      'thoracic',
      'shoulders',
      'lumbarRoll',
    ]);
    expect(EXERCISES.filter((e) => e.level === 'advanced')).toHaveLength(2);
  });

  it('el onboarding bloquea todos los ejercicios sin confirmar la ausencia de señales de alerta', () => {
    const g = gate({ redFlagsConfirmed: false, advancedAccepted: true });
    expect(canUseExercises(g)).toBe(false);
    expect(visibleExercises(g)).toEqual([]);
    expect(canShow(basic, g)).toBe(false);
    expect(suggestExercise('micro', g)).toBeNull();
  });

  it('los avanzados exigen advertencia aceptada', () => {
    expect(canShow(advanced, gate())).toBe(false);
    expect(canShow(advanced, gate({ advancedAccepted: true }))).toBe(true);
    expect(canShow(basic, gate())).toBe(true);
  });

  it('el preset "Sensible" no muestra los avanzados ni aceptándolos', () => {
    const g = gate({ preset: 'sensitive', advancedAccepted: true });
    expect(canShow(advanced, g)).toBe(false);
    expect(visibleExercises(g).every((e) => e.level === 'basic')).toBe(true);
  });

  it('sugiere un ejercicio acorde al descanso y a la desviación, siempre visible', () => {
    expect(suggestExercise('micro', gate(), 'protrusion')?.id).toBe('chinTuck');
    expect(suggestExercise('micro', gate(), 'slouch')?.id).toBe('thoracic');
    expect(suggestExercise('micro', gate(), 'shoulderElevation')?.id).toBe('shoulders');
    expect(suggestExercise('long', gate())?.id).toBe('thoracic');
    expect(suggestExercise('micro', gate())?.id).toBe('chinTuck');
    expect(
      suggestExercise('micro', gate({ preset: 'sensitive', advancedAccepted: true }), 'headTilt')?.level,
    ).toBe('basic');
  });
});
