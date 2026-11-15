// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { ReactNode } from 'react';
import type { PostureLevel } from '../core/types';
import { formatMeterValue, meterBar, meterZone, type MeterZone } from '../app/clock';
import { useT } from './useT';

const LEVEL_ICON: Record<PostureLevel, string> = {
  OK: '✓',
  AVISO_LEVE: '!',
  MALA_POSTURA: '▲',
  CRITICA: '✕',
};

/** Estado con color + icono + texto (no depende solo del color). */
export function StatusPill({
  level,
  dim,
  label,
}: {
  level: PostureLevel;
  dim?: boolean;
  label?: string;
}): ReactNode {
  const t = useT();
  return (
    <span className={`pill level-${level}${dim ? ' dim' : ''}`}>
      <span aria-hidden="true" className="pill-icon">
        {LEVEL_ICON[level]}
      </span>
      <span>{label ?? t(`level.${level}`)}</span>
    </span>
  );
}

export function Ring({
  fraction,
  children,
  label,
}: {
  fraction: number;
  children?: ReactNode;
  label: string;
}): ReactNode {
  const f = Math.min(Math.max(fraction, 0), 1);
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" role="img" aria-label={label}>
      <svg viewBox="0 0 110 110" width="110" height="110" aria-hidden="true">
        <circle cx="55" cy="55" r={r} className="ring-bg" />
        <circle
          cx="55"
          cy="55"
          r={r}
          className="ring-fg"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - f)}
          transform="rotate(-90 55 55)"
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}): ReactNode {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}): ReactNode {
  return (
    <div className="row">
      <div className="row-label">
        <label htmlFor={htmlFor}>{label}</label>
        {hint && <small>{hint}</small>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

export function Toggle({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="switch"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export function Notice({
  kind = 'info',
  children,
  actions,
}: {
  kind?: 'info' | 'warning' | 'error';
  children: ReactNode;
  actions?: ReactNode;
}): ReactNode {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div>{children}</div>
      {actions && <div className="notice-actions">{actions}</div>}
    </div>
  );
}

export function Meter({
  value,
  amber,
  red,
  label,
  unit,
}: {
  value: number | null;
  amber: number | undefined;
  red: number | undefined;
  label: string;
  unit: string;
}): ReactNode {
  const zone = meterZone(value, amber, red);
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span className={`meter-val zone-${zone}`}>{formatMeterValue(value, unit)}</span>
      </div>
      <MeterBar zone={zone} {...meterBar(value, amber, red)} />
    </div>
  );
}

export function MeterBar({
  zone,
  fill,
  amberAt,
  redAt,
}: {
  zone: MeterZone;
  fill: number;
  amberAt: number | null;
  redAt: number | null;
}): ReactNode {
  return (
    <div className="meter-bar" aria-hidden="true">
      {amberAt !== null && <i className="tick" style={{ left: `${amberAt * 100}%` }} />}
      {redAt !== null && <i className="tick red" style={{ left: `${redAt * 100}%` }} />}
      <b className={`fill zone-${zone}`} style={{ width: `${fill * 100}%` }} />
    </div>
  );
}
