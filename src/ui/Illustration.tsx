// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { ReactNode } from 'react';
import type { IllustrationId } from '../exercises/library';

/** Ilustraciones esquemáticas en perfil (figura de palitos); decorativas, el texto es la instrucción. */
export function Illustration({ id, title }: { id: IllustrationId; title: string }): ReactNode {
  return (
    <svg viewBox="0 0 160 140" className="illustration" role="img" aria-label={title}>
      <defs>
        <marker id={`arrow-${id}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
        </marker>
      </defs>
      <g className="ill-chair" fill="none" strokeWidth="3" strokeLinecap="round">
        <path d="M30 130 V80 M30 80 H80 M30 80 V30" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        {figure(id)}
      </g>
    </svg>
  );
}

function figure(id: IllustrationId): ReactNode {
  const arrow = (d: string): ReactNode => (
    <path d={d} className="ill-arrow" markerEnd={`url(#arrow-${id})`} strokeWidth="3" />
  );
  switch (id) {
    case 'chinTuck':
      return (
        <>
          <circle cx="76" cy="30" r="12" />
          <path d="M70 44 V80 L100 80 V110" />
          {arrow('M112 32 H92')}
        </>
      );
    case 'chinTuckExt':
      return (
        <>
          <circle cx="74" cy="28" r="12" />
          <path d="M68 42 V80 L100 80 V110" />
          {arrow('M112 20 H94')}
          {arrow('M92 14 Q96 8 102 8')}
        </>
      );
    case 'neckExt':
      return (
        <>
          <circle cx="68" cy="32" r="12" />
          <path d="M66 46 V80 L100 80 V110" />
          {arrow('M84 14 Q98 10 106 24')}
          {arrow('M96 44 H112')}
        </>
      );
    case 'thoracic':
      return (
        <>
          <circle cx="62" cy="26" r="12" />
          <path d="M56 40 Q50 62 60 80 L100 80 V110" />
          {arrow('M40 52 Q30 62 36 74')}
        </>
      );
    case 'shoulders':
      return (
        <>
          <circle cx="72" cy="30" r="12" />
          <path d="M72 44 V80 L102 80 V110 M72 52 L92 60" />
          {arrow('M100 44 Q112 52 104 64')}
        </>
      );
    case 'lumbarRoll':
      return (
        <>
          <circle cx="72" cy="30" r="12" />
          <path d="M72 44 V80 L102 80 V110" />
          <ellipse cx="36" cy="66" rx="6" ry="10" className="ill-roll" />
        </>
      );
  }
}
