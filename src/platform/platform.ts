import type { PostureLevel } from '../core/types';
import type { IllustrationId } from '../exercises/library';
import type { Locale } from '../settings/schema';
import type { KeyValueStorage } from '../stats/storage';

export interface NotifyOptions {
  title: string;
  body: string;
  silent?: boolean;
}

export interface TraySnapshot {
  level: PostureLevel;
  locale: Locale;
  /** Motivo por el que no se evalúa la postura (null si se evalúa). */
  suppressed: string | null;
  paused: boolean;
  sittingMin: number;
  nextBreakMin: number;
  goodPercent: number | null;
  /** Textos ya localizados que muestra el popover. */
  labels: { status: string; sitting: string; nextBreak: string; good: string };
  /** Datos extra de la ventana miniatura (indicadores clave y tiempo restante). */
  mini?: {
    /** OFF: la miniatura oculta los indicadores y solo muestra el tiempo hasta la pausa. */
    hypervigilance: boolean;
    sitting: string;
    sittingLabel: string;
    meters: {
      label: string;
      text: string;
      zone: 'none' | 'green' | 'amber' | 'red';
      fill: number;
      amberAt: number | null;
      redAt: number | null;
    }[];
    remaining: string;
    remainingLabel: string;
    /** Descanso abierto: la miniatura lo muestra y lo gestiona sin abrir la ventana principal. */
    breakInfo?: {
      kind: 'micro' | 'long';
      title: string;
      body: string;
      exercise: string;
      illustration: IllustrationId | null;
      steps: string[];
      countdown: string;
      started: boolean;
      snoozeMin: number;
    };
  };
}

export type TrayCommand =
  | 'togglePause'
  | 'snooze15'
  | 'recalibrate'
  | 'openWindow'
  | 'breakStart'
  | 'breakDone'
  | 'breakSnooze'
  | 'breakSkip';
export type SystemEvent = 'suspend' | 'resume' | 'lock' | 'unlock';
export type CameraAccess = 'granted' | 'denied' | 'unknown';
export type NotificationAccess = 'granted' | 'denied' | 'default' | 'unsupported';

export interface Platform {
  id: 'web' | 'electron';
  storage: KeyValueStorage;
  notify(o: NotifyOptions): Promise<boolean>;
  requestNotificationPermission(): Promise<NotificationAccess>;
  getLaunchAtLogin(): Promise<boolean>;
  setLaunchAtLogin(v: boolean): Promise<boolean>;
  updateTray(s: TraySnapshot): void;
  onTrayCommand(cb: (c: TrayCommand) => void): () => void;
  onSystemEvent(cb: (e: SystemEvent) => void): () => void;
  openCameraSettings(): Promise<void>;
  requestCameraAccess(): Promise<CameraAccess>;
  /** Borde de pantalla discreto durante `ms` (en Electron cubre todo el monitor; en web, la pestaña). */
  showOverlay(ms: number): void;
  /** Ventana miniatura siempre visible (solo Electron); `false` restaura la ventana principal. */
  setMiniMode(on: boolean): void;
  capabilities: {
    tray: boolean;
    launchAtLogin: boolean;
    systemEvents: boolean;
    screenOverlay: boolean;
    miniMode: boolean;
  };
}

export const DEFAULT_CAPABILITIES = {
  tray: false,
  launchAtLogin: false,
  systemEvents: false,
  screenOverlay: false,
  miniMode: false,
};

/** API mínima que el preload de Electron expone en `window.neckguard`. */
export interface NeckGuardBridge {
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  notify(o: NotifyOptions): Promise<boolean>;
  getLoginItem(): Promise<boolean>;
  setLoginItem(v: boolean): Promise<boolean>;
  updateTray(s: TraySnapshot): void;
  onTrayCommand(cb: (c: TrayCommand) => void): () => void;
  onSystemEvent(cb: (e: SystemEvent) => void): () => void;
  openCameraSettings(): Promise<void>;
  requestCameraAccess(): Promise<'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'>;
  showOverlay(ms: number): void;
  setMiniMode(on: boolean): void;
  /** Solo popover de la barra de menús: recibe instantáneas y envía comandos al proceso principal. */
  onTraySnapshot(cb: (s: TraySnapshot) => void): () => void;
  sendTrayCommand(c: TrayCommand): void;
}

declare global {
  interface Window {
    neckguard?: NeckGuardBridge;
  }
}
