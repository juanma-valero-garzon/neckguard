import type { ReactNode } from 'react';
import { alertMessageKey, deviationLabelKey, KEY_METERS } from '../app/clock';
import { runtime } from '../app/runtime';
import { useApp } from '../app/store';
import { DEVIATION_IDS } from '../core/types';
import { formatMmSs } from '../i18n';
import { CameraPreview } from './CameraPreview';
import { CollapsibleCard } from './CollapsibleCard';
import { Meter, Notice, Ring, StatusPill } from './components';
import { useT } from './useT';

export function Dashboard(): ReactNode {
  const t = useT();
  const snap = useApp((s) => s.snapshot);
  const settings = useApp((s) => s.settings);
  const profile = useApp((s) => s.profile);
  const camera = useApp((s) => s.camera);
  const audio = useApp((s) => s.audio);
  const paused = useApp((s) => s.paused);
  const cvaInfo = snap?.cvaInfo;

  const level = snap?.indicator ?? 'OK';
  const suppressed = snap?.suppressed ?? null;
  const intervalMs =
    (snap
      ? snap.breaks.nextKind === 'micro'
        ? settings.breaks.microMin
        : settings.breaks.longMin
      : settings.breaks.microMin) * 60_000;
  const remaining = snap?.breaks.remainingMs ?? intervalMs;
  const fraction = 1 - Math.min(remaining / intervalMs, 1);
  const blinkRate = snap?.blink.ratePerMin ?? null;
  const blinkText =
    blinkRate === null
      ? t('dashboard.blink.measuring')
      : t('dashboard.blink.rate', { rate: blinkRate.toFixed(0) });

  return (
    <main className="dashboard" aria-label={t('nav.main')}>
      <div className="stack dashboard-col">
        <CollapsibleCard
          id="status"
          title={t('dashboard.status')}
          summary={<StatusPill level={level} dim={suppressed !== null} />}
        >
          <div aria-live="polite" className="status-block">
            <StatusPill level={level} dim={suppressed !== null} />
            {suppressed ? (
              <>
                <p className="status-msg">{t(`suppressed.${suppressed}`)}</p>
                {suppressed !== 'absent' && suppressed !== 'paused' && suppressed !== 'locked' && (
                  <small>{t(`suppressed.help.${suppressed}`)}</small>
                )}
              </>
            ) : snap?.reason ? (
              <p className="status-msg">{t(alertMessageKey(snap.reason))}</p>
            ) : (
              <p className="status-msg">{t('dashboard.allGood')}</p>
            )}
          </div>
          {!profile && camera.status === 'running' && (
            <Notice
              kind="warning"
              actions={
                <button className="primary" onClick={() => runtime.navigate('calibration')}>
                  {t('calibration.start')}
                </button>
              }
            >
              {t('dashboard.needsCalibration')}
            </Notice>
          )}
          {camera.deviceChanged && !profile && <Notice kind="warning">{t('dashboard.deviceChanged')}</Notice>}
          {snap?.suggestRecalibration && (
            <Notice
              kind="warning"
              actions={
                <button onClick={() => runtime.navigate('calibration')}>{t('calibration.redo')}</button>
              }
            >
              {t('dashboard.suggestRecalibrate')}
            </Notice>
          )}
          {snap?.personChanged && (
            <Notice
              kind="warning"
              actions={
                <button onClick={() => runtime.navigate('calibration')}>{t('calibration.redo')}</button>
              }
            >
              {t('dashboard.personChanged')}
            </Notice>
          )}
          {audio !== 'running' && settings.alerts.soundEnabled && settings.hypervigilance && (
            <Notice
              kind="info"
              actions={
                <button onClick={() => void runtime.unlockAudio()}>{t('dashboard.enableSound')}</button>
              }
            >
              {t('dashboard.soundSuspended')}
            </Notice>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          id="camera"
          title={t('dashboard.camera')}
          actions={
            <button onClick={() => runtime.updateSettings((s) => ({ ...s, showPreview: !s.showPreview }))}>
              {settings.showPreview ? t('dashboard.hidePreview') : t('dashboard.showPreview')}
            </button>
          }
        >
          <CameraPreview visible={settings.showPreview} />
          <p className="muted">{t(`mode.${settings.mode}.short`)}</p>
        </CollapsibleCard>

        <CollapsibleCard id="indicators" title={t('dashboard.indicators')}>
          {KEY_METERS.map((id) => {
            const th = snap?.thresholds[id];
            const unit = th?.unit === 'deg' ? '°' : '%';
            return (
              <Meter
                key={id}
                label={t(deviationLabelKey(id))}
                value={snap?.deviations[id] ?? null}
                amber={th?.amber}
                red={th?.red}
                unit={unit}
              />
            );
          })}
          {settings.mode === 'lateral' && cvaInfo && (
            <p className="muted">{t('dashboard.cvaInfo', { cva: cvaInfo.cvaDeg.toFixed(0) })}</p>
          )}
          <details>
            <summary>{t('dashboard.moreIndicators')}</summary>
            {DEVIATION_IDS.filter((id) => !KEY_METERS.includes(id)).map((id) => {
              const th = snap?.thresholds[id];
              if (!th) return null;
              return (
                <Meter
                  key={id}
                  label={t(deviationLabelKey(id))}
                  value={snap?.deviations[id] ?? null}
                  amber={th.amber}
                  red={th.red}
                  unit={th.unit === 'deg' ? '°' : '%'}
                />
              );
            })}
          </details>
        </CollapsibleCard>

        <CollapsibleCard
          id="sitting"
          title={t('dashboard.sitting')}
          summary={<strong>{formatMmSs(snap?.breaks.sittingMs ?? 0)}</strong>}
        >
          <div className="sitting">
            <Ring fraction={fraction} label={t('dashboard.sittingRing')}>
              <strong>{formatMmSs(snap?.breaks.sittingMs ?? 0)}</strong>
            </Ring>
            <div>
              <p>
                {snap?.breaks.pending
                  ? t('dashboard.breakPending')
                  : t('dashboard.nextBreak', {
                      kind: t(`break.kind.${snap?.breaks.nextKind ?? 'micro'}`),
                      time: formatMmSs(remaining),
                    })}
              </p>
              {snap?.breaks.pending && (
                <button
                  className="primary"
                  onClick={() => runtime.openBreak(snap.breaks.pending as 'micro' | 'long')}
                >
                  {t('dashboard.takeBreak')}
                </button>
              )}
            </div>
          </div>
        </CollapsibleCard>

        {snap?.blink.enabled && (
          <CollapsibleCard id="blink" title={t('dashboard.blink')} summary={<strong>{blinkText}</strong>}>
            <p>{blinkText}</p>
          </CollapsibleCard>
        )}

        <CollapsibleCard id="controls" title={t('dashboard.controls')}>
          <div className="actions left wrap">
            <button onClick={() => runtime.pause(!paused)}>
              {paused ? t('dashboard.resume') : t('dashboard.pause')}
            </button>
            {[15, 30, 60].map((m) => (
              <button key={m} onClick={() => runtime.snoozeAlerts(m)}>
                {t('dashboard.snooze', { count: m })}
              </button>
            ))}
            <label className="check inline">
              <input
                type="checkbox"
                checked={settings.alerts.dnd}
                onChange={(e) => runtime.setDnd(e.target.checked)}
              />
              <span>{t('dashboard.dnd')}</span>
            </label>
            <label className="check inline">
              <input
                type="checkbox"
                checked={settings.hypervigilance}
                onChange={(e) => runtime.updateSettings((s) => ({ ...s, hypervigilance: e.target.checked }))}
              />
              <span>{t('dashboard.hypervigilance')}</span>
            </label>
            <button onClick={() => runtime.navigate('calibration')}>{t('calibration.redo')}</button>
            {runtime.canMiniMode() && (
              <button onClick={() => runtime.setMiniMode(true)}>{t('mini.enter')}</button>
            )}
          </div>
        </CollapsibleCard>
      </div>
    </main>
  );
}
