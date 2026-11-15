// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { useId, type ReactNode } from 'react';
import { runtime } from '../app/runtime';
import { useApp } from '../app/store';
import { useT } from './useT';

/** Hook: ¿está contraída esta tarjeta? (se recuerda en los ajustes). */
export function useCollapsed(id: string): boolean {
  return useApp((s) => s.settings.collapsedCards.includes(id));
}

/** Tarjeta con cabecera plegable; el estado se persiste por `id`. El cuerpo no se monta si está contraída. */
export function CollapsibleCard({
  id,
  title,
  summary,
  actions,
  children,
}: {
  id: string;
  title: string;
  /** Resumen breve que se muestra en la cabecera solo cuando está contraída. */
  summary?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const t = useT();
  const collapsed = useCollapsed(id);
  const bodyId = useId();

  const toggle = (): void =>
    runtime.updateSettings((s) => ({
      ...s,
      collapsedCards: collapsed ? s.collapsedCards.filter((c) => c !== id) : [...s.collapsedCards, id],
    }));

  return (
    <section className={`card collapsible${collapsed ? ' collapsed' : ''}`}>
      <header className="card-head">
        <button
          type="button"
          className="card-toggle"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          title={t(collapsed ? 'card.expand' : 'card.collapse')}
          onClick={toggle}
        >
          <span className="chevron" aria-hidden="true">
            {'▾'}
          </span>
          <h2>{title}</h2>
        </button>
        {collapsed && summary && <span className="card-summary">{summary}</span>}
        {!collapsed && actions}
      </header>
      {!collapsed && (
        <div id={bodyId} className="card-body">
          {children}
        </div>
      )}
    </section>
  );
}
