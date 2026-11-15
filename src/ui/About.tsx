// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { ReactNode } from 'react';
import { homepage } from '../../package.json';
import { deviationLabelKey } from '../app/clock';
import { useApp } from '../app/store';
import { DEVIATION_IDS } from '../core/types';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import { Card, Notice } from './components';
import { LicenseViewer } from './LicenseViewer';
import { useT } from './useT';

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
const CONFIDENCE_KEY = {
  consenso: 'confidence.consensus',
  'literatura limitada': 'confidence.limited',
  heurística: 'confidence.heuristic',
} as const;

export function About(): ReactNode {
  const t = useT();
  const mode = useApp((s) => s.settings.mode);
  const table = CLINICAL_CONFIG.thresholds[mode];
  return (
    <main aria-labelledby="ab-title">
      <div className="about-head">
        <img
          className="about-icon"
          src={`${import.meta.env.BASE_URL}icon.svg`}
          alt=""
          width={72}
          height={72}
        />
        <div>
          <h1 id="ab-title">{t('about.title')}</h1>
          <p>{t('app.tagline')}</p>
        </div>
      </div>
      <Notice kind="warning">{t('legal.notMedical')}</Notice>
      <Card title={t('about.redflags')}>
        <p>{t('onboarding.redflags.intro')}</p>
        <ul className="bullets">
          {RED_FLAGS.map((f) => (
            <li key={f}>{t(`redflag.${f}`)}</li>
          ))}
        </ul>
        <Notice kind="error">{t('onboarding.redflags.action')}</Notice>
      </Card>
      <Card title={t('about.privacy')}>
        <ul className="bullets">
          <li>{t('onboarding.privacy.1')}</li>
          <li>{t('onboarding.privacy.2')}</li>
          <li>{t('onboarding.privacy.3')}</li>
          <li>{t('about.cameraIndicator')}</li>
        </ul>
      </Card>
      <Card title={t('about.thresholds')}>
        <Notice kind="warning">
          {t(CLINICAL_CONFIG.clinicianReviewed ? 'about.reviewed' : 'about.notReviewed')}
        </Notice>
        <table className="thresholds">
          <caption>{t('about.thresholds.caption', { mode: t(`mode.${mode}`) })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('about.col.deviation')}</th>
              <th scope="col">{t('about.col.amber')}</th>
              <th scope="col">{t('about.col.red')}</th>
              <th scope="col">{t('about.col.confidence')}</th>
            </tr>
          </thead>
          <tbody>
            {DEVIATION_IDS.map((id) => {
              const spec = table[id];
              if (!spec) return null;
              const unit = spec.unit === 'deg' ? '°' : '%';
              return (
                <tr key={id}>
                  <th scope="row">{t(deviationLabelKey(id))}</th>
                  <td>
                    {spec.amber}
                    {unit}
                  </td>
                  <td>
                    {spec.red}
                    {unit}
                  </td>
                  <td>{t(CONFIDENCE_KEY[spec.confidence])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p>
          <small>{t('about.thresholds.note')}</small>
        </p>
      </Card>
      <Card title={t('about.license')}>
        <p>{t('about.license.body')}</p>
        <LicenseViewer kind="license" title={t('about.license.full')} />
        <LicenseViewer kind="notices" title={t('about.license.third')} />
        <p>
          <a href={homepage} target="_blank" rel="noopener noreferrer">
            {t('about.source')}
          </a>
        </p>
      </Card>
      <Card title={t('about.limits')}>
        <ul className="bullets">
          <li>{t('about.limit.cva')}</li>
          <li>{t('about.limit.frontal')}</li>
          <li>{t('about.limit.camera')}</li>
        </ul>
      </Card>
    </main>
  );
}
