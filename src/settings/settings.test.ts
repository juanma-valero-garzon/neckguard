// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { describe, expect, it } from 'vitest';
import { CLINICAL_CONFIG, validateClinicalConfig, type ClinicalConfig } from './clinical-config';
import { resolvePreset } from './presets';
import {
  DEFAULT_SETTINGS,
  SETTINGS_FIELD_PATHS,
  cameraModeKey,
  sanitizeSettings,
  validateSettingsPatch,
} from './schema';

describe('clinical-config', () => {
  it('la configuración por defecto es válida', () => {
    expect(validateClinicalConfig(CLINICAL_CONFIG)).toEqual([]);
  });

  it('todos los umbrales declaran nivel de confianza y nota', () => {
    for (const mode of ['frontal', 'lateral', 'oblique'] as const) {
      for (const spec of Object.values(CLINICAL_CONFIG.thresholds[mode])) {
        expect(['consenso', 'literatura limitada', 'heurística']).toContain(spec?.confidence);
        expect(spec?.note.length).toBeGreaterThan(5);
      }
    }
    expect(CLINICAL_CONFIG.clinicianReviewed).toBe(false);
  });

  it('rechaza valores inválidos', () => {
    const bad = structuredClone(CLINICAL_CONFIG) as ClinicalConfig;
    bad.thresholds.frontal.protrusion = { ...bad.thresholds.frontal.protrusion!, amber: 10, red: 5 };
    bad.thresholds.lateral.headDown = {
      ...bad.thresholds.lateral.headDown!,
      confidence: 'x' as never,
      unit: 'm' as never,
    };
    bad.stateMachine.exitMargin.value = 1.2;
    bad.stateMachine.exitGreenMs.value = -1;
    bad.sigmaMultiplier.value = 1;
    bad.cvaReference.confidence = 'y' as never;
    const errors = validateClinicalConfig(bad);
    expect(errors.join('\n')).toMatch(/thresholds\.frontal\.protrusion/);
    expect(errors.join('\n')).toMatch(/thresholds\.lateral\.headDown: nivel/);
    expect(errors.join('\n')).toMatch(/unidad/);
    expect(errors.join('\n')).toMatch(/exitMargin/);
    expect(errors.join('\n')).toMatch(/exitGreenMs/);
    expect(errors.join('\n')).toMatch(/sigmaMultiplier/);
    expect(errors.join('\n')).toMatch(/cvaReference/);
  });
});

describe('sanitizeSettings', () => {
  it('sin entrada devuelve los valores por defecto y registra todos los campos', () => {
    const r = sanitizeSettings(undefined);
    expect(r.settings).toEqual(DEFAULT_SETTINGS);
    expect(r.defaultsApplied.sort()).toEqual([...SETTINGS_FIELD_PATHS].sort());
  });

  it('conserva valores válidos y no registra defaults para ellos', () => {
    const r = sanitizeSettings({ locale: 'en', fps: 20, alerts: { volume: 0.2 }, preferredSide: 'left' });
    expect(r.settings.locale).toBe('en');
    expect(r.settings.fps).toBe(20);
    expect(r.settings.alerts.volume).toBe(0.2);
    expect(r.settings.preferredSide).toBe('left');
    expect(r.defaultsApplied).not.toContain('locale');
    expect(r.defaultsApplied).toContain('mode');
  });

  it('rechaza valores fuera de rango o de tipo incorrecto', () => {
    const r = sanitizeSettings({
      fps: 500,
      alerts: { volume: 3, toneSet: 'laser', cooldownMin: 1.5 },
      locale: 'fr',
      cameraLabel: 'x'.repeat(999),
      showPreview: 'yes',
      sensitivity: Number.NaN,
    });
    expect(r.settings.fps).toBe(DEFAULT_SETTINGS.fps);
    expect(r.settings.alerts.volume).toBe(DEFAULT_SETTINGS.alerts.volume);
    expect(r.settings.alerts.toneSet).toBe('soft');
    expect(r.settings.alerts.cooldownMin).toBe(5);
    expect(r.settings.locale).toBe('es');
    expect(r.settings.cameraLabel).toBe('');
    expect(r.settings.showPreview).toBe(true);
    for (const p of ['fps', 'alerts.volume', 'locale', 'sensitivity']) expect(r.defaultsApplied).toContain(p);
  });

  it('valida parches parciales', () => {
    expect(validateSettingsPatch({ fps: 10, 'alerts.volume': 0.5 })).toEqual([]);
    expect(validateSettingsPatch({ fps: 1 })).toHaveLength(1);
    expect(validateSettingsPatch({ nope: 1 })[0]).toMatch(/desconocido/);
  });
});

describe('modo por cámara', () => {
  it('recuerda el modo de cada cámara y descarta entradas inválidas', () => {
    const r = sanitizeSettings({
      cameraModes: {
        FaceTime: 'lateral',
        'USB Cam': 'frontal',
        malo: 'diagonal',
        '': 'frontal',
        ['x'.repeat(600)]: 'frontal',
      },
    });
    expect(r.settings.cameraModes).toEqual({ FaceTime: 'lateral', 'USB Cam': 'frontal' });
    expect(sanitizeSettings({ cameraModes: [] }).settings.cameraModes).toEqual({});
    expect(sanitizeSettings({ cameraModes: 'x' }).settings.cameraModes).toEqual({});
    expect(sanitizeSettings(undefined).settings.cameraModes).toEqual({});
    expect(
      sanitizeSettings({ cameraModes: { Portátil: 'oblique' }, mode: 'oblique' }).settings,
    ).toMatchObject({
      mode: 'oblique',
      cameraModes: { Portátil: 'oblique' },
    });
  });

  it('limita el número de cámaras recordadas', () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`cam${i}`, 'frontal']));
    expect(Object.keys(sanitizeSettings({ cameraModes: many }).settings.cameraModes)).toHaveLength(20);
  });

  it('la clave usa la etiqueta y, si no hay, el deviceId', () => {
    expect(cameraModeKey({ deviceId: 'abc', label: 'FaceTime' })).toBe('FaceTime');
    expect(cameraModeKey({ deviceId: 'abc', label: '' })).toBe('abc');
  });
});

describe('tarjetas contraídas', () => {
  it('valida, deduplica y limita los ids', () => {
    expect(
      sanitizeSettings({ collapsedCards: ['a', 'a', 'b', 3, '', 'x'.repeat(50)] }).settings.collapsedCards,
    ).toEqual(['a', 'b']);
    expect(sanitizeSettings({ collapsedCards: 'x' }).settings.collapsedCards).toEqual([]);
    expect(sanitizeSettings(undefined).settings.collapsedCards).toEqual([]);
    const many = Array.from({ length: 40 }, (_, i) => `c${i}`);
    expect(sanitizeSettings({ collapsedCards: many }).settings.collapsedCards).toHaveLength(20);
  });
});

describe('presets', () => {
  it('Estándar 30/55 min; Sensible 20/45 y sin ejercicios avanzados', () => {
    const std = resolvePreset({ ...DEFAULT_SETTINGS, preset: 'standard' });
    expect(std.breaks.microIntervalMs).toBe(30 * 60_000);
    expect(std.breaks.longIntervalMs).toBe(55 * 60_000);
    expect(std.sensitivityScale).toBe(1);
    expect(std.showAdvancedExercises).toBe(true);
    const sen = resolvePreset({ ...DEFAULT_SETTINGS, preset: 'sensitive' });
    expect(sen.breaks.microIntervalMs).toBe(20 * 60_000);
    expect(sen.breaks.longIntervalMs).toBe(45 * 60_000);
    expect(sen.sensitivityScale).toBe(0.8);
    expect(sen.showAdvancedExercises).toBe(false);
  });

  it('Personalizado usa los ajustes del usuario; el largo siempre > micro', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      preset: 'custom' as const,
      sensitivity: 1.3,
      breaks: { ...DEFAULT_SETTINGS.breaks, microMin: 40, longMin: 20, eyeEnabled: true },
    };
    const r = resolvePreset(s);
    expect(r.breaks.microIntervalMs).toBe(40 * 60_000);
    expect(r.breaks.longIntervalMs).toBe(41 * 60_000);
    expect(r.breaks.eyeEnabled).toBe(true);
    expect(r.sensitivityScale).toBe(1.3);
  });

  it('traduce ajustes de alertas al núcleo', () => {
    const r = resolvePreset({
      ...DEFAULT_SETTINGS,
      alerts: { ...DEFAULT_SETTINGS.alerts, cooldownMin: 10, quietEnabled: true, dnd: true },
    });
    expect(r.alerts.cooldownMs).toBe(10 * 60_000);
    expect(r.alerts.quiet.enabled).toBe(true);
    expect(r.alerts.dnd).toBe(true);
  });
});
