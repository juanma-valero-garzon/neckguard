// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { CameraErrorKind, CameraInfo } from './errors';
import { backoffMs, classifyCameraError, pickDevice } from './errors';

export type CameraStatus = 'idle' | 'starting' | 'running' | 'reconnecting' | 'error';

export interface CameraState {
  status: CameraStatus;
  error: CameraErrorKind | null;
  devices: CameraInfo[];
  active: CameraInfo | null;
  /** true si la cámara activa no es la guardada (hay que calibrar su perfil). */
  deviceChanged: boolean;
  attempt: number;
}

type Listener = (s: CameraState) => void;

/** Gestiona getUserMedia, listado de dispositivos, reconexión con backoff y cambio en caliente. */
export class CameraManager {
  private stream: MediaStream | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private wanted: { deviceId: string; label: string } = { deviceId: '', label: '' };
  private listeners = new Set<Listener>();
  private disposed = false;
  state: CameraState = {
    status: 'idle',
    error: null,
    devices: [],
    active: null,
    deviceChanged: false,
    attempt: 0,
  };

  constructor(private readonly video: HTMLVideoElement) {
    navigator.mediaDevices?.addEventListener?.('devicechange', this.onDeviceChange);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private set(patch: Partial<CameraState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  async listDevices(): Promise<CameraInfo[]> {
    const all = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
    const devices = all
      .filter((d) => d.kind === 'videoinput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label }));
    this.set({ devices });
    return devices;
  }

  /** Inicia (o cambia en caliente) la cámara. Sin `deviceId` usa la guardada o la predeterminada. */
  async start(saved: { deviceId: string; label: string }): Promise<void> {
    this.wanted = saved;
    this.clearRetry();
    this.stopStream();
    this.set({ status: this.state.attempt > 0 ? 'reconnecting' : 'starting', error: null });
    try {
      let devices = await this.listDevices();
      const pick = pickDevice(devices, saved);
      const constraints: MediaStreamConstraints = {
        video: {
          ...(pick.device?.deviceId ? { deviceId: { exact: pick.device.deviceId } } : {}),
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      track?.addEventListener('ended', this.onEnded);
      this.video.srcObject = stream;
      await this.video.play().catch(() => undefined);
      devices = await this.listDevices(); // tras el permiso aparecen las etiquetas
      const settings = track?.getSettings();
      const active = devices.find((d) => d.deviceId === settings?.deviceId) ?? {
        deviceId: settings?.deviceId ?? '',
        label: track?.label ?? '',
      };
      const changed = !!(saved.deviceId || saved.label) && !pickDevice([active], saved).matched;
      this.set({ status: 'running', error: null, active, deviceChanged: changed, attempt: 0 });
    } catch (err) {
      const kind = classifyCameraError(err);
      this.set({ status: 'error', error: kind });
      if (kind === 'busy' || kind === 'notFound' || kind === 'unknown') this.scheduleRetry();
    }
  }

  stop(): void {
    this.clearRetry();
    this.stopStream();
    this.set({ status: 'idle', error: null, attempt: 0 });
  }

  dispose(): void {
    this.disposed = true;
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
    this.stop();
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((t) => {
      t.removeEventListener('ended', this.onEnded);
      t.stop();
    });
    this.stream = null;
    this.video.srcObject = null;
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private scheduleRetry(): void {
    this.clearRetry();
    const attempt = this.state.attempt + 1;
    this.set({ attempt });
    this.retryTimer = setTimeout(() => void this.start(this.wanted), backoffMs(attempt - 1));
  }

  private onEnded = (): void => {
    this.stopStream();
    this.set({ status: 'reconnecting', error: 'notFound' });
    this.scheduleRetry();
  };

  private onDeviceChange = (): void => {
    void this.listDevices();
    if (this.state.status === 'error' || this.state.status === 'reconnecting') void this.start(this.wanted);
  };
}
