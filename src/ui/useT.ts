import { useCallback } from 'react';
import { makeT, type Params } from '../i18n';
import { useApp } from '../app/store';

export type TFn = (key: string, params?: Params) => string;

/** Devuelve la función de traducción para el idioma activo. */
export function useT(): TFn {
  const locale = useApp((s) => s.settings.locale);
  return useCallback((key, params) => makeT(locale)(key, params), [locale]);
}
