// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { KeyValueStorage } from '../stats/storage';
import type { NotificationAccess, Platform } from './platform';
import { DEFAULT_CAPABILITIES } from './platform';

/** Subconjunto de Storage usado (permite dobles en tests). */
export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface NotificationLike {
  permission: NotificationAccess | string;
  requestPermission(): Promise<string>;
  create(title: string, opts: { body: string; silent?: boolean }): void;
}

export interface WebEnv {
  storage: StorageLike;
  notification: NotificationLike | null;
  openUrl(url: string): void;
  overlay(ms: number): void;
  cameraPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'>;
}

export class LocalStorageKV implements KeyValueStorage {
  constructor(private readonly s: StorageLike) {}
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.s.getItem(key));
  }
  set(key: string, value: string): Promise<void> {
    this.s.setItem(key, value);
    return Promise.resolve();
  }
  remove(key: string): Promise<void> {
    this.s.removeItem(key);
    return Promise.resolve();
  }
}

const asAccess = (p: string): NotificationAccess =>
  p === 'granted' || p === 'denied' || p === 'default' ? p : 'unsupported';

export function createWebPlatform(env: WebEnv): Platform {
  return {
    id: 'web',
    storage: new LocalStorageKV(env.storage),
    async notify(o) {
      const n = env.notification;
      if (!n || n.permission !== 'granted') return false;
      n.create(o.title, { body: o.body, silent: o.silent });
      return true;
    },
    async requestNotificationPermission() {
      const n = env.notification;
      if (!n) return 'unsupported';
      if (n.permission !== 'default') return asAccess(n.permission);
      return asAccess(await n.requestPermission());
    },
    getLaunchAtLogin: () => Promise.resolve(false),
    setLaunchAtLogin: () => Promise.resolve(false),
    updateTray: () => undefined,
    onTrayCommand: () => () => undefined,
    onSystemEvent: () => () => undefined,
    openCameraSettings: () => Promise.resolve(),
    async requestCameraAccess() {
      const p = await env.cameraPermission();
      return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'unknown';
    },
    showOverlay: (ms) => env.overlay(ms),
    setMiniMode: () => undefined,
    capabilities: { ...DEFAULT_CAPABILITIES },
  };
}

/** Entorno real del navegador. */
export function browserEnv(): WebEnv {
  const N = (globalThis as { Notification?: typeof Notification }).Notification;
  return {
    storage: globalThis.localStorage,
    notification: N
      ? {
          get permission() {
            return N.permission;
          },
          requestPermission: () => N.requestPermission(),
          create: (title, opts) => void new N(title, opts),
        }
      : null,
    openUrl: (url) => void window.open(url, '_blank', 'noopener'),
    overlay: (ms) => {
      document.body.dataset.overlay = 'on';
      window.setTimeout(() => delete document.body.dataset.overlay, ms);
    },
    cameraPermission: async () => {
      try {
        const r = await navigator.permissions.query({ name: 'camera' as PermissionName });
        return r.state;
      } catch {
        return 'unknown';
      }
    },
  };
}
