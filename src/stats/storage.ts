import { pruneStore } from './daily';
import { findForbiddenContent, migrateStore } from './migrations';
import type { Store } from './model';
import { STORE_VERSION, defaultStore } from './model';

/** Almacén clave/valor de texto. Las implementaciones deben escribir de forma atómica (tmp + rename). */
export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const DATA_KEY = 'neckguard.data';
export const BACKUP_KEY = 'neckguard.data.bak';

export type LoadStatus = 'fresh' | 'ok' | 'migrated' | 'restoredFromBackup' | 'reset';

export interface LoadResult {
  store: Store;
  status: LoadStatus;
  /** Presente cuando hubo corrupción o versión incompatible: la UI debe mostrarlo, nunca fallar en silencio. */
  error?: string;
  defaultsApplied: string[];
}

function tryParse(text: string | null): ReturnType<typeof migrateStore> | null {
  if (text === null) return null;
  try {
    return migrateStore(JSON.parse(text) as unknown);
  } catch {
    return { ok: false, error: 'invalid', detail: 'JSON ilegible' };
  }
}

export async function loadStore(kv: KeyValueStorage): Promise<LoadResult> {
  const main = tryParse(await kv.get(DATA_KEY));
  if (main === null) return { store: defaultStore(), status: 'fresh', defaultsApplied: [] };
  if (main.ok) {
    return {
      store: main.store,
      status: main.from < STORE_VERSION ? 'migrated' : 'ok',
      defaultsApplied: main.defaultsApplied,
    };
  }
  const backup = tryParse(await kv.get(BACKUP_KEY));
  const reason = `${main.error}${main.detail ? `: ${main.detail}` : ''}`;
  if (backup?.ok) {
    await kv.set(DATA_KEY, JSON.stringify(backup.store));
    return {
      store: backup.store,
      status: 'restoredFromBackup',
      error: reason,
      defaultsApplied: backup.defaultsApplied,
    };
  }
  return { store: defaultStore(), status: 'reset', error: reason, defaultsApplied: [] };
}

export async function saveStore(kv: KeyValueStorage, store: Store): Promise<void> {
  const text = JSON.stringify(pruneStore(store));
  if (findForbiddenContent(store)) throw new Error('El esquema no admite imágenes ni landmarks');
  const current = await kv.get(DATA_KEY);
  if (current !== null && tryParse(current)?.ok) await kv.set(BACKUP_KEY, current);
  await kv.set(DATA_KEY, text);
}

export async function eraseAll(kv: KeyValueStorage): Promise<void> {
  await kv.remove(DATA_KEY);
  await kv.remove(BACKUP_KEY);
}

export const exportJSON = (store: Store): string => JSON.stringify(store, null, 2);

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(',');

export function exportCSV(store: Store): string {
  const iso = (t: number): string => new Date(t).toISOString();
  const lines: string[] = ['# sessions'];
  lines.push(
    csvRow([
      'id',
      'startedAt',
      'endedAt',
      'mode',
      'okMs',
      'mildMs',
      'badMs',
      'criticalMs',
      'suppressedMs',
      'absentMs',
      'noDataMs',
      'standingMs',
      'lockedMs',
      'pausedMs',
      'lightMs',
      'notCalibratedMs',
      'blinkMs',
      'blinkCount',
      'lowBlinkMs',
    ]),
  );
  for (const s of store.sessions) {
    lines.push(
      csvRow([
        s.id,
        iso(s.startedAt),
        iso(s.endedAt),
        s.mode,
        s.okMs,
        s.mildMs,
        s.badMs,
        s.criticalMs,
        s.suppressedMs,
        s.absentMs,
        s.noDataMs,
        s.standingMs,
        s.lockedMs,
        s.pausedMs,
        s.lightMs,
        s.notCalibratedMs,
        s.blinkMs,
        s.blinkCount,
        s.lowBlinkMs,
      ]),
    );
  }
  lines.push('', '# alerts', csvRow(['t', 'level', 'reason', 'recoveredMs', 'ignored']));
  for (const a of store.alerts) lines.push(csvRow([iso(a.t), a.level, a.reason, a.recoveredMs, a.ignored]));
  lines.push('', '# breaks', csvRow(['t', 'kind', 'outcome', 'exerciseId', 'awayMs']));
  for (const b of store.breaks) lines.push(csvRow([iso(b.t), b.kind, b.outcome, b.exerciseId, b.awayMs]));
  lines.push('', '# away', csvRow(['t', 'kind', 'durMs']));
  for (const a of store.away) lines.push(csvRow([iso(a.t), a.kind, a.durMs]));
  lines.push('', '# sittingBlocks', csvRow(['t', 'durMs']));
  for (const b of store.blocks) lines.push(csvRow([iso(b.t), b.durMs]));
  lines.push(
    '',
    '# daily',
    csvRow([
      'dayKey',
      'okMs',
      'mildMs',
      'badMs',
      'criticalMs',
      'absentMs',
      'standingMs',
      'lockedMs',
      'alerts',
      'awayCount',
      'blinkMs',
      'blinkCount',
      'lowBlinkMs',
    ]),
  );
  for (const d of store.daily) {
    lines.push(
      csvRow([
        d.dayKey,
        d.okMs,
        d.mildMs,
        d.badMs,
        d.criticalMs,
        d.absentMs,
        d.standingMs,
        d.lockedMs,
        d.alerts,
        d.awayCount,
        d.blinkMs,
        d.blinkCount,
        d.lowBlinkMs,
      ]),
    );
  }
  lines.push('', '# hours', csvRow(['sessionId', 'hour', 'okMs', 'mildMs', 'badMs', 'criticalMs', 'awayMs']));
  for (const s of store.sessions) {
    for (const h of s.hours) {
      lines.push(csvRow([s.id, h.hour, h.okMs, h.mildMs, h.badMs, h.criticalMs, h.awayMs]));
    }
  }
  return lines.join('\n') + '\n';
}
