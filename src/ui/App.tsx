// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { useEffect, type ReactNode } from 'react';
import { runtime } from '../app/runtime';
import { useApp, type Screen } from '../app/store';
import { About } from './About';
import { BreakModal } from './BreakModal';
import { Calibration } from './Calibration';
import { Dashboard } from './Dashboard';
import { Exercises } from './Exercises';
import { Onboarding } from './Onboarding';
import { SettingsScreen } from './SettingsScreen';
import { Stats } from './Stats';
import { useT } from './useT';

const NAV: { screen: Screen; key: string }[] = [
  { screen: 'main', key: 'nav.main' },
  { screen: 'stats', key: 'nav.stats' },
  { screen: 'exercises', key: 'nav.exercises' },
  { screen: 'settings', key: 'nav.settings' },
  { screen: 'about', key: 'nav.about' },
];

function Toasts(): ReactNode {
  const toasts = useApp((s) => s.toasts);
  const t = useT();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast-${x.kind}`}>
          <span>{t(x.key, x.params)}</span>
          <button className="icon" aria-label={t('common.close')} onClick={() => runtime.dismissToast(x.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function App(): ReactNode {
  const t = useT();
  const ready = useApp((s) => s.ready);
  const screen = useApp((s) => s.screen);
  const border = useApp((s) => s.alertBorder);
  const level = useApp((s) => s.snapshot?.indicator ?? 'OK');
  const paused = useApp((s) => s.paused);

  useEffect(() => {
    void runtime.init();
    const onKey = (e: KeyboardEvent): void => {
      // Atajo de recalibración: ⌘⇧R / Ctrl+Shift+R
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        runtime.navigate('calibration');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) return <p className="muted center">{t('common.loading')}</p>;

  const inFlow = screen === 'onboarding';
  return (
    <div className={`app level-${level}`}>
      {border && <div className="alert-border" aria-hidden="true" />}
      <a className="skip" href="#content">
        {t('common.skip')}
      </a>
      {!inFlow && (
        <header className="topbar">
          <span className="brand">
            <img
              className="brand-logo"
              src={`${import.meta.env.BASE_URL}icon.svg`}
              alt=""
              width={24}
              height={24}
            />
            {t('app.name')}
          </span>
          <nav aria-label={t('nav.label')}>
            {NAV.map((n) => (
              <button
                key={n.screen}
                className={screen === n.screen ? 'active' : ''}
                aria-current={screen === n.screen ? 'page' : undefined}
                onClick={() => runtime.navigate(n.screen)}
              >
                {t(n.key)}
              </button>
            ))}
          </nav>
          {paused && <span className="paused-tag">{t('dashboard.pausedTag')}</span>}
        </header>
      )}
      <div id="content" className="content" tabIndex={-1}>
        {screen === 'onboarding' && <Onboarding />}
        {screen === 'main' && <Dashboard />}
        {screen === 'calibration' && <Calibration />}
        {screen === 'stats' && <Stats />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'exercises' && <Exercises />}
        {screen === 'about' && <About />}
      </div>
      <BreakModal />
      <Toasts />
    </div>
  );
}
