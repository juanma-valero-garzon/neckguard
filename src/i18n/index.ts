// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { Locale } from '../settings/schema';
import { en } from './en';
import { es, type MessageKey } from './es';

export type { MessageKey };

const catalogs: Record<Locale, Record<string, string>> = { es, en };

export const LOCALES: readonly Locale[] = ['es', 'en'];

export type Params = Record<string, string | number>;

/** Idioma inicial según el del sistema: español si empieza por «es»; inglés en cualquier otro caso. */
export function detectLocale(
  languages: readonly string[] | undefined = globalThis.navigator?.languages,
): Locale {
  const first = languages?.[0]?.toLowerCase() ?? '';
  return first === 'es' || first.startsWith('es-') ? 'es' : 'en';
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/**
 * Traduce una clave. Con `params.count` se usa la variante plural `key.<categoría>` (Intl.PluralRules)
 * y, si no existe, `key.other`.
 */
export function translate(locale: Locale, key: string, params?: Params): string {
  const cat = catalogs[locale];
  if (params && typeof params.count === 'number') {
    const rule = new Intl.PluralRules(locale).select(params.count);
    const plural = cat[`${key}.${rule}`] ?? cat[`${key}.other`];
    if (plural !== undefined) return interpolate(plural, params);
  }
  return interpolate(cat[key] ?? es[key as MessageKey] ?? key, params);
}

export function makeT(locale: Locale): (key: string, params?: Params) => string {
  return (key, params) => translate(locale, key, params);
}

export function formatDate(
  locale: Locale,
  ts: number,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locale, opts).format(new Date(ts));
}

export function formatTime(locale: Locale, ts: number): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(ts));
}

/** "1 h 5 min" / "1 hr 5 min" según el locale. */
export function formatDuration(locale: Locale, ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const unit = (u: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'short' });
  if (h === 0) return unit('minute').format(m);
  return m === 0 ? unit('hour').format(h) : `${unit('hour').format(h)} ${unit('minute').format(m)}`;
}

export function formatMmSs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
