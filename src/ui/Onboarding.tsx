import { useState, type ReactNode } from 'react';
import { runtime } from '../app/runtime';
import { useApp } from '../app/store';
import { Notice } from './components';
import { useT } from './useT';

const STEPS = 4;
const RED_FLAGS = [
  'arm',
  'tingling',
  'weakness',
  'dizzy',
  'vision',
  'worse',
  'trauma',
  'fever',
  'sphincter',
] as const;

export function Onboarding(): ReactNode {
  const t = useT();
  const [step, setStep] = useState(0);
  const settings = useApp((s) => s.settings);
  const camera = useApp((s) => s.camera);
  const audio = useApp((s) => s.audio);
  const notif = useApp((s) => s.notificationAccess);
  const [legal, setLegal] = useState(false);

  const setOnboarding = (patch: Partial<typeof settings.onboarding>): void =>
    runtime.updateSettings((s) => ({ ...s, onboarding: { ...s.onboarding, ...patch } }));

  return (
    <main className="onboarding" aria-labelledby="ob-title">
      <p className="step-count">{t('onboarding.step', { current: step + 1, total: STEPS })}</p>

      {step === 0 && (
        <>
          <h1 id="ob-title">{t('onboarding.welcome.title')}</h1>
          <p>{t('onboarding.welcome.body')}</p>
          <Notice kind="warning">{t('legal.notMedical')}</Notice>
          <ul className="bullets">
            <li>{t('onboarding.privacy.1')}</li>
            <li>{t('onboarding.privacy.2')}</li>
            <li>{t('onboarding.privacy.3')}</li>
          </ul>
          <label className="check">
            <input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} />
            <span>{t('onboarding.legal.accept')}</span>
          </label>
          <div className="actions">
            <button className="primary" disabled={!legal} onClick={() => setStep(1)}>
              {t('common.next')}
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1 id="ob-title">{t('onboarding.redflags.title')}</h1>
          <p>{t('onboarding.redflags.intro')}</p>
          <ul className="bullets">
            {RED_FLAGS.map((f) => (
              <li key={f}>{t(`redflag.${f}`)}</li>
            ))}
          </ul>
          <Notice kind="error">{t('onboarding.redflags.action')}</Notice>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.onboarding.redFlagsConfirmed}
              onChange={(e) => setOnboarding({ redFlagsConfirmed: e.target.checked })}
            />
            <span>{t('onboarding.redflags.confirm')}</span>
          </label>
          {!settings.onboarding.redFlagsConfirmed && <small>{t('onboarding.redflags.skipHint')}</small>}
          <div className="actions">
            <button onClick={() => setStep(0)}>{t('common.back')}</button>
            <button className="primary" onClick={() => setStep(2)}>
              {t('common.next')}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 id="ob-title">{t('onboarding.camera.title')}</h1>
          <p>{t('onboarding.camera.body')}</p>
          <fieldset className="mode-choice">
            <legend>{t('settings.mode')}</legend>
            {(['frontal', 'lateral', 'oblique'] as const).map((m) => (
              <label key={m} className="check">
                <input
                  type="radio"
                  name="mode"
                  checked={settings.mode === m}
                  onChange={() => runtime.updateSettings((s) => ({ ...s, mode: m }))}
                />
                <span>
                  <strong>{t(`mode.${m}`)}</strong>
                  <small>{t(`mode.${m}.desc`)}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <p>
            <small>
              {t('mode.accuracy')} {t('mode.perCamera')}
            </small>
          </p>
          {camera.status === 'running' && <Notice>{t('onboarding.camera.ok')}</Notice>}
          {camera.status === 'error' && camera.error && (
            <Notice kind="error">{t(`camera.error.${camera.error}`)}</Notice>
          )}
          <div className="actions">
            <button onClick={() => setStep(1)}>{t('common.back')}</button>
            <button
              onClick={() => void runtime.requestCameraAccess()}
              disabled={camera.status === 'starting'}
            >
              {t('onboarding.camera.allow')}
            </button>
            <button className="primary" disabled={camera.status !== 'running'} onClick={() => setStep(3)}>
              {t('common.next')}
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1 id="ob-title">{t('onboarding.alerts.title')}</h1>
          <p>{t('onboarding.alerts.body')}</p>
          <div className="actions left">
            <button
              onClick={() => {
                void runtime.unlockAudio().then(() => runtime.playTestTone('MALA_POSTURA'));
              }}
            >
              {t('onboarding.alerts.testSound')}
            </button>
            <span className="muted">{t(`audio.${audio}`)}</span>
          </div>
          <div className="actions left">
            <button onClick={() => void runtime.requestNotifications()}>
              {t('onboarding.alerts.enableNotifications')}
            </button>
            <span className="muted">{t(`notif.${notif}`)}</span>
          </div>
          <div className="actions">
            <button onClick={() => setStep(2)}>{t('common.back')}</button>
            <button
              className="primary"
              onClick={() => {
                runtime.completeOnboarding();
              }}
            >
              {t('onboarding.finish')}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
