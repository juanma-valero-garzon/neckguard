// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEVIATION_IDS, LEVELS } from '../core/types';
import { EXERCISES, exerciseKeys } from '../exercises/library';
import { en } from './en';
import { es } from './es';
import {
  LOCALES,
  detectLocale,
  formatDate,
  formatDuration,
  formatMmSs,
  formatTime,
  makeT,
  translate,
} from './index';

const keys = (o: object): string[] => Object.keys(o).sort();

describe('i18n: paridad de catálogos', () => {
  it('todas las claves de es existen en en y viceversa', () => {
    const missingInEn = keys(es).filter((k) => !(k in en));
    const missingInEs = keys(en).filter((k) => !(k in es));
    expect(missingInEn).toEqual([]);
    expect(missingInEs).toEqual([]);
  });

  it('ningún valor está vacío y los marcadores {param} coinciden entre idiomas', () => {
    const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
    for (const k of keys(es)) {
      const a = (es as Record<string, string>)[k] as string;
      const b = (en as Record<string, string>)[k] as string;
      expect(a.trim().length, k).toBeGreaterThan(0);
      expect(b.trim().length, k).toBeGreaterThan(0);
      expect(params(a), k).toEqual(params(b));
    }
  });

  it('las claves plurales tienen .one y .other en ambos idiomas', () => {
    const bases = new Set(
      keys(es)
        .filter((k) => /\.(one|other)$/.test(k))
        .map((k) => k.replace(/\.(one|other)$/, '')),
    );
    expect(bases.size).toBeGreaterThan(3);
    for (const b of bases)
      for (const cat of ['one', 'other']) {
        expect(`${b}.${cat}` in es, `${b}.${cat} es`).toBe(true);
        expect(`${b}.${cat}` in en, `${b}.${cat} en`).toBe(true);
      }
  });
});

describe('i18n: cobertura de las claves usadas por la UI', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(join(dir, e.name))
        : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)
          ? [join(dir, e.name)]
          : [],
    );
  const root = join(__dirname, '..');
  const files = [...walk(join(root, 'ui')), ...walk(join(root, 'app'))];
  const all = new Set([...Object.keys(es)]);
  const has = (k: string): boolean => all.has(k) || all.has(`${k}.one`);

  it('toda clave estática t("...") existe', () => {
    const used = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1] as string);
      for (const m of src.matchAll(
        /(?:key|Key|toast)\w*\(?[:=]?\s*'((?:toast|break|stats|settings)\.[a-zA-Z0-9_.]+)'/g,
      ))
        used.add(m[1] as string);
    }
    expect(used.size).toBeGreaterThan(100);
    expect([...used].filter((k) => !has(k))).toEqual([]);
  });

  it('las familias dinámicas están completas', () => {
    const fam: string[] = [];
    for (const id of DEVIATION_IDS) fam.push(`deviation.${id}`, `alert.msg.${id}`);
    for (const l of LEVELS) fam.push(`level.${l}`);
    for (const r of [
      'notCalibrated',
      'paused',
      'locked',
      'noData',
      'absent',
      'lowLight',
      'backlit',
      'lowConfidence',
      'standing',
    ])
      fam.push(`suppressed.${r}`);
    for (const r of ['notCalibrated', 'noData', 'lowLight', 'backlit', 'lowConfidence', 'standing'])
      fam.push(`suppressed.help.${r}`);
    for (const r of [
      'tooFewSamples',
      'lowConfidence',
      'missingLandmarks',
      'excessiveMovement',
      'highVariance',
      'badPlacement',
    ])
      fam.push(`calibration.fail.${r}`);
    for (const r of ['denied', 'notFound', 'busy', 'overconstrained', 'insecure', 'unknown'])
      fam.push(`camera.error.${r}`);
    for (const r of ['completed', 'declared', 'skipped']) fam.push(`toast.break.${r}`);
    for (const r of ['unavailable', 'running', 'suspended']) fam.push(`audio.${r}`);
    for (const r of ['granted', 'denied', 'default', 'unsupported']) fam.push(`notif.${r}`);
    for (const r of ['restoredFromBackup', 'reset']) fam.push(`data.load.${r}`);
    for (const r of ['standard', 'sensitive', 'custom']) fam.push(`preset.${r}`, `preset.${r}.desc`);
    for (const r of ['frontal', 'lateral', 'oblique'])
      fam.push(`mode.${r}`, `mode.${r}.desc`, `mode.${r}.short`, `calibration.place.${r}`);
    for (const r of ['micro', 'long'])
      fam.push(
        `break.kind.${r}`,
        `break.title.${r}`,
        `break.body.${r}`,
        `break.notification.title.${r}`,
        `break.notification.body.${r}`,
      );
    for (const r of ['soft', 'chime', 'wood']) fam.push(`tone.${r}`);
    for (const r of [
      'arm',
      'tingling',
      'weakness',
      'dizzy',
      'vision',
      'worse',
      'trauma',
      'fever',
      'sphincter',
    ])
      fam.push(`redflag.${r}`);
    for (const r of ['consensus', 'limited', 'heuristic']) fam.push(`confidence.${r}`);
    for (const ex of EXERCISES) fam.push(...exerciseKeys(ex));
    expect(fam.filter((k) => !has(k))).toEqual([]);
  });
});

describe('i18n: traducción, plurales y formatos', () => {
  it('interpola parámetros y deja intactos los desconocidos', () => {
    expect(translate('es', 'onboarding.step', { current: 2, total: 4 })).toBe('Paso 2 de 4');
    expect(translate('en', 'onboarding.step', { current: 2, total: 4 })).toBe('Step 2 of 4');
    expect(translate('es', 'onboarding.step', { current: 2 })).toBe('Paso 2 de {total}');
  });

  it('pluraliza por locale', () => {
    expect(translate('es', 'toast.snoozed', { count: 1 })).toBe('Avisos pospuestos 1 minuto.');
    expect(translate('es', 'toast.snoozed', { count: 15 })).toBe('Avisos pospuestos 15 minutos.');
    expect(translate('en', 'toast.snoozed', { count: 1 })).toBe('Alerts snoozed for 1 minute.');
    expect(translate('en', 'toast.snoozed', { count: 30 })).toBe('Alerts snoozed for 30 minutes.');
    expect(makeT('en')('tray.sitting', { count: 0 })).toBe('Sitting: 0 minutes');
  });

  it('claves desconocidas devuelven la propia clave', () => {
    expect(translate('en', 'no.existe')).toBe('no.existe');
  });

  it('formatea fecha, hora y duración según el locale', () => {
    const ts = Date.UTC(2026, 0, 5, 15, 30);
    expect(formatDate('es', ts, { dateStyle: 'long', timeZone: 'UTC' })).toBe('5 de enero de 2026');
    expect(formatDate('en', ts, { dateStyle: 'long', timeZone: 'UTC' })).toBe('January 5, 2026');
    expect(formatTime('en', ts)).toMatch(/\d{1,2}:\d{2}/);
    expect(formatDuration('es', 65 * 60_000)).toMatch(/1\s?h.*5\s?min/);
    expect(formatDuration('en', 5 * 60_000)).toMatch(/5\s?min/);
    expect(formatDuration('en', 60 * 60_000)).toMatch(/1\s?hr/);
    expect(formatMmSs(125_000)).toBe('2:05');
    expect(formatMmSs(-5)).toBe('0:00');
  });

  it('LOCALES enumera es y en', () => {
    expect(LOCALES).toEqual(['es', 'en']);
  });

  it('detectLocale: español solo si el idioma preferido es es*; inglés en el resto', () => {
    expect(detectLocale(['es-ES', 'en'])).toBe('es');
    expect(detectLocale(['es'])).toBe('es');
    expect(detectLocale(['en-US', 'es'])).toBe('en');
    expect(detectLocale(['fr-FR'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});
