// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { useEffect, useState, type ReactNode } from 'react';
import { makeT } from '../i18n';
import type { TraySnapshot, TrayCommand } from '../platform/platform';
import { StatusPill } from './components';

/** Popover de la barra de menús (ventana independiente de Electron; solo recibe instantáneas). */
export function MenuBarView(): ReactNode {
  const [snap, setSnap] = useState<TraySnapshot | null>(null);
  useEffect(() => window.neckguard?.onTraySnapshot((s) => setSnap(s)), []);
  const t = makeT(snap?.locale ?? 'es');
  const send = (c: TrayCommand): void => window.neckguard?.sendTrayCommand(c);

  return (
    <main className="menubar" aria-label={t('app.name')}>
      {snap ? (
        <>
          <StatusPill
            level={snap.suppressed ? 'OK' : snap.level}
            dim={snap.suppressed !== null}
            label={snap.labels.status}
          />
          <ul className="plain">
            <li>{snap.labels.sitting}</li>
            <li>{snap.labels.nextBreak}</li>
            {snap.labels.good && <li>{snap.labels.good}</li>}
          </ul>
          <div className="stack">
            <button onClick={() => send('togglePause')}>
              {snap.paused ? t('dashboard.resume') : t('dashboard.pause')}
            </button>
            <button onClick={() => send('snooze15')}>{t('dashboard.snooze', { count: 15 })}</button>
            <button onClick={() => send('recalibrate')}>{t('calibration.redo')}</button>
            <button className="primary" onClick={() => send('openWindow')}>
              {t('menubar.open')}
            </button>
          </div>
        </>
      ) : (
        <p className="muted">{t('menubar.waiting')}</p>
      )}
    </main>
  );
}
