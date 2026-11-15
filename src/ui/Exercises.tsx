// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { useState, type ReactNode } from 'react';
import { runtime } from '../app/runtime';
import { useApp } from '../app/store';
import { EXERCISES, canShow, canUseExercises, type Exercise } from '../exercises/library';
import { Card, Notice } from './components';
import { Illustration } from './Illustration';
import { useT } from './useT';

export function ExerciseDetails({
  exercise,
  compact = false,
}: {
  exercise: Exercise;
  compact?: boolean;
}): ReactNode {
  const t = useT();
  const p = `exercise.${exercise.id}`;
  return (
    <article className={`exercise${compact ? ' compact' : ''}`}>
      <Illustration id={exercise.illustration} title={t(`${p}.name`)} />
      <div>
        <h3>{t(`${p}.name`)}</h3>
        <p>{t(`${p}.objective`)}</p>
        <ol>
          {Array.from({ length: exercise.steps }, (_, i) => (
            <li key={i}>{t(`${p}.step.${i + 1}`)}</li>
          ))}
        </ol>
        <p>
          <strong>{t('exercise.reps')}</strong> {t(`${p}.reps`)}
        </p>
        <p>
          <strong>{t('exercise.stop')}</strong> {t(`${p}.stop`)}
        </p>
        <Notice kind="warning">
          <ul className="bullets">
            {Array.from({ length: exercise.cautions }, (_, i) => (
              <li key={i}>{t(`${p}.caution.${i + 1}`)}</li>
            ))}
            <li>{t('exercise.rule.symptoms')}</li>
          </ul>
        </Notice>
      </div>
    </article>
  );
}

export function Exercises(): ReactNode {
  const t = useT();
  const s = useApp((st) => st.settings);
  const gate = {
    redFlagsConfirmed: s.onboarding.redFlagsConfirmed,
    advancedAccepted: s.onboarding.advancedExercisesAccepted,
    preset: s.preset,
  };
  const [ack, setAck] = useState(false);

  if (!canUseExercises(gate)) {
    return (
      <main aria-labelledby="ex-title">
        <h1 id="ex-title">{t('exercises.title')}</h1>
        <Notice kind="error">{t('exercises.blocked')}</Notice>
        <label className="check">
          <input
            type="checkbox"
            checked={false}
            onChange={(e) =>
              e.target.checked &&
              runtime.updateSettings((x) => ({
                ...x,
                onboarding: { ...x.onboarding, redFlagsConfirmed: true },
              }))
            }
          />
          <span>{t('onboarding.redflags.confirm')}</span>
        </label>
      </main>
    );
  }

  const advanced = EXERCISES.filter((e) => e.level === 'advanced');
  const advancedHidden = s.preset === 'sensitive';

  return (
    <main aria-labelledby="ex-title">
      <h1 id="ex-title">{t('exercises.title')}</h1>
      <Notice kind="warning">{t('exercises.safety')}</Notice>
      {EXERCISES.filter((e) => e.level === 'basic').map((e) => (
        <Card key={e.id}>
          <ExerciseDetails exercise={e} />
        </Card>
      ))}
      <h2>{t('exercises.advanced')}</h2>
      {advancedHidden ? (
        <Notice>{t('exercises.advancedHiddenSensitive')}</Notice>
      ) : !s.onboarding.advancedExercisesAccepted ? (
        <Card>
          <Notice kind="warning">{t('exercises.advancedWarning')}</Notice>
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{t('exercises.advancedAccept')}</span>
          </label>
          <div className="actions left">
            <button
              disabled={!ack}
              onClick={() =>
                runtime.updateSettings((x) => ({
                  ...x,
                  onboarding: { ...x.onboarding, advancedExercisesAccepted: true },
                }))
              }
            >
              {t('exercises.unlock')}
            </button>
          </div>
        </Card>
      ) : (
        advanced
          .filter((e) => canShow(e, gate))
          .map((e) => (
            <Card key={e.id}>
              <ExerciseDetails exercise={e} />
            </Card>
          ))
      )}
    </main>
  );
}
