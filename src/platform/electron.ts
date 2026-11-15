import type { NeckGuardBridge, Platform } from './platform';

/** Adaptador de la API expuesta por el preload (`window.neckguard`) al contrato `Platform`. */
export function createElectronPlatform(bridge: NeckGuardBridge): Platform {
  return {
    id: 'electron',
    storage: bridge.storage,
    notify: (o) => bridge.notify(o),
    // Las notificaciones nativas de Electron no requieren permiso del navegador.
    requestNotificationPermission: () => Promise.resolve('granted'),
    getLaunchAtLogin: () => bridge.getLoginItem(),
    setLaunchAtLogin: (v) => bridge.setLoginItem(v),
    updateTray: (s) => bridge.updateTray(s),
    onTrayCommand: (cb) => bridge.onTrayCommand(cb),
    onSystemEvent: (cb) => bridge.onSystemEvent(cb),
    openCameraSettings: () => bridge.openCameraSettings(),
    async requestCameraAccess() {
      const r = await bridge.requestCameraAccess();
      return r === 'granted' ? 'granted' : r === 'denied' || r === 'restricted' ? 'denied' : 'unknown';
    },
    showOverlay: (ms) => bridge.showOverlay(ms),
    setMiniMode: (on) => bridge.setMiniMode(on),
    capabilities: {
      tray: true,
      launchAtLogin: true,
      systemEvents: true,
      screenOverlay: true,
      miniMode: true,
    },
  };
}
