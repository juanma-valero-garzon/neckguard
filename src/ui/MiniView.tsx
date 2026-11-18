// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { useEffect, useState, type ReactNode } from 'react';
import { makeT } from '../i18n';
import type { TraySnapshot, TrayCommand } from '../platform/platform';
import { MeterBar, StatusPill } from './components';
import { Illustration } from './Illustration';

/** Ventana miniatura siempre visible (Electron): indicadores clave y tiempo restante hasta el descanso. */
export function MiniView(): ReactNode {
  const [snap, setSnap] = useState<TraySnapshot | null>(null);
  useEffect(() => window.neckguard?.onTraySnapshot((s) => setSnap(s)), []);
  const t = makeT(snap?.locale ?? 'es');
  const compact = snap?.mini?.hypervigilance === false;
  const brk = snap?.mini?.breakInfo;
  const eye = snap?.mini?.eyeInfo;
  const send = (c: TrayCommand): void => window.neckguard?.sendTrayCommand(c);

  if (brk) {
    return (
      <main className="mini mini-break" aria-label={brk.title}>
        <h2 className="mini-break-title">{brk.title}</h2>
        <div className="mini-break-body">
          <p>{brk.body}</p>
          {brk.illustration && (
            <div className="mini-break-figure">
              <Illustration id={brk.illustration} title={brk.exercise} />
            </div>
          )}
          <h3>{brk.exercise}</h3>
          {brk.steps.length > 0 && (
            <ol>
              {brk.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </div>
        <p className="countdown" role="timer" aria-live="off">
          {brk.countdown}
        </p>
        <div className="mini-break-actions">
          {!brk.started && <button onClick={() => send('breakStart')}>{t('break.start')}</button>}
          <button className="primary" onClick={() => send('breakDone')}>
            {t('break.done')}
          </button>
          <button onClick={() => send('breakSnooze')}>{t('break.snooze', { count: brk.snoozeMin })}</button>
          <button onClick={() => send('breakSkip')}>{t('break.skip')}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mini" aria-label={t('app.name')}>
      <div className="mini-head">
        <img
          className="mini-icon"
          src={`${import.meta.env.BASE_URL}icon.svg`}
          alt=""
          width={20}
          height={20}
        />
        {compact ? null : snap ? (
          <StatusPill
            level={snap.suppressed ? 'OK' : snap.level}
            dim={snap.suppressed !== null}
            label={snap.labels.status}
          />
        ) : (
          <span className="muted">{t('menubar.waiting')}</span>
        )}
        <button
          className="icon mini-restore"
          aria-label={t('mini.restore')}
          title={t('mini.restore')}
          onClick={() => window.neckguard?.sendTrayCommand('openWindow')}
        >
          {'⤢'}
        </button>
      </div>
      {snap && !compact && (
        <ul className="plain mini-meters">
          {snap.mini?.meters.map((m) => (
            <li key={m.label}>
              <div className="meter-head">
                <span>{m.label}</span>
                <span className={`meter-val zone-${m.zone}`}>{m.text}</span>
              </div>
              <MeterBar zone={m.zone} fill={m.fill} amberAt={m.amberAt} redAt={m.redAt} />
            </li>
          ))}
        </ul>
      )}
      {eye && (
        <div className="mini-eye" role="alert">
          <strong>{eye.title}</strong>
          <p>{eye.body}</p>
          <div className="mini-eye-foot">
            <span className="countdown" role="timer" aria-live="off">
              {eye.countdown}
            </span>
            <button onClick={() => send('eyeDismiss')}>{eye.closeLabel}</button>
          </div>
        </div>
      )}
      {snap?.mini && (
        <div className="mini-time" role="timer">
          <small>{snap.mini.remainingLabel}</small>
          <strong>{snap.mini.remaining}</strong>
        </div>
      )}
    </main>
  );
}
