import { describe, expect, it, vi } from 'vitest';
import type { NeckGuardBridge, Platform, SystemEvent, TrayCommand, TraySnapshot } from './platform';
import { createElectronPlatform } from './electron';
import {
  LocalStorageKV,
  createWebPlatform,
  type NotificationLike,
  type StorageLike,
  type WebEnv,
} from './web';

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function webDouble(): {
  p: Platform;
  env: WebEnv & { overlays: number[]; notes: { title: string; body: string }[] };
} {
  const notes: { title: string; body: string }[] = [];
  const overlays: number[] = [];
  const notification: NotificationLike = {
    permission: 'default',
    requestPermission: async () => ((notification.permission = 'granted'), 'granted'),
    create: (title, o) => void notes.push({ title, body: o.body }),
  };
  const env = {
    storage: memStorage(),
    notification,
    openUrl: vi.fn(),
    overlay: (ms: number) => void overlays.push(ms),
    cameraPermission: async () => 'granted' as const,
    overlays,
    notes,
  };
  return { p: createWebPlatform(env), env };
}

function electronDouble(): { p: Platform; calls: string[]; bridge: NeckGuardBridge } {
  const calls: string[] = [];
  const store = new Map<string, string>();
  let login = false;
  const bridge: NeckGuardBridge = {
    storage: {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
      remove: async (k) => void store.delete(k),
    },
    notify: async (o) => (calls.push(`notify:${o.title}`), true),
    getLoginItem: async () => login,
    setLoginItem: async (v) => ((login = v), login),
    updateTray: (s: TraySnapshot) => void calls.push(`tray:${s.level}`),
    onTrayCommand: (cb: (c: TrayCommand) => void) => (cb('togglePause'), () => undefined),
    onSystemEvent: (cb: (e: SystemEvent) => void) => (cb('lock'), () => undefined),
    openCameraSettings: async () => void calls.push('openCameraSettings'),
    requestCameraAccess: async () => 'granted',
    showOverlay: (ms) => void calls.push(`overlay:${ms}`),
    setMiniMode: (on) => void calls.push(`mini:${on}`),
    onTraySnapshot: () => () => undefined,
    sendTrayCommand: () => undefined,
  };
  return { p: createElectronPlatform(bridge), calls, bridge };
}

const snapshot: TraySnapshot = {
  level: 'OK',
  locale: 'es',
  suppressed: null,
  paused: false,
  sittingMin: 5,
  nextBreakMin: 25,
  goodPercent: 90,
  labels: { status: 's', sitting: 'a', nextBreak: 'b', good: 'c' },
};

// Contrato común: las mismas pruebas sobre las dos implementaciones (con dobles).
describe.each([
  ['web', () => webDouble().p],
  ['electron', () => electronDouble().p],
])('contrato Platform (%s)', (_name, make) => {
  it('almacenamiento clave/valor: get/set/remove', async () => {
    const p = make();
    expect(await p.storage.get('k')).toBeNull();
    await p.storage.set('k', 'v');
    expect(await p.storage.get('k')).toBe('v');
    await p.storage.remove('k');
    expect(await p.storage.get('k')).toBeNull();
  });

  it('expone todas las operaciones del contrato y no lanza al usarlas', async () => {
    const p = make();
    expect(typeof p.id).toBe('string');
    expect(() => p.updateTray(snapshot)).not.toThrow();
    expect(() => p.showOverlay(1000)).not.toThrow();
    expect(() => p.setMiniMode(true)).not.toThrow();
    const off1 = p.onTrayCommand(() => undefined);
    const off2 = p.onSystemEvent(() => undefined);
    expect(typeof off1).toBe('function');
    expect(typeof off2).toBe('function');
    expect(typeof (await p.getLaunchAtLogin())).toBe('boolean');
    expect(typeof (await p.setLaunchAtLogin(true))).toBe('boolean');
    await expect(p.openCameraSettings()).resolves.toBeUndefined();
    expect(['granted', 'denied', 'unknown']).toContain(await p.requestCameraAccess());
    expect(['granted', 'denied', 'default', 'unsupported']).toContain(
      await p.requestNotificationPermission(),
    );
    expect(typeof (await p.notify({ title: 't', body: 'b' }))).toBe('boolean');
    expect(Object.keys(p.capabilities).sort()).toEqual([
      'launchAtLogin',
      'miniMode',
      'screenOverlay',
      'systemEvents',
      'tray',
    ]);
  });
});

describe('plataforma web', () => {
  it('notifica solo con permiso concedido', async () => {
    const { p, env } = webDouble();
    expect(await p.notify({ title: 'a', body: 'b' })).toBe(false);
    expect(await p.requestNotificationPermission()).toBe('granted');
    expect(await p.requestNotificationPermission()).toBe('granted');
    expect(await p.notify({ title: 'a', body: 'b' })).toBe(true);
    expect(env.notes).toEqual([{ title: 'a', body: 'b' }]);
  });

  it('sin API de notificaciones ⇒ unsupported; permisos de cámara se traducen', async () => {
    const env: WebEnv = { ...webDouble().env, notification: null, cameraPermission: async () => 'denied' };
    const p = createWebPlatform(env);
    expect(await p.requestNotificationPermission()).toBe('unsupported');
    expect(await p.notify({ title: 'a', body: 'b' })).toBe(false);
    expect(await p.requestCameraAccess()).toBe('denied');
    expect(
      await createWebPlatform({ ...env, cameraPermission: async () => 'prompt' }).requestCameraAccess(),
    ).toBe('unknown');
    const denied: WebEnv = {
      ...env,
      notification: {
        permission: 'denied',
        requestPermission: async () => 'denied',
        create: () => undefined,
      },
    };
    expect(await createWebPlatform(denied).requestNotificationPermission()).toBe('denied');
  });

  it('el overlay delega en el entorno y no hay capacidades nativas', () => {
    const { p, env } = webDouble();
    p.showOverlay(4000);
    expect(env.overlays).toEqual([4000]);
    expect(p.capabilities).toEqual({
      tray: false,
      launchAtLogin: false,
      systemEvents: false,
      screenOverlay: false,
      miniMode: false,
    });
  });

  it('LocalStorageKV delega en Storage', async () => {
    const s = memStorage();
    const kv = new LocalStorageKV(s);
    await kv.set('a', '1');
    expect(s.map.get('a')).toBe('1');
  });
});

describe('plataforma Electron', () => {
  it('delega en el puente expuesto por el preload', async () => {
    const { p, calls } = electronDouble();
    await p.notify({ title: 'T', body: 'B' });
    p.updateTray(snapshot);
    p.showOverlay(2000);
    p.setMiniMode(true);
    await p.openCameraSettings();
    expect(calls).toEqual(['notify:T', 'tray:OK', 'overlay:2000', 'mini:true', 'openCameraSettings']);
    expect(await p.setLaunchAtLogin(true)).toBe(true);
    expect(await p.getLaunchAtLogin()).toBe(true);
    expect(await p.requestNotificationPermission()).toBe('granted');
    expect(p.capabilities).toEqual({
      tray: true,
      launchAtLogin: true,
      systemEvents: true,
      screenOverlay: true,
      miniMode: true,
    });
  });

  it('retransmite comandos de bandeja y eventos del sistema', () => {
    const { p } = electronDouble();
    const cmds: TrayCommand[] = [];
    const evs: SystemEvent[] = [];
    p.onTrayCommand((c) => cmds.push(c));
    p.onSystemEvent((e) => evs.push(e));
    expect(cmds).toEqual(['togglePause']);
    expect(evs).toEqual(['lock']);
  });

  it('traduce los estados del permiso de cámara de macOS', async () => {
    const { bridge } = electronDouble();
    for (const [raw, expected] of [
      ['granted', 'granted'],
      ['denied', 'denied'],
      ['restricted', 'denied'],
      ['not-determined', 'unknown'],
      ['unknown', 'unknown'],
    ] as const) {
      const p = createElectronPlatform({ ...bridge, requestCameraAccess: async () => raw });
      expect(await p.requestCameraAccess()).toBe(expected);
    }
  });
});
