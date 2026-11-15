// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { useEffect, useState, type ReactNode } from 'react';
import type { CaptureMode } from '../core/types';
import { runtime } from '../app/runtime';
import { useApp } from '../app/store';
import { CameraPreview } from './CameraPreview';
import { Notice } from './components';
import { useT } from './useT';

export function Calibration(): ReactNode {
  const t = useT();
  const cal = useApp((s) => s.calibration);
  const camera = useApp((s) => s.camera);
  const snap = useApp((s) => s.snapshot);
  const mode = useApp((s) => s.settings.mode);
  const side = useApp((s) => s.settings.preferredSide);
  const [userStep, setStep] = useState(1);
  const step = cal.state === 'done' ? 3 : userStep;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (cal.state !== 'capturing') return;
    const id = window.setInterval(
      () => setProgress(Math.min((performance.now() - cal.startedAt) / cal.durationMs, 1)),
      100,
    );
    return () => window.clearInterval(id);
  }, [cal.state, cal.startedAt, cal.durationMs]);

  useEffect(() => () => runtime.resetCalibrationUi(), []);

  const ready = camera.status === 'running' && snap?.presence === 'present';

  return (
    <main className="calibration" aria-labelledby="cal-title">
      <h1 id="cal-title">{t('calibration.title')}</h1>
      <p className="step-count">{t('onboarding.step', { current: step, total: 3 })}</p>
      <div className="split">
        <CameraPreview />
        <div className="stack">
          {step === 1 && (
            <>
              <h2>{t('calibration.step1.title')}</h2>
              <label className="row-inline">
                <span>{t('settings.mode')}</span>
                <select
                  value={mode}
                  onChange={(e) =>
                    runtime.updateSettings((s) => ({ ...s, mode: e.target.value as CaptureMode }))
                  }
                >
                  <option value="frontal">{t('mode.frontal')}</option>
                  <option value="lateral">{t('mode.lateral')}</option>
                  <option value="oblique">{t('mode.oblique')}</option>
                </select>
              </label>
              <p className="muted">{t(`mode.${mode}.desc`)}</p>
              <p>
                <small>{t('mode.perCamera')}</small>
              </p>
              <ol className="bullets">
                <li>{t('calibration.instr.1')}</li>
                <li>{t('calibration.instr.2')}</li>
                <li>{t('calibration.instr.3')}</li>
                <li>{t(`calibration.place.${mode}`)}</li>
              </ol>
              {mode !== 'frontal' && (
                <label className="row-inline">
                  <span>{t('settings.side')}</span>
                  <select
                    value={side ?? ''}
                    onChange={(e) =>
                      runtime.updateSettings((s) => ({
                        ...s,
                        preferredSide: e.target.value === '' ? null : (e.target.value as 'left' | 'right'),
                      }))
                    }
                  >
                    <option value="">{t('settings.side.auto')}</option>
                    <option value="left">{t('settings.side.left')}</option>
                    <option value="right">{t('settings.side.right')}</option>
                  </select>
                </label>
              )}
              {!ready && <Notice kind="warning">{t('calibration.notReady')}</Notice>}
              {snap?.lighting && snap.lighting !== 'ok' && (
                <Notice kind="warning">{t(`suppressed.help.${snap.lighting}`)}</Notice>
              )}
              <div className="actions">
                <button
                  className="primary"
                  disabled={!ready}
                  onClick={() => {
                    setStep(2);
                    setProgress(0);
                    void runtime.runCalibration();
                  }}
                >
                  {t('calibration.start')}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2>{t('calibration.step2.title')}</h2>
              <p>{t('calibration.hold')}</p>
              <progress value={progress} max={1} aria-label={t('calibration.progress')} />
              {cal.state === 'failed' && (
                <>
                  <Notice kind="error">
                    {t(`calibration.fail.${cal.failure ?? 'tooFewSamples'}`)}
                    {cal.detail && <small className="mono"> {cal.detail}</small>}
                  </Notice>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() => {
                        runtime.resetCalibrationUi();
                        setStep(1);
                      }}
                    >
                      {t('common.retry')}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2>{t('calibration.step3.title')}</h2>
              <Notice>{t('calibration.done')}</Notice>
              <p>
                <small>{t('calibration.done.note')}</small>
              </p>
              <div className="actions">
                <button
                  onClick={() => {
                    runtime.resetCalibrationUi();
                    setStep(1);
                  }}
                >
                  {t('calibration.redo')}
                </button>
                <button className="primary" onClick={() => runtime.navigate('main')}>
                  {t('calibration.finish')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
