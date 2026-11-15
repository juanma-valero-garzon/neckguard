// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

// Validación de todo lo que cruza el IPC (sin dependencias de Electron: probable con Vitest).

export const APP_HOST = 'neckguard';
export const APP_ORIGIN = `app://${APP_HOST}`;

const LEVELS = ['OK', 'AVISO_LEVE', 'MALA_POSTURA', 'CRITICA'] as const;
export type Level = (typeof LEVELS)[number];
export const TRAY_COMMANDS = [
  'togglePause',
  'snooze15',
  'recalibrate',
  'openWindow',
  'breakStart',
  'breakDone',
  'breakSnooze',
  'breakSkip',
] as const;
export type TrayCommand = (typeof TRAY_COMMANDS)[number];

const ZONES = ['none', 'green', 'amber', 'red'] as const;
const ILLUSTRATIONS = ['chinTuck', 'chinTuckExt', 'neckExt', 'thoracic', 'shoulders', 'lumbarRoll'] as const;

/** Datos extra que solo usa la ventana miniatura. */
export interface MiniData {
  hypervigilance: boolean;
  sitting: string;
  sittingLabel: string;
  meters: {
    label: string;
    text: string;
    zone: (typeof ZONES)[number];
    fill: number;
    amberAt: number | null;
    redAt: number | null;
  }[];
  remaining: string;
  remainingLabel: string;
  breakInfo?: {
    kind: 'micro' | 'long';
    title: string;
    body: string;
    exercise: string;
    illustration: string | null;
    steps: string[];
    countdown: string;
    started: boolean;
    snoozeMin: number;
  };
}

export interface TraySnapshot {
  level: Level;
  locale: 'es' | 'en';
  suppressed: string | null;
  paused: boolean;
  sittingMin: number;
  nextBreakMin: number;
  goodPercent: number | null;
  labels: { status: string; sitting: string; nextBreak: string; good: string };
  mini?: MiniData;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const MAX_VALUE_BYTES = 5 * 1024 * 1024;

export function validStorageKey(k: unknown): k is string {
  return typeof k === 'string' && /^neckguard\.[a-z0-9.]{1,40}$/.test(k);
}

export function validStorageValue(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_VALUE_BYTES;
}

export function validNotify(o: unknown): o is { title: string; body: string; silent?: boolean } {
  return (
    isObj(o) &&
    str(o.title, 120) &&
    str(o.body, 300) &&
    (o.silent === undefined || typeof o.silent === 'boolean')
  );
}

export function validTrayCommand(c: unknown): c is TrayCommand {
  return typeof c === 'string' && (TRAY_COMMANDS as readonly string[]).includes(c);
}

function validMini(m: unknown): m is MiniData {
  return (
    isObj(m) &&
    typeof m.hypervigilance === 'boolean' &&
    str(m.sitting, 20) &&
    str(m.sittingLabel, 100) &&
    Array.isArray(m.meters) &&
    m.meters.length <= 6 &&
    m.meters.every(
      (x) =>
        isObj(x) &&
        str(x.label, 60) &&
        str(x.text, 30) &&
        (ZONES as readonly unknown[]).includes(x.zone) &&
        num(x.fill) &&
        (x.amberAt === null || num(x.amberAt)) &&
        (x.redAt === null || num(x.redAt)),
    ) &&
    str(m.remaining, 20) &&
    str(m.remainingLabel, 100) &&
    (m.breakInfo === undefined || validBreakInfo(m.breakInfo))
  );
}

function validBreakInfo(b: unknown): boolean {
  return (
    isObj(b) &&
    (b.kind === 'micro' || b.kind === 'long') &&
    str(b.title, 100) &&
    str(b.body, 300) &&
    str(b.exercise, 200) &&
    (b.illustration === null || (ILLUSTRATIONS as readonly unknown[]).includes(b.illustration)) &&
    Array.isArray(b.steps) &&
    b.steps.length <= 8 &&
    b.steps.every((x) => str(x, 400)) &&
    str(b.countdown, 20) &&
    typeof b.started === 'boolean' &&
    num(b.snoozeMin)
  );
}

export function validTraySnapshot(s: unknown): s is TraySnapshot {
  if (!isObj(s) || !isObj(s.labels)) return false;
  const l = s.labels;
  return (
    (s.mini === undefined || validMini(s.mini)) &&
    (LEVELS as readonly unknown[]).includes(s.level) &&
    (s.locale === 'es' || s.locale === 'en') &&
    (s.suppressed === null || str(s.suppressed, 40)) &&
    typeof s.paused === 'boolean' &&
    num(s.sittingMin) &&
    num(s.nextBreakMin) &&
    (s.goodPercent === null || num(s.goodPercent)) &&
    str(l.status, 200) &&
    str(l.sitting, 200) &&
    str(l.nextBreak, 200) &&
    str(l.good, 200)
  );
}

export const clampOverlayMs = (ms: unknown): number =>
  num(ms) ? Math.min(Math.max(Math.round(ms), 500), 8000) : 3000;

/** Solo se confía en el origen propio (protocolo app://) como emisor de mensajes IPC. */
export function isTrustedUrl(url: unknown): boolean {
  return typeof url === 'string' && (url === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`));
}

export type TrayIcon = 'ok' | 'warn' | 'bad' | 'off';
export function trayIconFor(s: Pick<TraySnapshot, 'level' | 'suppressed' | 'paused' | 'mini'>): TrayIcon {
  // Hipervigilancia OFF: sin semáforo de postura, icono siempre gris.
  if (s.paused || s.suppressed !== null || s.mini?.hypervigilance === false) return 'off';
  return s.level === 'OK' ? 'ok' : s.level === 'AVISO_LEVE' ? 'warn' : 'bad';
}

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self' mediastream: blob:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Resuelve una ruta de petición dentro de `root`; null si intenta salir de él. */
export function resolveInside(
  root: string,
  pathname: string,
  join: (...p: string[]) => string,
  sep: string,
): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.includes('\0') || rel.split('/').includes('..')) return null;
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = join(root, rel);
  return full.startsWith(root + sep) ? full : null;
}
