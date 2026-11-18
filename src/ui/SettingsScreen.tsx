// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { useEffect, useState, type ReactNode } from 'react';
import { runtime } from '../app/runtime';
import { useApp } from '../app/store';
import { LOCALES } from '../i18n';
import type { Settings } from '../settings/schema';
import { Card, Notice, Row, Toggle } from './components';
import { useT } from './useT';

const minToHHMM = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const hhmmToMin = (v: string): number => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function SettingsScreen(): ReactNode {
  const t = useT();
  const s = useApp((st) => st.settings);
  const camera = useApp((st) => st.camera);
  const loadStatus = useApp((st) => st.loadStatus);
  const loadError = useApp((st) => st.loadError);
  const persistError = useApp((st) => st.persistError);
  const [confirmErase, setConfirmErase] = useState(false);
  const upd = (fn: (x: Settings) => Settings): void => runtime.updateSettings(fn);

  useEffect(() => {
    void runtime.refreshDevices();
  }, []);

  return (
    <main aria-labelledby="se-title">
      <h1 id="se-title">{t('settings.title')}</h1>
      {(loadStatus === 'restoredFromBackup' || loadStatus === 'reset') && (
        <Notice kind="error">
          {t(`data.load.${loadStatus}`)} {loadError && <small className="mono">{loadError}</small>}
        </Notice>
      )}
      {persistError && (
        <Notice kind="error">
          {t('data.persistError')} <small className="mono">{persistError}</small>
        </Notice>
      )}

      <Card title={t('settings.camera')}>
        <Row label={t('settings.device')} htmlFor="s-device">
          <select
            id="s-device"
            value={camera.active?.deviceId ?? s.cameraDeviceId}
            onChange={(e) => {
              const d = camera.devices.find((x) => x.deviceId === e.target.value);
              if (d) void runtime.selectCamera(d.deviceId, d.label);
            }}
          >
            {camera.devices.length === 0 && <option value="">{t('settings.noDevices')}</option>}
            {camera.devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || t('settings.unnamedCamera', { n: i + 1 })}
              </option>
            ))}
          </select>
        </Row>
        <Row
          label={t('settings.mode')}
          hint={`${t('mode.accuracy')} ${t('mode.perCamera')}`}
          htmlFor="s-mode"
        >
          <select
            id="s-mode"
            value={s.mode}
            onChange={(e) => upd((x) => ({ ...x, mode: e.target.value as Settings['mode'] }))}
          >
            <option value="frontal">{t('mode.frontal')}</option>
            <option value="lateral">{t('mode.lateral')}</option>
            <option value="oblique">{t('mode.oblique')}</option>
          </select>
        </Row>
        {s.mode !== 'frontal' && (
          <Row label={t('settings.side')} htmlFor="s-side">
            <select
              id="s-side"
              value={s.preferredSide ?? ''}
              onChange={(e) =>
                upd((x) => ({
                  ...x,
                  preferredSide: e.target.value === '' ? null : (e.target.value as 'left' | 'right'),
                }))
              }
            >
              <option value="">{t('settings.side.auto')}</option>
              <option value="left">{t('settings.side.left')}</option>
              <option value="right">{t('settings.side.right')}</option>
            </select>
          </Row>
        )}
        <Row label={t('settings.showPreview')} htmlFor="s-prev">
          <Toggle
            id="s-prev"
            checked={s.showPreview}
            onChange={(v) => upd((x) => ({ ...x, showPreview: v }))}
          />
        </Row>
        <Row label={t('settings.showSkeleton')} htmlFor="s-skel">
          <Toggle
            id="s-skel"
            checked={s.showSkeleton}
            onChange={(v) => upd((x) => ({ ...x, showSkeleton: v }))}
          />
        </Row>
        <Row label={t('settings.faceLandmarker')} hint={t('settings.faceLandmarker.hint')} htmlFor="s-face">
          <Toggle
            id="s-face"
            checked={s.useFaceLandmarker}
            onChange={(v) => upd((x) => ({ ...x, useFaceLandmarker: v }))}
          />
        </Row>
        <Row label={t('settings.fps', { count: s.fps })} htmlFor="s-fps">
          <input
            id="s-fps"
            type="range"
            min={5}
            max={30}
            step={1}
            value={s.fps}
            onChange={(e) => upd((x) => ({ ...x, fps: Number(e.target.value) }))}
          />
        </Row>
        <Row label={t('settings.powerSaving')} hint={t('settings.powerSaving.hint')} htmlFor="s-power">
          <Toggle
            id="s-power"
            checked={s.powerSaving}
            onChange={(v) => upd((x) => ({ ...x, powerSaving: v }))}
          />
        </Row>
        <Row label={t('settings.standing')} hint={t('settings.standing.hint')} htmlFor="s-stand">
          <Toggle
            id="s-stand"
            checked={s.standingDetection}
            onChange={(v) => upd((x) => ({ ...x, standingDetection: v }))}
          />
        </Row>
      </Card>

      <Card title={t('settings.sensitivity')}>
        <Row label={t('settings.preset')} htmlFor="s-preset">
          <select
            id="s-preset"
            value={s.preset}
            onChange={(e) => upd((x) => ({ ...x, preset: e.target.value as Settings['preset'] }))}
          >
            <option value="standard">{t('preset.standard')}</option>
            <option value="sensitive">{t('preset.sensitive')}</option>
            <option value="custom">{t('preset.custom')}</option>
          </select>
        </Row>
        <p className="muted">{t(`preset.${s.preset}.desc`)}</p>
        {s.preset === 'custom' && (
          <Row
            label={t('settings.sensitivityScale', { value: s.sensitivity.toFixed(2) })}
            hint={t('settings.sensitivityScale.hint')}
            htmlFor="s-sens"
          >
            <input
              id="s-sens"
              type="range"
              min={0.6}
              max={1.5}
              step={0.05}
              value={s.sensitivity}
              onChange={(e) => upd((x) => ({ ...x, sensitivity: Number(e.target.value) }))}
            />
          </Row>
        )}
        <Notice kind="warning">{t('settings.thresholdsUnvalidated')}</Notice>
        <div className="actions left">
          <button onClick={() => runtime.navigate('about')}>{t('settings.viewThresholds')}</button>
        </div>
      </Card>

      <Card title={t('settings.alerts')}>
        <Row label={t('dashboard.hypervigilance')} hint={t('settings.hypervigilance.hint')} htmlFor="s-hyper">
          <Toggle
            id="s-hyper"
            checked={s.hypervigilance}
            onChange={(v) => upd((x) => ({ ...x, hypervigilance: v }))}
          />
        </Row>
        <Row label={t('settings.sound')} htmlFor="s-sound">
          <Toggle
            id="s-sound"
            checked={s.alerts.soundEnabled}
            onChange={(v) => upd((x) => ({ ...x, alerts: { ...x.alerts, soundEnabled: v } }))}
          />
        </Row>
        <Row label={t('settings.volume', { value: Math.round(s.alerts.volume * 100) })} htmlFor="s-vol">
          <input
            id="s-vol"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.alerts.volume}
            onChange={(e) => upd((x) => ({ ...x, alerts: { ...x.alerts, volume: Number(e.target.value) } }))}
          />
        </Row>
        <Row label={t('settings.toneSet')} htmlFor="s-tone">
          <select
            id="s-tone"
            value={s.alerts.toneSet}
            onChange={(e) =>
              upd((x) => ({
                ...x,
                alerts: { ...x.alerts, toneSet: e.target.value as Settings['alerts']['toneSet'] },
              }))
            }
          >
            {(['soft', 'chime', 'wood'] as const).map((id) => (
              <option key={id} value={id}>
                {t(`tone.${id}`)}
              </option>
            ))}
          </select>
          <button onClick={() => void runtime.unlockAudio().then(() => runtime.playTestTone('MALA_POSTURA'))}>
            {t('settings.testSound')}
          </button>
        </Row>
        <Row label={t('settings.notifications')} htmlFor="s-notif">
          <Toggle
            id="s-notif"
            checked={s.alerts.notificationsEnabled}
            onChange={(v) => {
              upd((x) => ({ ...x, alerts: { ...x.alerts, notificationsEnabled: v } }));
              if (v) void runtime.requestNotifications();
            }}
          />
        </Row>
        <Row label={t('settings.positive')} htmlFor="s-pos">
          <Toggle
            id="s-pos"
            checked={s.alerts.positiveFeedback}
            onChange={(v) => upd((x) => ({ ...x, alerts: { ...x.alerts, positiveFeedback: v } }))}
          />
        </Row>
        <Row label={t('settings.cooldown')} hint={t('settings.cooldown.hint')} htmlFor="s-cool">
          <input
            id="s-cool"
            type="number"
            min={1}
            max={120}
            value={s.alerts.cooldownMin}
            onChange={(e) =>
              upd((x) => ({ ...x, alerts: { ...x.alerts, cooldownMin: Number(e.target.value) } }))
            }
          />
        </Row>
        <Row label={t('settings.dailyCap')} htmlFor="s-cap">
          <input
            id="s-cap"
            type="number"
            min={0}
            max={5000}
            value={s.alerts.dailySoundCap}
            onChange={(e) =>
              upd((x) => ({ ...x, alerts: { ...x.alerts, dailySoundCap: Number(e.target.value) } }))
            }
          />
        </Row>
        <Row label={t('settings.repeatSound')} hint={t('settings.repeatSound.hint')} htmlFor="s-rep">
          <Toggle
            id="s-rep"
            checked={s.alerts.repeatSound}
            onChange={(v) => upd((x) => ({ ...x, alerts: { ...x.alerts, repeatSound: v } }))}
          />
        </Row>
        {s.alerts.repeatSound && (
          <Row label={t('settings.repeatSeconds')} htmlFor="s-repsec">
            <input
              id="s-repsec"
              type="number"
              min={3}
              max={600}
              value={s.alerts.repeatSeconds}
              onChange={(e) =>
                upd((x) => ({ ...x, alerts: { ...x.alerts, repeatSeconds: Number(e.target.value) } }))
              }
            />
          </Row>
        )}
        <Row label={t('settings.quiet')} htmlFor="s-quiet">
          <Toggle
            id="s-quiet"
            checked={s.alerts.quietEnabled}
            onChange={(v) => upd((x) => ({ ...x, alerts: { ...x.alerts, quietEnabled: v } }))}
          />
        </Row>
        {s.alerts.quietEnabled && (
          <Row label={t('settings.quietRange')}>
            <input
              aria-label={t('settings.quietFrom')}
              type="time"
              value={minToHHMM(s.alerts.quietStartMin)}
              onChange={(e) =>
                upd((x) => ({ ...x, alerts: { ...x.alerts, quietStartMin: hhmmToMin(e.target.value) } }))
              }
            />
            <input
              aria-label={t('settings.quietTo')}
              type="time"
              value={minToHHMM(s.alerts.quietEndMin)}
              onChange={(e) =>
                upd((x) => ({ ...x, alerts: { ...x.alerts, quietEndMin: hhmmToMin(e.target.value) } }))
              }
            />
          </Row>
        )}
        <Row label={t('dashboard.dnd')} htmlFor="s-dnd">
          <Toggle
            id="s-dnd"
            checked={s.alerts.dnd}
            onChange={(v) => upd((x) => ({ ...x, alerts: { ...x.alerts, dnd: v } }))}
          />
        </Row>
      </Card>

      <Card title={t('settings.breaks')}>
        <Row label={t('settings.breaksEnabled')} htmlFor="s-br">
          <Toggle
            id="s-br"
            checked={s.breaks.enabled}
            onChange={(v) => upd((x) => ({ ...x, breaks: { ...x.breaks, enabled: v } }))}
          />
        </Row>
        {s.preset !== 'custom' && <p className="muted">{t('settings.breaksPresetNote')}</p>}
        <Row label={t('settings.microMin')} htmlFor="s-micro">
          <input
            id="s-micro"
            type="number"
            min={5}
            max={120}
            disabled={s.preset !== 'custom'}
            value={s.breaks.microMin}
            onChange={(e) =>
              upd((x) => ({ ...x, breaks: { ...x.breaks, microMin: Number(e.target.value) } }))
            }
          />
        </Row>
        <Row label={t('settings.longMin')} htmlFor="s-long">
          <input
            id="s-long"
            type="number"
            min={10}
            max={240}
            disabled={s.preset !== 'custom'}
            value={s.breaks.longMin}
            onChange={(e) => upd((x) => ({ ...x, breaks: { ...x.breaks, longMin: Number(e.target.value) } }))}
          />
        </Row>
        <Row label={t('settings.eye')} hint={t('settings.eye.hint')} htmlFor="s-eye">
          <Toggle
            id="s-eye"
            checked={s.breaks.eyeEnabled}
            onChange={(v) => upd((x) => ({ ...x, breaks: { ...x.breaks, eyeEnabled: v } }))}
          />
        </Row>
        <Row label={t('settings.eyeInterval')} htmlFor="s-eye-int">
          <input
            id="s-eye-int"
            type="number"
            min={5}
            max={60}
            disabled={!s.breaks.eyeEnabled}
            value={s.breaks.eyeIntervalMin}
            onChange={(e) =>
              upd((x) => ({ ...x, breaks: { ...x.breaks, eyeIntervalMin: Number(e.target.value) } }))
            }
          />
        </Row>
        <Row label={t('settings.blink')} hint={t('settings.blink.hint')} htmlFor="s-blink">
          <Toggle
            id="s-blink"
            checked={s.blink.enabled}
            disabled={s.mode === 'lateral'}
            onChange={(v) => upd((x) => ({ ...x, blink: { ...x.blink, enabled: v } }))}
          />
        </Row>
        <Row label={t('settings.absence')} htmlFor="s-abs">
          <input
            id="s-abs"
            type="number"
            min={1}
            max={30}
            value={s.breaks.resetAfterAbsentMin}
            onChange={(e) =>
              upd((x) => ({ ...x, breaks: { ...x.breaks, resetAfterAbsentMin: Number(e.target.value) } }))
            }
          />
        </Row>
        <Row label={t('settings.snoozeMin')} htmlFor="s-snz">
          <input
            id="s-snz"
            type="number"
            min={1}
            max={30}
            value={s.breaks.snoozeMin}
            onChange={(e) =>
              upd((x) => ({ ...x, breaks: { ...x.breaks, snoozeMin: Number(e.target.value) } }))
            }
          />
        </Row>
      </Card>

      <Card title={t('settings.general')}>
        <Row label={t('settings.language')} htmlFor="s-lang">
          <select
            id="s-lang"
            value={s.locale}
            onChange={(e) => upd((x) => ({ ...x, locale: e.target.value as Settings['locale'] }))}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {t(`language.${l}`)}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.launchAtLogin')} hint={t('settings.launchAtLogin.hint')} htmlFor="s-login">
          <Toggle
            id="s-login"
            checked={s.launchAtLogin}
            onChange={(v) => upd((x) => ({ ...x, launchAtLogin: v }))}
          />
        </Row>
      </Card>

      <Card title={t('settings.privacy')}>
        <p>{t('settings.privacy.body')}</p>
        <div className="actions left wrap">
          <button onClick={() => runtime.exportData('json')}>{t('settings.export.json')}</button>
          <button onClick={() => runtime.exportData('csv')}>{t('settings.export.csv')}</button>
          {!confirmErase ? (
            <button className="danger" onClick={() => setConfirmErase(true)}>
              {t('settings.erase')}
            </button>
          ) : (
            <>
              <span role="alert">{t('settings.erase.confirm')}</span>
              <button
                className="danger"
                onClick={() => {
                  setConfirmErase(false);
                  void runtime.eraseAllData();
                }}
              >
                {t('settings.erase.yes')}
              </button>
              <button onClick={() => setConfirmErase(false)}>{t('common.cancel')}</button>
            </>
          )}
        </div>
      </Card>
    </main>
  );
}
