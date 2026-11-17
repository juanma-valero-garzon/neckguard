// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { useMemo, useState, type ReactNode } from 'react';
import { deviationLabelKey } from '../app/clock';
import { useApp } from '../app/store';
import type { DeviationId } from '../core/types';
import { SYMPTOM_RULE_KEY } from '../exercises/library';
import { formatDate, formatDuration } from '../i18n';
import { buildAdvice, type Advice } from '../stats/advice';
import {
  addDays,
  aggregateByDay,
  aggregateByMonth,
  aggregateByWeek,
  compareGood,
  dayKeyOf,
  monthKeyOfDay,
  summarize,
  weekKeyOfDay,
  type PeriodSummary,
} from '../stats/aggregate';
import { hourlyProfile } from '../stats/insights';
import { Card, Notice } from './components';
import { useT } from './useT';

type Period = 'day' | 'week' | 'month';
const PERIODS: readonly Period[] = ['day', 'week', 'month'];
const MAX_ADVICE = 3;

const pct = (r: number | null): string => (r === null ? '—' : `${Math.round(r * 100)} %`);

const keyOfDay = (p: Period, day: string): string =>
  p === 'day' ? day : p === 'week' ? weekKeyOfDay(day) : monthKeyOfDay(day);

const startDay = (p: Period, key: string): string => (p === 'month' ? `${key}-01` : key);

/** Primer día del periodo desplazado `n` periodos. */
function shiftStart(p: Period, key: string, n: number): string {
  if (p === 'day') return addDays(key, n);
  if (p === 'week') return addDays(key, 7 * n);
  const [y, m] = key.split('-').map(Number) as [number, number];
  return `${new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)}-01`;
}

function daysOf(p: Period, key: string): string[] {
  if (p === 'day') return [key];
  if (p === 'week') return Array.from({ length: 7 }, (_, i) => addDays(key, i));
  const [y, m] = key.split('-').map(Number) as [number, number];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`);
}

const noon = (day: string): number => Date.parse(`${day}T12:00:00Z`);

function Reliability({ p }: { p: PeriodSummary }): ReactNode {
  const t = useT();
  const icon = p.reliability === 'high' ? '●' : p.reliability === 'low' ? '◐' : '○';
  return (
    <span className={`rel rel-${p.reliability}`} title={t('stats.reliability.help')}>
      <span aria-hidden="true">{icon}</span> {t(`stats.reliability.${p.reliability}`)}
    </span>
  );
}

function DayDetail({
  day,
  locale,
  onClose,
}: {
  day: PeriodSummary;
  locale: 'es' | 'en';
  onClose: () => void;
}): ReactNode {
  const t = useT();
  const dateStr = formatDate(locale, noon(day.key), { dateStyle: 'full', timeZone: 'UTC' });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('stats.day.title', { date: dateStr })}</h2>
          <button className="btn-close" onClick={onClose} aria-label={t('stats.day.close')}>
            {'\u2717'}
          </button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <Card title={t('stats.good')}>
              <p className="big">{pct(day.reliability === 'insufficient' ? null : day.goodRatio)}</p>
              <small>
                <Reliability p={day} />
              </small>
            </Card>
            <Card title={t('stats.alerts')}>
              <p className="big">{day.alerts}</p>
              <small>
                {t('stats.period.day')} · {t('stats.alerts')}
              </small>
            </Card>
            <Card title={t('stats.breaks')}>
              <p className="big">{day.breaksCompleted}</p>
              <small>
                {t('stats.breaksDetail', { declared: day.breaksDeclared, skipped: day.breaksSkipped })}
              </small>
            </Card>
            <Card title={t('stats.presence')}>
              <ul className="bullets">
                <li>{formatDuration(locale, day.analysedMs)}</li>
                <li>
                  {formatDuration(locale, day.awayMs)} {t('stats.away')}
                </li>
              </ul>
            </Card>
          </div>
          <Card title={t('stats.heatmap')}>
            <HourStrip p={day} locale={locale} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Bars({
  days,
  locale,
  label,
  compact,
}: {
  days: PeriodSummary[];
  locale: 'es' | 'en';
  label: string;
  compact: boolean;
}): ReactNode {
  const [selectedDay, setSelectedDay] = useState<PeriodSummary | null>(null);
  return (
    <>
      <div className={`bars${compact ? ' compact' : ''}`} role="img" aria-label={label}>
        {days.map((d) => {
          const ratio = d.reliability === 'insufficient' ? null : d.goodRatio;
          return (
            <div
              key={d.key}
              className="bar-col"
              onClick={() => setSelectedDay(d)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedDay(d);
                }
              }}
            >
              <div className="bar-track">
                <div
                  className={`bar-fill${d.reliability === 'low' ? ' bar-low' : ''}`}
                  style={{ height: `${Math.round((ratio ?? 0) * 100)}%` }}
                />
              </div>
              {!compact && <span className="bar-val">{pct(ratio)}</span>}
              <span className="bar-label">
                {compact
                  ? Number(d.key.slice(8))
                  : formatDate(locale, noon(d.key), { weekday: 'short', timeZone: 'UTC' })}
              </span>
            </div>
          );
        })}
      </div>
      {selectedDay && <DayDetail day={selectedDay} locale={locale} onClose={() => setSelectedDay(null)} />}
    </>
  );
}

function HourDetail({
  hour,
  p,
  locale,
  onClose,
}: {
  hour: number;
  p: PeriodSummary;
  locale: 'es' | 'en';
  onClose: () => void;
}): ReactNode {
  const t = useT();
  const hourData = p.hours.find((h) => h.hour === hour);
  if (!hourData) return null;

  const seatedMs = hourData.okMs + hourData.mildMs + hourData.badMs + hourData.criticalMs;
  const goodRatio = seatedMs > 0 ? hourData.okMs / seatedMs : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('stats.hour.title', { hour })}</h2>
          <button className="btn-close" onClick={onClose} aria-label={t('stats.day.close')}>
            {'\u2717'}
          </button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <Card title={t('stats.hour.good')}>
              <p className="big">{Math.round(goodRatio * 100)}%</p>
              <small>{formatDuration(locale, hourData.okMs)}</small>
            </Card>
            <Card title={t('stats.hour.mild')}>
              <p className="big">{Math.round((hourData.mildMs / seatedMs) * 100)}%</p>
              <small>{formatDuration(locale, hourData.mildMs)}</small>
            </Card>
            <Card title={t('stats.hour.bad')}>
              <p className="big">{Math.round((hourData.badMs / seatedMs) * 100)}%</p>
              <small>{formatDuration(locale, hourData.badMs)}</small>
            </Card>
            <Card title={t('stats.hour.critical')}>
              <p className="big">{Math.round((hourData.criticalMs / seatedMs) * 100)}%</p>
              <small>{formatDuration(locale, hourData.criticalMs)}</small>
            </Card>
          </div>
          <Card title={t('stats.hour.away')}>
            <p className="big">{formatDuration(locale, hourData.awayMs)}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function HourStrip({ p, locale }: { p: PeriodSummary; locale: 'es' | 'en' }): ReactNode {
  const t = useT();
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const stats = new Map(hourlyProfile(p).map((h) => [h.hour, h]));
  if (stats.size === 0) return <p className="muted">{t('stats.heatmap.none')}</p>;
  return (
    <>
      <ul className="hours" aria-label={t('stats.heatmap')}>
        {Array.from({ length: 24 }, (_, hour) => {
          const h = stats.get(hour);
          const tone = !h ? 'none' : h.goodRatio >= 0.8 ? 'good' : h.goodRatio >= 0.5 ? 'mid' : 'bad';
          const text = h
            ? t('stats.heatmap.cell', { hour, value: Math.round(h.goodRatio * 100) })
            : t('stats.heatmap.cellNone', { hour });
          return (
            <li
              key={hour}
              className={`hour-cell ${tone}${h ? ' cursor-pointer' : ''}`}
              title={text}
              aria-label={text}
              onClick={() => h && setSelectedHour(hour)}
              role={h ? 'button' : undefined}
              tabIndex={h ? 0 : undefined}
              onKeyDown={(e) => {
                if (h && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setSelectedHour(hour);
                }
              }}
            >
              <span aria-hidden="true">{h ? Math.round(h.goodRatio * 100) : '·'}</span>
              <small aria-hidden="true">{hour}</small>
            </li>
          );
        })}
      </ul>
      {selectedHour !== null && (
        <HourDetail hour={selectedHour} p={p} locale={locale} onClose={() => setSelectedHour(null)} />
      )}
    </>
  );
}

function AdviceItem({ a, locale }: { a: Advice; locale: 'es' | 'en' }): ReactNode {
  const t = useT();
  const params: Record<string, string | number> = { ...a.params };
  if (a.deviation) params.deviation = t(deviationLabelKey(a.deviation));
  if (a.id === 'worstWeekday') {
    params.weekday = formatDate(locale, Date.UTC(2024, 0, 1 + Number(a.params.weekday)), {
      weekday: 'long',
      timeZone: 'UTC',
    });
  }
  return (
    <li className={`advice advice-${a.severity}`}>
      <p>{t(`advice.${a.id}`, params)}</p>
      {a.cause && <p className="muted">{t(`advice.lowCoverage.${a.cause}`)}</p>}
      {a.deviation && <p className="muted">{t(`advice.tip.${a.deviation}`)}</p>}
      {a.exerciseId && (
        <p className="muted">
          {t('advice.exercise', { name: t(`exercise.${a.exerciseId}.name`) })} {t(SYMPTOM_RULE_KEY)}
        </p>
      )}
    </li>
  );
}

function periodLabel(p: Period, key: string, locale: 'es' | 'en'): string {
  if (p === 'day') return formatDate(locale, noon(key), { dateStyle: 'full', timeZone: 'UTC' });
  if (p === 'month') {
    return formatDate(locale, noon(`${key}-01`), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  const d = (day: string): string => formatDate(locale, noon(day), { dateStyle: 'medium', timeZone: 'UTC' });
  return `${d(key)} – ${d(addDays(key, 6))}`;
}

export function Stats(): ReactNode {
  const t = useT();
  const store = useApp((s) => s.store);
  const settings = useApp((s) => s.settings);
  const locale = settings.locale;
  const offset = -new Date().getTimezoneOffset();
  const [today] = useState(() => dayKeyOf(Date.now(), offset));
  const [period, setPeriod] = useState<Period>('day');
  const [anchor, setAnchor] = useState(today);

  const view = useMemo(() => {
    const key = keyOfDay(period, anchor);
    const dayList = aggregateByDay(store, offset);
    const list =
      period === 'day'
        ? dayList
        : period === 'week'
          ? aggregateByWeek(store, offset)
          : aggregateByMonth(store, offset);
    const find = (k: string): PeriodSummary => list.find((x) => x.key === k) ?? summarize(k, []);
    const prevKey = keyOfDay(period, shiftStart(period, startDay(period, key), -1));
    const byDay = new Map(dayList.map((d) => [d.key, d]));
    const days = daysOf(period, key).map((k) => byDay.get(k) ?? summarize(k, []));
    const current = find(key);
    const previous = find(prevKey);
    const gate = {
      redFlagsConfirmed: settings.onboarding.redFlagsConfirmed,
      advancedAccepted: settings.onboarding.advancedExercisesAccepted,
      preset: settings.preset,
    };
    const advice = buildAdvice({ current, previous, days: period === 'day' ? undefined : days, gate });
    const top = (Object.entries(current.deviationMs) as [DeviationId, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return { key, current, previous, days, advice, top, empty: dayList.length === 0 };
  }, [store, offset, period, anchor, settings.onboarding, settings.preset]);

  const { key, current: c, previous, days, advice, top } = view;
  if (view.empty) {
    return (
      <main aria-labelledby="st-title">
        <h1 id="st-title">{t('stats.title')}</h1>
        <p className="muted">{t('stats.empty')}</p>
      </main>
    );
  }

  const go = (n: number): void => setAnchor(shiftStart(period, startDay(period, key), n));
  const isCurrent = key >= keyOfDay(period, today);
  const delta = compareGood(c, previous);
  const causes = (Object.entries(c.notAnalysed) as [keyof PeriodSummary['notAnalysed'], number][]).filter(
    ([, ms]) => ms > 0,
  );

  return (
    <main aria-labelledby="st-title">
      <h1 id="st-title">{t('stats.title')}</h1>

      <div className="stats-nav">
        <div role="tablist" aria-label={t('stats.title')} className="seg">
          {PERIODS.map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={p === period}
              className={p === period ? 'primary' : ''}
              onClick={() => {
                setPeriod(p);
                setAnchor(today);
              }}
            >
              {t(`stats.period.${p}`)}
            </button>
          ))}
        </div>
        <div className="period-nav">
          <button onClick={() => go(-1)}>{t('stats.prev')}</button>
          <strong aria-live="polite">{periodLabel(period, key, locale)}</strong>
          <button onClick={() => go(1)} disabled={isCurrent}>
            {t('stats.next')}
          </button>
        </div>
      </div>

      {c.analysedMs === 0 && c.awayMs === 0 && c.alerts === 0 ? (
        <p className="muted">{t('stats.noPeriodData')}</p>
      ) : (
        <>
          <div className="grid-3">
            <Card title={t('stats.good')}>
              <p className="big">{pct(c.reliability === 'insufficient' ? null : c.goodRatio)}</p>
              <small>
                <Reliability p={c} />
              </small>
              <br />
              <small>
                {delta === null
                  ? t('stats.delta.none')
                  : Math.abs(delta) < 0.005
                    ? t('stats.delta.same')
                    : delta > 0
                      ? t('stats.delta.up', { value: Math.round(delta * 100) })
                      : t('stats.delta.down', { value: Math.round(-delta * 100) })}
              </small>
            </Card>
            <Card title={t('stats.alerts')}>
              <p className="big">{c.alerts}</p>
              <small>{t(`stats.period.${period}`)}</small>
            </Card>
            <Card title={t('stats.breaks')}>
              <p className="big">{c.breaksCompleted}</p>
              <small>
                {t('stats.breaksDetail', { declared: c.breaksDeclared, skipped: c.breaksSkipped })}
              </small>
            </Card>
          </div>

          {period !== 'day' && (
            <Card title={t('stats.byDay')}>
              <Bars days={days} locale={locale} label={t('stats.byDay')} compact={period === 'month'} />
            </Card>
          )}

          <Card title={t('stats.heatmap')}>
            <HourStrip p={c} locale={locale} />
          </Card>

          <Card title={t('stats.presence')}>
            <ul className="bullets">
              <li>{t('stats.seated', { time: formatDuration(locale, c.analysedMs) })}</li>
              <li>{t('stats.away', { time: formatDuration(locale, c.awayMs) })}</li>
              <li>
                {t('stats.awayCount', {
                  count: c.awayCount,
                  longest: formatDuration(locale, c.longestAwayMs),
                })}
              </li>
              <li>{t('stats.longestBlock', { time: formatDuration(locale, c.longestBlockMs) })}</li>
              {c.coverage !== null && <li>{t('stats.coverage', { value: Math.round(c.coverage * 100) })}</li>}
            </ul>
            <small className="muted">{t('stats.awayNote')}</small>
            {causes.length > 0 && (
              <>
                <h3>{t('stats.notAnalysed')}</h3>
                <ul className="bullets">
                  {causes.map(([cause, ms]) => (
                    <li key={cause}>
                      {t(`stats.cause.${cause}`)} — {formatDuration(locale, ms)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          {c.blinkRatePerMin !== null && c.lowBlinkShare !== null && (
            <Card title={t('stats.blink')}>
              <p className="big">{c.blinkRatePerMin.toFixed(0)}</p>
              <small>{t('stats.blink.rate', { rate: c.blinkRatePerMin.toFixed(1) })}</small>
              <br />
              <small>{t('stats.blink.low', { value: Math.round(c.lowBlinkShare * 100) })}</small>
            </Card>
          )}

          <Card title={t('stats.topDeviations')}>
            {top.length === 0 ? (
              <p className="muted">{t('stats.noDeviations')}</p>
            ) : (
              <ul className="bullets">
                {top.map(([id, ms]) => (
                  <li key={id}>
                    {t(deviationLabelKey(id))} — {formatDuration(locale, ms)}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('advice.title')}>
            {advice.length === 0 ? (
              <p className="muted">{t('advice.none')}</p>
            ) : (
              <ul className="advice-list">
                {advice.slice(0, MAX_ADVICE).map((a) => (
                  <AdviceItem key={a.id} a={a} locale={locale} />
                ))}
              </ul>
            )}
            <Notice kind="info">{t('advice.disclaimer')}</Notice>
          </Card>
        </>
      )}
    </main>
  );
}
