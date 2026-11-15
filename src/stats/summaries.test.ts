import { describe, expect, it } from 'vitest';
import type { ExerciseGate } from '../exercises/library';
import { buildAdvice } from './advice';
import {
  activityOf,
  aggregateByDay,
  aggregateByMonth,
  aggregateByWeek,
  compareGood,
  reliabilityOf,
  SessionRecorder,
  summarize,
  trend,
} from './aggregate';
import { emptyDaily, pruneStore } from './daily';
import { dominantDeviation, fatigueDrop, hourlyProfile, worstHour, worstWeekday } from './insights';
import { findForbiddenContent, migrateStore } from './migrations';
import {
  STORE_VERSION,
  defaultStore,
  emptyTotals,
  type AwayEpisode,
  type DailyRecord,
  type SessionSummary,
  type SittingBlock,
} from './model';
import { addDays, monthKeyOfDay, weekKeyOfDay } from './time';

const MIN = 60_000;
const HOUR = 60 * MIN;

const day = (key: string, over: Partial<DailyRecord> = {}): DailyRecord => ({ ...emptyDaily(key), ...over });
const summary = (over: Partial<DailyRecord> = {}, key = '2026-02-02') => summarize(key, [day(key, over)]);
const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  ...emptyTotals(),
  id: 's',
  startedAt: Date.UTC(2026, 0, 5, 10),
  endedAt: Date.UTC(2026, 0, 5, 10, 5),
  mode: 'frontal',
  hours: [],
  deviationMs: {},
  deviationActiveMs: {},
  ...over,
});

const OPEN: ExerciseGate = { redFlagsConfirmed: true, advancedAccepted: false, preset: 'standard' };
const BLOCKED: ExerciseGate = { ...OPEN, redFlagsConfirmed: false };

describe('claves de tiempo', () => {
  it('semana (lunes), mes y desplazamiento de días', () => {
    expect(weekKeyOfDay('2026-01-11')).toBe('2026-01-05');
    expect(weekKeyOfDay('2026-01-05')).toBe('2026-01-05');
    expect(monthKeyOfDay('2026-03-20')).toBe('2026-03');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('migración a la v3', () => {
  const v2 = {
    version: 2,
    settings: {},
    profiles: [],
    sessions: [
      {
        id: 'a',
        startedAt: Date.UTC(2026, 0, 5, 10),
        endedAt: Date.UTC(2026, 0, 5, 10, 5),
        mode: 'frontal',
        okMs: 1000,
        mildMs: 0,
        badMs: 0,
        criticalMs: 0,
        suppressedMs: 500,
        absentMs: 20,
        noDataMs: 0,
        deviationMs: { slouch: 10 },
      },
    ],
    alerts: [{ t: 1, level: 'CRITICA', reason: 'slouch' }],
    breaks: [{ t: 2, kind: 'micro', outcome: 'completed' }],
  };

  it('conserva los totales y rellena lo nuevo; suppressedMs queda como causa desconocida', () => {
    const res = migrateStore(v2);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.from).toBe(2);
    expect(res.store.version).toBe(STORE_VERSION);
    expect(res.store.sessions[0]).toMatchObject({
      okMs: 1000,
      suppressedMs: 500,
      absentMs: 20,
      standingMs: 0,
      lockedMs: 0,
      hours: [],
      deviationMs: { slouch: 10 },
      deviationActiveMs: {},
    });
    expect(res.store.sessions[0]?.utcOffsetMin).toBeUndefined();
    expect(res.store.away).toEqual([]);
    expect(res.store.blocks).toEqual([]);
    expect(res.store.daily).toEqual([]);
    const p = summarize('x', [day('x', { suppressedMs: 500 })]);
    expect(p.notAnalysed.unknown).toBe(500);
  });

  it('sanea valores inválidos de datos v3', () => {
    const res = migrateStore({
      ...defaultStore(),
      sessions: [
        {
          ...session(),
          okMs: -5,
          hours: [{ hour: 30, okMs: 1 }, { hour: 4, okMs: 7, awayMs: -1 }, 'x'],
          deviationActiveMs: { slouch: 3, nope: 9 },
        },
      ],
      away: [{ t: 1, durMs: 2, kind: 'absent' }, { t: 1, durMs: 2, kind: 'raro' }, null],
      blocks: [{ t: 1, durMs: 9 }, { t: 'x' }],
      daily: [{ dayKey: '2026-01-01', okMs: 4, alerts: -3 }, { okMs: 1 }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.store.sessions[0]?.okMs).toBe(0);
    expect(res.store.sessions[0]?.hours).toEqual([
      { hour: 4, okMs: 7, mildMs: 0, badMs: 0, criticalMs: 0, awayMs: 0 },
    ]);
    expect(res.store.sessions[0]?.deviationActiveMs).toEqual({ slouch: 3 });
    expect(res.store.away).toHaveLength(1);
    expect(res.store.blocks).toHaveLength(1);
    expect(res.store.daily).toHaveLength(1);
    expect(res.store.daily[0]).toMatchObject({ dayKey: '2026-01-01', okMs: 4, alerts: 0 });
  });

  it('los campos nuevos no contienen nada prohibido', () => {
    const st = defaultStore();
    st.sessions.push(
      session({ hours: [{ hour: 1, okMs: 1, mildMs: 0, badMs: 0, criticalMs: 0, awayMs: 0 }] }),
    );
    st.away.push({ t: 1, durMs: 5, kind: 'standing' });
    st.blocks.push({ t: 1, durMs: 5 });
    st.daily.push(day('2026-01-01'));
    expect(findForbiddenContent(st)).toBeNull();
  });
});

describe('compactación en resúmenes diarios', () => {
  const build = () => {
    const st = defaultStore();
    const old = Date.UTC(2026, 0, 5, 10);
    const recent = Date.UTC(2026, 2, 20, 10);
    st.sessions.push(
      session({
        id: 'old',
        startedAt: old,
        endedAt: old + 1,
        okMs: 100,
        badMs: 50,
        deviationMs: { slouch: 50 },
      }),
      session({ id: 'new', startedAt: recent, endedAt: recent + 1, okMs: 30, absentMs: 7 }),
    );
    st.alerts.push(
      { t: old, level: 'CRITICA', reason: 'slouch', ignored: true },
      { t: recent, level: 'MALA_POSTURA', reason: null },
    );
    st.breaks.push({ t: old, kind: 'micro', outcome: 'absence' });
    st.away.push({ t: old, durMs: 4 * MIN, kind: 'absent' });
    st.blocks.push({ t: old, durMs: 90 * MIN }, { t: recent, durMs: 10 * MIN });
    return { st, old, recent };
  };

  it('lo anterior a 45 días pasa a daily y se conservan los totales', () => {
    const { st } = build();
    const before = aggregateByDay(st, 0);
    const pruned = pruneStore(st);
    expect(pruned.sessions.map((s) => s.id)).toEqual(['new']);
    expect(pruned.alerts).toHaveLength(1);
    expect(pruned.breaks).toHaveLength(0);
    expect(pruned.away).toHaveLength(0);
    expect(pruned.blocks).toHaveLength(1);
    expect(pruned.daily).toHaveLength(1);
    expect(pruned.daily[0]).toMatchObject({
      dayKey: '2026-01-05',
      okMs: 100,
      badMs: 50,
      alerts: 1,
      alertsIgnored: 1,
      breaksByAbsence: 1,
      awayCount: 1,
      longestAwayMs: 4 * MIN,
      blocksLong: 1,
      longestBlockMs: 90 * MIN,
    });
    const after = aggregateByDay(pruned, 0);
    expect(after).toEqual(before);
    expect(aggregateByMonth(pruned, 0).map((m) => m.key)).toEqual(['2026-01', '2026-03']);
  });

  it('es idempotente y no toca lo reciente', () => {
    const { st } = build();
    const once = pruneStore(st);
    expect(pruneStore(once)).toEqual(once);
    expect(pruneStore(defaultStore())).toEqual(defaultStore());
  });

  it('un día compactado y datos nuevos del mismo día se suman', () => {
    const { st } = build();
    const pruned = pruneStore(st);
    pruned.daily.push(day('2026-03-20', { okMs: 11 }));
    const d = aggregateByDay(pruned, 0).find((x) => x.key === '2026-03-20');
    expect(d?.okMs).toBe(41);
  });
});

describe('resúmenes: el tiempo fuera de la silla no es postura', () => {
  it('goodRatio solo usa el tiempo sentado analizado', () => {
    const a = summary({ okMs: 3 * HOUR, badMs: 1 * HOUR });
    const b = summary({
      okMs: 3 * HOUR,
      badMs: 1 * HOUR,
      absentMs: 5 * HOUR,
      standingMs: HOUR,
      lockedMs: 2 * HOUR,
    });
    expect(a.goodRatio).toBe(0.75);
    expect(b.goodRatio).toBe(0.75);
    expect(b.awayMs).toBe(8 * HOUR);
    expect(b.coverage).toBe(1);
    expect(b.reliability).toBe('high');
  });

  it('la cobertura solo penaliza lo que es un fallo de análisis, no las pausas', () => {
    const away = summary({ okMs: 2 * HOUR, absentMs: 6 * HOUR });
    expect(away.coverage).toBe(1);
    const dark = summary({ okMs: 2 * HOUR, lightMs: 2 * HOUR, noDataMs: HOUR });
    expect(dark.coverage).toBeCloseTo(2 / 5, 9);
    expect(dark.reliability).toBe('low');
  });

  it('fiabilidad por umbrales', () => {
    expect(reliabilityOf(2 * HOUR, 0.9)).toBe('high');
    expect(reliabilityOf(30 * MIN, 0.9)).toBe('low');
    expect(reliabilityOf(2 * HOUR, 0.5)).toBe('low');
    expect(reliabilityOf(10 * MIN, 1)).toBe('insufficient');
    expect(reliabilityOf(2 * HOUR, 0.1)).toBe('insufficient');
    expect(reliabilityOf(2 * HOUR, null)).toBe('insufficient');
  });

  it('no compara ni calcula tendencias con periodos insuficientes', () => {
    const good = summary({ okMs: 3 * HOUR, badMs: HOUR }, '2026-02-02');
    const few = summary({ okMs: 5 * MIN }, '2026-02-03');
    const better = summary({ okMs: 4 * HOUR }, '2026-02-04');
    expect(compareGood(better, good)).toBeCloseTo(0.25, 9);
    expect(compareGood(better, few)).toBeNull();
    expect(compareGood(better, undefined)).toBeNull();
    expect(trend([few, better])).toBeNull();
    expect(trend([good, better], 1)).toBeCloseTo(0.25, 9);
  });

  it('agrega por semana y mes con pausas y bloques', () => {
    const st = defaultStore();
    const t = (d: number, h = 10) => Date.UTC(2026, 0, d, h);
    st.sessions.push(
      session({ startedAt: t(5), okMs: HOUR }),
      session({ startedAt: t(12), okMs: HOUR, badMs: HOUR }),
    );
    st.away.push({ t: t(5), durMs: MIN, kind: 'absent' }, { t: t(6), durMs: MIN, kind: 'standing' });
    st.blocks.push({ t: t(5), durMs: 2 * HOUR });
    const weeks = aggregateByWeek(st, 0);
    expect(weeks.map((w) => w.key)).toEqual(['2026-01-05', '2026-01-12']);
    expect(weeks[0]).toMatchObject({ awayCount: 2, blocksLong: 1 });
    const month = aggregateByMonth(st, 0)[0]!;
    expect(month.key).toBe('2026-01');
    expect(month.analysedMs).toBe(3 * HOUR);
    expect(month.awayPerSeatedHour).toBeCloseTo(2 / 3, 9);
    expect(month.days).toBe(3);
  });

  it('resume el parpadeo: media por minuto y fracci\u00f3n con frecuencia baja', () => {
    const p = summary({ blinkMs: 10 * MIN, blinkCount: 80, lowBlinkMs: 4 * MIN });
    expect(p.blinkRatePerMin).toBeCloseTo(8, 9);
    expect(p.lowBlinkShare).toBeCloseTo(0.4, 9);
    expect(summary().blinkRatePerMin).toBeNull();
    expect(summary().lowBlinkShare).toBeNull();
  });

  it('breakCompliance cuenta omitidos y declarados', () => {
    const p = summary({ breaksCompleted: 1, breaksDeclared: 1, breaksSkipped: 2 });
    expect(p.breakCompliance).toBe(0.25);
    expect(summary().breakCompliance).toBeNull();
  });
});

describe('insights', () => {
  const hourBuckets = (rows: [number, number, number][]) =>
    rows.map(([hour, ok, bad]) => ({ hour, okMs: ok, mildMs: 0, badMs: bad, criticalMs: 0, awayMs: 0 }));

  it('franja peor y fatiga sobre horas con tiempo sentado suficiente', () => {
    const p = summary({
      okMs: 10 * HOUR,
      hours: hourBuckets([
        [9, 50 * MIN, 5 * MIN],
        [10, 50 * MIN, 5 * MIN],
        [11, 40 * MIN, 15 * MIN],
        [12, 30 * MIN, 25 * MIN],
        [15, 10 * MIN, 45 * MIN],
        [16, 10 * MIN, 45 * MIN],
        [17, 1 * MIN, 1 * MIN], // < 5 min sentado: no cuenta
      ]),
    });
    expect(hourlyProfile(p).map((h) => h.hour)).toEqual([9, 10, 11, 12, 15, 16]);
    expect(worstHour(p)?.hour).toBe(15);
    expect(fatigueDrop(p)).toBeGreaterThan(0.15);
  });

  it('sin diferencia apreciable o con pocas horas no hay conclusión', () => {
    const flat = summary({
      okMs: 3 * HOUR,
      hours: hourBuckets([
        [9, 50 * MIN, 5 * MIN],
        [10, 50 * MIN, 5 * MIN],
        [11, 50 * MIN, 5 * MIN],
      ]),
    });
    expect(worstHour(flat)).toBeNull();
    expect(fatigueDrop(flat)).toBeNull();
    expect(worstHour(summary({ okMs: 5 * MIN, hours: hourBuckets([[9, 4 * MIN, 1 * MIN]]) }))).toBeNull();
  });

  it('desviación dominante solo con datos fiables y por encima del umbral', () => {
    const p = summary({
      okMs: 3 * HOUR,
      badMs: HOUR,
      deviationMs: { slouch: 40 * MIN, protrusion: 20 * MIN },
    });
    expect(dominantDeviation(p)).toMatchObject({ id: 'slouch' });
    expect(dominantDeviation(p)?.share).toBeCloseTo(2 / 3, 9);
    const even = summary({
      okMs: 3 * HOUR,
      badMs: HOUR,
      deviationMs: { slouch: 10 * MIN, protrusion: 10 * MIN, headDown: 10 * MIN, proximity: 10 * MIN },
    });
    expect(dominantDeviation(even)).toBeNull();
    expect(dominantDeviation(summary({ okMs: MIN, deviationMs: { slouch: MIN } }))).toBeNull();
  });

  it('peor día de la semana exige 3 días distintos y diferencia', () => {
    const mk = (key: string, ok: number, bad: number) => summary({ okMs: ok, badMs: bad }, key);
    const days = [
      mk('2026-02-02', 4 * HOUR, 0),
      mk('2026-02-03', 4 * HOUR, 0),
      mk('2026-02-04', 1 * HOUR, 3 * HOUR),
    ];
    expect(worstWeekday(days)).toMatchObject({ weekday: 2 });
    expect(worstWeekday(days.slice(0, 2))).toBeNull();
    expect(worstWeekday([...days, mk('2026-02-09', 4 * HOUR, 0)])).toMatchObject({ weekday: 2 });
  });
});

describe('pautas', () => {
  const ids = (xs: ReturnType<typeof buildAdvice>) => xs.map((a) => a.id);

  it('con pocos datos solo avisa de que son insuficientes', () => {
    const adv = buildAdvice({
      current: summary({ okMs: 5 * MIN, badMs: 5 * MIN, deviationMs: { slouch: 5 * MIN } }),
      gate: OPEN,
    });
    expect(ids(adv)).toEqual(['insufficientData']);
  });

  it('con cobertura baja explica la causa y no da pautas de postura', () => {
    const adv = buildAdvice({
      current: summary({
        okMs: 20 * MIN,
        badMs: 10 * MIN,
        lightMs: 3 * HOUR,
        deviationMs: { slouch: 10 * MIN },
      }),
      gate: OPEN,
    });
    expect(ids(adv)).toEqual(['lowCoverage', 'insufficientData']);
    expect(adv[0]?.cause).toBe('light');
    expect(
      buildAdvice({ current: summary({ okMs: 20 * MIN, notCalibratedMs: 3 * HOUR }), gate: OPEN })[0]?.cause,
    ).toBe('calibration');
    expect(
      buildAdvice({ current: summary({ okMs: 20 * MIN, noDataMs: 3 * HOUR }), gate: OPEN })[0]?.cause,
    ).toBe('camera');
  });

  it('desviación dominante con ejercicio solo si están desbloqueados', () => {
    const current = summary({
      okMs: 3 * HOUR,
      badMs: HOUR,
      deviationMs: { slouch: 50 * MIN, protrusion: 10 * MIN },
    });
    const open = buildAdvice({ current, gate: OPEN }).find((a) => a.id === 'dominantDeviation');
    expect(open).toMatchObject({ deviation: 'slouch', exerciseId: 'thoracic', severity: 'warning' });
    const blocked = buildAdvice({ current, gate: BLOCKED }).find((a) => a.id === 'dominantDeviation');
    expect(blocked?.exerciseId).toBeUndefined();
    expect(blocked?.deviation).toBe('slouch');
  });

  it('no se aconseja corregir la desviación si el objetivo ya se cumple', () => {
    const current = summary({ okMs: 9 * HOUR, badMs: HOUR, deviationMs: { slouch: HOUR } });
    const adv = buildAdvice({ current, gate: OPEN });
    expect(ids(adv)).toContain('goalReached');
    expect(ids(adv)).not.toContain('dominantDeviation');
  });

  it('sedestación prolongada, pocas pausas y buen movimiento', () => {
    const long = buildAdvice({
      current: summary({ okMs: 3 * HOUR, blocksLong: 2, longestBlockMs: 95 * MIN, blocksCount: 2 }),
      gate: OPEN,
    });
    expect(long.find((a) => a.id === 'longSitting')).toMatchObject({ params: { longest: 95, count: 2 } });
    const few = buildAdvice({ current: summary({ okMs: 4 * HOUR, awayCount: 1 }), gate: OPEN });
    expect(ids(few)).toContain('fewPauses');
    const good = buildAdvice({ current: summary({ okMs: 4 * HOUR, awayCount: 12 }), gate: OPEN });
    expect(ids(good)).toContain('goodMovement');
    expect(ids(good)).not.toContain('fewPauses');
  });

  it('descansos omitidos y avisos ignorados', () => {
    const adv = buildAdvice({
      current: summary({ okMs: 4 * HOUR, breaksSkipped: 3, breaksCompleted: 1, alerts: 4, alertsIgnored: 3 }),
      gate: OPEN,
    });
    expect(ids(adv)).toEqual(expect.arrayContaining(['skippedBreaks', 'ignoredAlerts']));
  });

  it('mejora o empeora respecto al periodo anterior y ordena por gravedad', () => {
    const prev = summary({ okMs: 2 * HOUR, badMs: 2 * HOUR }, '2026-02-01');
    const better = buildAdvice({
      current: summary({ okMs: 3 * HOUR, badMs: HOUR }),
      previous: prev,
      gate: OPEN,
    });
    expect(better.find((a) => a.id === 'improving')?.params).toEqual({ points: 25 });
    const worse = buildAdvice({
      current: summary({ okMs: HOUR, badMs: 3 * HOUR, blocksLong: 1, longestBlockMs: 2 * HOUR }),
      previous: prev,
      gate: OPEN,
    });
    expect(worse.find((a) => a.id === 'worsening')?.params).toEqual({ points: 25 });
    expect(worse[0]?.severity).toBe('warning');
    const mixed = buildAdvice({
      current: summary({ okMs: 9 * HOUR, badMs: HOUR, alerts: 4, alertsIgnored: 4 }),
      gate: OPEN,
    });
    expect(mixed.map((a) => a.severity)).toEqual(
      [...mixed.map((a) => a.severity)].sort((a, b) => 'wip'.indexOf(a[0]!) - 'wip'.indexOf(b[0]!)),
    );
  });

  it('peor día de la semana con los días del periodo', () => {
    const mk = (key: string, ok: number, bad: number) => summary({ okMs: ok, badMs: bad }, key);
    const days = [
      mk('2026-02-02', 4 * HOUR, 0),
      mk('2026-02-03', 4 * HOUR, 0),
      mk('2026-02-04', HOUR, 3 * HOUR),
    ];
    const adv = buildAdvice({
      current: summarize(
        '2026-02-02',
        days.map((d) => day(d.key, { okMs: d.okMs, badMs: d.analysedMs - d.okMs })),
      ),
      days,
      gate: OPEN,
    });
    expect(adv.find((a) => a.id === 'worstWeekday')?.params.weekday).toBe(2);
  });
});

describe('SessionRecorder: día, hora, ausencias y bloques', () => {
  const setup = (blockBreakMs?: () => number) => {
    const sessions: SessionSummary[] = [];
    const away: AwayEpisode[] = [];
    const blocks: SittingBlock[] = [];
    const rec = new SessionRecorder(
      () => `id${sessions.length}`,
      () => 'frontal',
      0,
      {
        utcOffsetMin: () => 0,
        sink: { session: (s) => sessions.push(s), away: (e) => away.push(e), block: (b) => blocks.push(b) },
        ...(blockBreakMs ? { blockBreakMs } : {}),
      },
    );
    let t = 0;
    const run = (ms: number, state: Parameters<SessionRecorder['add']>[2]): void => {
      for (let i = 0; i < ms / 10_000; i++) {
        t += 10_000;
        rec.add(t, 10_000, state, 'OK', null);
      }
    };
    return { rec, sessions, away, blocks, run, at: (ms: number) => (t = ms) };
  };

  it('corta la sesión al cambiar de día local y reparte por hora', () => {
    const { rec, sessions, at } = setup();
    at(Date.UTC(2026, 0, 5, 23, 59, 50));
    rec.add(Date.UTC(2026, 0, 5, 23, 59, 55), 5000, 'seated', 'OK', null);
    rec.add(Date.UTC(2026, 0, 6, 0, 0, 5), 10_000, 'seated', 'MALA_POSTURA', null);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ okMs: 5000, badMs: 0 });
    expect(sessions[0]?.hours).toEqual([
      { hour: 23, okMs: 5000, mildMs: 0, badMs: 0, criticalMs: 0, awayMs: 0 },
    ]);
    const next = rec.flush(Date.UTC(2026, 0, 6, 0, 1))!;
    expect(next).toMatchObject({ badMs: 10_000, okMs: 0 });
    expect(next.hours).toEqual([{ hour: 0, okMs: 0, mildMs: 0, badMs: 10_000, criticalMs: 0, awayMs: 0 }]);
  });

  it('las horas separan lo sentado de lo ausente', () => {
    const { rec } = setup();
    rec.add(Date.UTC(2026, 0, 5, 10, 0, 10), 10_000, 'seated', 'OK', null);
    rec.add(Date.UTC(2026, 0, 5, 10, 0, 20), 10_000, 'absent', 'OK', null);
    rec.add(Date.UTC(2026, 0, 5, 10, 0, 30), 10_000, 'paused', 'OK', null);
    const s = rec.flush(Date.UTC(2026, 0, 5, 10, 1))!;
    expect(s.hours).toEqual([{ hour: 10, okMs: 10_000, mildMs: 0, badMs: 0, criticalMs: 0, awayMs: 10_000 }]);
    expect(s.pausedMs).toBe(10_000);
  });

  it('episodios de ausencia: mínimo 30 s y causa mayoritaria', () => {
    const { run, away } = setup();
    run(20_000, 'absent');
    run(10_000, 'seated');
    expect(away).toEqual([]);
    run(30_000, 'absent');
    run(60_000, 'locked');
    run(10_000, 'seated');
    expect(away).toHaveLength(1);
    expect(away[0]).toMatchObject({ kind: 'locked', durMs: 90_000 });
    expect(away[0]!.t).toBe(30_000);
  });

  it('un cambio a "sin datos" cierra la ausencia', () => {
    const { run, away } = setup();
    run(60_000, 'standing');
    run(10_000, 'nodata');
    expect(away).toMatchObject([{ kind: 'standing', durMs: 60_000 }]);
  });

  it('bloques sentados: las pausas cortas no los cortan, las de 3 min o más sí', () => {
    const { run, blocks, rec } = setup();
    run(120_000, 'seated');
    run(120_000, 'absent');
    run(120_000, 'seated');
    expect(blocks).toEqual([]);
    run(180_000, 'standing');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ t: 0, durMs: 240_000 });
    run(60_000, 'light');
    run(30_000, 'locked');
    rec.closeOpen();
    expect(blocks).toHaveLength(2);
    expect(blocks[1]!.durMs).toBe(60_000);
  });

  it('bloques muy cortos no se registran y closeOpen sin nada abierto no hace nada', () => {
    const { run, blocks, rec, away } = setup(() => 60_000);
    run(30_000, 'seated');
    run(60_000, 'absent');
    expect(blocks).toEqual([]);
    expect(away).toEqual([]);
    rec.closeOpen();
    expect(away).toHaveLength(1);
  });

  it('nodata no cuenta como sentado pero sí corta el bloque con el tiempo', () => {
    const { run, blocks } = setup();
    run(120_000, 'seated');
    run(180_000, 'nodata');
    expect(blocks).toHaveLength(1);
  });
});

describe('activityOf', () => {
  const base = {
    locked: false,
    paused: false,
    presence: 'present' as const,
    calibrated: true,
    lightingOk: true,
    standing: false,
    gap: false,
  };
  it('mantiene la causa con la misma precedencia que la supresión', () => {
    expect(activityOf(base)).toBe('seated');
    expect(activityOf({ ...base, standing: true })).toBe('standing');
    expect(activityOf({ ...base, standing: true, lightingOk: false })).toBe('light');
    expect(activityOf({ ...base, lightingOk: false, calibrated: false })).toBe('notCalibrated');
    expect(activityOf({ ...base, presence: 'absent', calibrated: false })).toBe('absent');
    expect(activityOf({ ...base, presence: 'nodata' })).toBe('nodata');
    expect(activityOf({ ...base, presence: 'nodata', paused: true })).toBe('paused');
    expect(activityOf({ ...base, presence: 'absent', paused: true, locked: true })).toBe('locked');
    expect(activityOf({ ...base, gap: true })).toBe('locked');
  });
});
