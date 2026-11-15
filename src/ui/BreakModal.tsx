import { useEffect, useRef, useState, type ReactNode } from 'react';
import { runtime } from '../app/runtime';
import { BREAK_DURATION_MS, useApp } from '../app/store';
import { formatMmSs } from '../i18n';
import { ExerciseDetails } from './Exercises';
import { useT } from './useT';

export function BreakModal(): ReactNode {
  const t = useT();
  const ui = useApp((s) => s.breakUi);
  const settings = useApp((s) => s.settings);
  useApp((s) => s.snapshot?.reason); // re-renderiza si cambia el ejercicio sugerido
  const started = ui?.timerStartedAt ?? null;
  const [now, setNow] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const total = BREAK_DURATION_MS[ui?.kind ?? 'micro'];
  const remaining = started === null ? total : Math.max(total - (now - started), 0);
  const finished = started !== null && remaining === 0;

  useEffect(() => {
    if (ui) dialog.current?.focus();
  }, [ui]);

  useEffect(() => {
    if (started === null) return;
    const tick = (): void => setNow(performance.now());
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [started]);

  useEffect(() => {
    if (finished) runtime.exerciseDone();
  }, [finished]);

  if (!ui) return null;
  const exercise = runtime.breakExercise();

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="break-title"
        tabIndex={-1}
        ref={dialog}
      >
        <h2 id="break-title">{t(`break.title.${ui.kind}`)}</h2>
        <p>{t(`break.body.${ui.kind}`)}</p>
        {exercise ? (
          <ExerciseDetails exercise={exercise} compact />
        ) : (
          <p className="muted">{t('break.noExercise')}</p>
        )}
        <p className="countdown" aria-live="off">
          {formatMmSs(remaining)}
        </p>
        <div className="actions">
          {started === null && <button onClick={() => runtime.startBreakTimer()}>{t('break.start')}</button>}
          <button className="primary" onClick={() => runtime.finishBreak(ui.kind, 'done', exercise?.id)}>
            {t('break.done')}
          </button>
          <button onClick={() => runtime.snoozeBreak(ui.kind)}>
            {t('break.snooze', { count: settings.breaks.snoozeMin })}
          </button>
          <button onClick={() => runtime.finishBreak(ui.kind, 'skip')}>{t('break.skip')}</button>
        </div>
        <small>{t('break.doneHint')}</small>
      </div>
    </div>
  );
}
