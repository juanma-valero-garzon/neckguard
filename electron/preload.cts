// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

// Preload con sandbox: solo puede usar `electron`. Expone una API mínima y validada por el proceso principal.
// Los canales están duplicados en main.cts (el preload no puede importar módulos locales).
import { contextBridge, ipcRenderer } from 'electron';

type TrayCommand =
  | 'togglePause'
  | 'snooze15'
  | 'recalibrate'
  | 'openWindow'
  | 'breakStart'
  | 'breakDone'
  | 'breakSnooze'
  | 'breakSkip';
type SystemEvent = 'suspend' | 'resume' | 'lock' | 'unlock';

const on = <T,>(channel: string, cb: (v: T) => void): (() => void) => {
  const handler = (_e: unknown, v: T): void => cb(v);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('neckguard', {
  storage: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('storage:get', key),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('storage:set', key, value),
    remove: (key: string): Promise<void> => ipcRenderer.invoke('storage:remove', key),
  },
  notify: (o: { title: string; body: string; silent?: boolean }): Promise<boolean> =>
    ipcRenderer.invoke('notify', o),
  getLoginItem: (): Promise<boolean> => ipcRenderer.invoke('login:get'),
  setLoginItem: (v: boolean): Promise<boolean> => ipcRenderer.invoke('login:set', v),
  updateTray: (s: unknown): void => ipcRenderer.send('tray:update', s),
  onTrayCommand: (cb: (c: TrayCommand) => void) => on<TrayCommand>('tray:command', cb),
  onSystemEvent: (cb: (e: SystemEvent) => void) => on<SystemEvent>('system:event', cb),
  openCameraSettings: (): Promise<void> => ipcRenderer.invoke('camera:settings'),
  requestCameraAccess: (): Promise<string> => ipcRenderer.invoke('camera:access'),
  showOverlay: (ms: number): void => ipcRenderer.send('overlay:show', ms),
  setMiniMode: (on: boolean): void => ipcRenderer.send('mini:set', on),
  onTraySnapshot: (cb: (s: unknown) => void) => on('tray:snapshot', cb),
  sendTrayCommand: (c: TrayCommand): void => ipcRenderer.send('tray:send-command', c),
});
