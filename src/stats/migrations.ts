import type { DeviationId } from '../core/types';
import { DEVIATION_IDS } from '../core/types';
import { sanitizeSettings } from '../settings/schema';
import type {
  AlertEvent,
  AwayEpisode,
  BreakRecord,
  DailyRecord,
  HourBucket,
  SessionSummary,
  SittingBlock,
  Store,
  TimeTotals,
} from './model';
import { STORE_VERSION, defaultStore, emptyTotals } from './model';
import { emptyDaily } from './daily';

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const nonNeg = (v: unknown): number => Math.max(num(v), 0);

const TOTAL_KEYS = Object.keys(emptyTotals()) as (keyof TimeTotals)[];

function normTotals(s: Json): TimeTotals {
  const out = emptyTotals();
  for (const k of TOTAL_KEYS) out[k] = nonNeg(s[k]);
  return out;
}

function normDevMap(v: unknown): Partial<Record<DeviationId, number>> {
  const out: Partial<Record<DeviationId, number>> = {};
  if (!isObj(v)) return out;
  for (const id of DEVIATION_IDS) if (typeof v[id] === 'number') out[id] = nonNeg(v[id]);
  return out;
}

function normHours(v: unknown): HourBucket[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .filter((h) => Number.isInteger(h.hour) && (h.hour as number) >= 0 && (h.hour as number) <= 23)
    .map((h) => ({
      hour: h.hour as number,
      okMs: nonNeg(h.okMs),
      mildMs: nonNeg(h.mildMs),
      badMs: nonNeg(h.badMs),
      criticalMs: nonNeg(h.criticalMs),
      awayMs: nonNeg(h.awayMs),
    }));
}

/** Rellena los campos que faltan (datos anteriores a la v3) y descarta valores inválidos. */
function normSession(s: Json): SessionSummary {
  const startedAt = num(s.startedAt);
  return {
    ...normTotals(s),
    id: String(s.id ?? `legacy-${startedAt}`),
    startedAt,
    endedAt: num(s.endedAt, startedAt),
    mode: s.mode === 'lateral' || s.mode === 'oblique' ? s.mode : 'frontal',
    utcOffsetMin:
      typeof s.utcOffsetMin === 'number' && Number.isFinite(s.utcOffsetMin) ? s.utcOffsetMin : undefined,
    hours: normHours(s.hours),
    deviationMs: normDevMap(s.deviationMs),
    deviationActiveMs: normDevMap(s.deviationActiveMs),
  };
}

function normAlert(a: Json): AlertEvent {
  return {
    t: num(a.t),
    level: a.level === 'CRITICA' ? 'CRITICA' : 'MALA_POSTURA',
    reason: DEVIATION_IDS.includes(a.reason as DeviationId) ? (a.reason as DeviationId) : null,
    ...(typeof a.recoveredMs === 'number' ? { recoveredMs: nonNeg(a.recoveredMs) } : {}),
    ...(a.ignored === true ? { ignored: true } : {}),
  };
}

function normBreak(b: Json): BreakRecord {
  const outcome = ['completed', 'declared', 'skipped', 'absence'].includes(b.outcome as string)
    ? (b.outcome as BreakRecord['outcome'])
    : 'declared';
  return {
    t: num(b.t),
    kind: b.kind === 'long' ? 'long' : 'micro',
    outcome,
    ...(typeof b.exerciseId === 'string' ? { exerciseId: b.exerciseId } : {}),
    ...(typeof b.awayMs === 'number' ? { awayMs: nonNeg(b.awayMs) } : {}),
  };
}

function normDaily(d: Json): DailyRecord {
  const out = emptyDaily(String(d.dayKey));
  for (const k of Object.keys(out)) {
    if (typeof (out as unknown as Record<string, unknown>)[k] === 'number') {
      (out as unknown as Record<string, number>)[k] = nonNeg(d[k]);
    }
  }
  out.hours = normHours(d.hours);
  out.deviationMs = normDevMap(d.deviationMs);
  out.deviationActiveMs = normDevMap(d.deviationActiveMs);
  out.alertsByReason = normDevMap(d.alertsByReason);
  return out;
}

/**
 * v1 → v2: las duraciones pasan de segundos a milisegundos, se separan niveles de aviso
 * y los descansos pasan de `done:boolean` a un resultado.
 */
function v1ToV2(old: Json): Json {
  const sessions = (Array.isArray(old.sessions) ? old.sessions : []).filter(isObj).map((s) => ({
    id: String(s.id ?? `legacy-${num(s.startedAt)}`),
    startedAt: num(s.startedAt),
    endedAt: num(s.endedAt),
    mode: s.mode === 'lateral' || s.mode === 'oblique' ? s.mode : 'frontal',
    okMs: num(s.goodSec) * 1000,
    mildMs: 0,
    badMs: num(s.badSec) * 1000,
    criticalMs: 0,
    suppressedMs: 0,
    absentMs: num(s.absentSec) * 1000,
    noDataMs: 0,
    deviationMs: {},
  }));
  const alerts = (Array.isArray(old.alerts) ? old.alerts : []).filter(isObj).map((a) => ({
    t: num(a.t),
    level: a.severity === 'critical' ? 'CRITICA' : 'MALA_POSTURA',
    reason: DEVIATION_IDS.includes(a.reason as DeviationId) ? (a.reason as DeviationId) : null,
  }));
  const breaks = (Array.isArray(old.breaks) ? old.breaks : [])
    .filter(isObj)
    .map((b) => ({ t: num(b.t), kind: 'micro', outcome: b.done ? 'declared' : 'skipped' }));
  return { ...old, version: 2, sessions, alerts, breaks };
}

/**
 * v2 → v3: tiempos por causa de no análisis, franjas horarias, ausencias, bloques sentados y resúmenes
 * diarios. Las sesiones antiguas conservan su `suppressedMs` como "causa desconocida" y no tienen franjas.
 */
function v2ToV3(old: Json): Json {
  return { ...old, version: 3 };
}

/** v3 → v4: contadores de parpadeo (los ausentes se normalizan a 0) y ajuste `blink`. */
function v3ToV4(old: Json): Json {
  return { ...old, version: 4 };
}

const MIGRATIONS: Record<number, (old: Json) => Json> = { 1: v1ToV2, 2: v2ToV3, 3: v3ToV4 };

export type MigrationResult =
  | { ok: true; store: Store; from: number; defaultsApplied: string[] }
  | { ok: false; error: 'notAnObject' | 'badVersion' | 'tooNew' | 'invalid'; detail?: string };

/** Migra cualquier versión anterior hasta la actual, validando y saneando el resultado. */
export function migrateStore(raw: unknown): MigrationResult {
  if (!isObj(raw)) return { ok: false, error: 'notAnObject' };
  const from = raw.version;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1)
    return { ok: false, error: 'badVersion' };
  if (from > STORE_VERSION) return { ok: false, error: 'tooNew' };
  let cur: Json = raw;
  for (let v = from; v < STORE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, error: 'badVersion', detail: `sin migración desde v${v}` };
    cur = step(cur);
  }
  const base = defaultStore();
  const { settings, defaultsApplied } = sanitizeSettings(cur.settings);
  const arr = <T>(v: unknown, check: (x: unknown) => x is T): T[] =>
    Array.isArray(v) ? v.filter(check) : [];
  const store: Store = {
    ...base,
    settings,
    profiles: arr(
      cur.profiles,
      (p): p is Store['profiles'][number] => isObj(p) && typeof p.id === 'string' && isObj(p.baseline),
    ),
    sessions: arr(
      cur.sessions,
      (s): s is Json => isObj(s) && typeof s.startedAt === 'number' && typeof s.okMs === 'number',
    ).map(normSession),
    alerts: arr(cur.alerts, (a): a is Json => isObj(a) && typeof a.t === 'number').map(normAlert),
    breaks: arr(cur.breaks, (b): b is Json => isObj(b) && typeof b.t === 'number').map(normBreak),
    away: arr(
      cur.away,
      (a): a is Json =>
        isObj(a) &&
        typeof a.t === 'number' &&
        typeof a.durMs === 'number' &&
        (a.kind === 'absent' || a.kind === 'standing' || a.kind === 'locked'),
    ).map((a): AwayEpisode => ({ t: num(a.t), durMs: nonNeg(a.durMs), kind: a.kind as AwayEpisode['kind'] })),
    blocks: arr(
      cur.blocks,
      (b): b is Json => isObj(b) && typeof b.t === 'number' && typeof b.durMs === 'number',
    ).map((b): SittingBlock => ({ t: num(b.t), durMs: nonNeg(b.durMs) })),
    daily: arr(cur.daily, (d): d is Json => isObj(d) && typeof d.dayKey === 'string').map(normDaily),
  };
  const forbidden = findForbiddenContent(store);
  if (forbidden) return { ok: false, error: 'invalid', detail: forbidden };
  return { ok: true, store, from, defaultsApplied };
}

const FORBIDDEN_KEYS = new Set([
  'image',
  'imagedata',
  'frame',
  'frames',
  'landmarks',
  'rawlandmarks',
  'dataurl',
  'blob',
  'video',
  'snapshot',
  'bitmap',
]);

/** Devuelve la ruta del primer contenido prohibido (imágenes o landmarks crudos), o null. */
export function findForbiddenContent(value: unknown, path = '$', depth = 0): string | null {
  if (depth > 12) return null;
  if (typeof value === 'string') return value.startsWith('data:') ? path : null;
  if (value === null || typeof value !== 'object') return null;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return path;
  const tag = Object.prototype.toString.call(value);
  if (tag === '[object Blob]' || tag === '[object ImageData]' || tag === '[object ImageBitmap]') return path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = findForbiddenContent(value[i], `${path}[${i}]`, depth + 1);
      if (r) return r;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(k.toLowerCase())) return `${path}.${k}`;
    const r = findForbiddenContent(v, `${path}.${k}`, depth + 1);
    if (r) return r;
  }
  return null;
}
