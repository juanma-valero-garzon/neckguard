import { AlertAudio, browserAudioFactory } from '../alerts/audio';
import { inQuietHours, type AlertAction } from '../alerts/policy';
import type { BreakEvent, BreakKind } from '../breaks/timers';
import { CameraManager, type CameraState } from '../camera/camera';
import { PostureEngine, type EngineSnapshot } from '../engine/engine';
import { formatMmSs, makeT } from '../i18n';
import { selectProfile, type CalibrationProfile } from '../posture/calibration';
import { detectPlatform } from '../platform';
import type { Platform, SystemEvent, TrayCommand } from '../platform/platform';
import { CLINICAL_CONFIG } from '../settings/clinical-config';
import { sanitizeSettings, cameraModeKey, type Settings } from '../settings/schema';
import { eraseAll, exportCSV, exportJSON, loadStore, saveStore } from '../stats/storage';
import { defaultStore, type Store } from '../stats/model';
import { sampleLuminance, VisionEngine } from '../vision/landmarker';
import { LM } from '../vision/landmarks';
import {
  KEY_METERS,
  alertMessageKey,
  deviationLabelKey,
  formatMeterValue,
  meterZone,
  meterBar,
  systemClock,
} from './clock';
import { suggestExercise, type Exercise } from '../exercises/library';
import { BREAK_DURATION_MS, useApp, type Screen } from './store';

const set = useApp.setState;
const get = useApp.getState;

const SKELETON_EDGES: [number, number][] = [
  [LM.L_EAR, LM.L_SHOULDER],
  [LM.R_EAR, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_EYE, LM.R_EYE],
  [LM.NOSE, LM.L_EYE],
  [LM.NOSE, LM.R_EYE],
];
const LEVEL_COLOR = {
  OK: '#30d158',
  AVISO_LEVE: '#ffd60a',
  MALA_POSTURA: '#ff9f0a',
  CRITICA: '#ff453a',
} as const;

/** Orquesta cámara, visión, motor de postura, avisos, plataforma y persistencia. */
export class AppRuntime {
  readonly video: HTMLVideoElement;
  readonly overlay: HTMLCanvasElement;
  private readonly host: HTMLDivElement;
  private readonly lumaCanvas = document.createElement('canvas');
  private readonly camera: CameraManager;
  private readonly vision = new VisionEngine();
  private readonly audio = new AlertAudio(browserAudioFactory);
  private platform!: Platform;
  private engine!: PostureEngine;
  private worker: Worker | null = null;
  private toastId = 1;
  private lastTs = 0;
  private lastFrameAt = 0;
  private lastLumaAt = -Infinity;
  private lastFps = 0;
  private lastCameraKey = '';
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private trayTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private detecting = false;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    this.host = document.createElement('div');
    this.host.className = 'camera-host';
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute('aria-hidden', 'true');
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'skeleton';
    this.host.appendChild(this.video);
    document.body.appendChild(this.host);
    this.camera = new CameraManager(this.video);
  }

  // ---------- ciclo de vida ----------
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.platform = detectPlatform();
    const loaded = await loadStore(this.platform.storage);
    set({
      ready: true,
      store: loaded.store,
      settings: loaded.store.settings,
      loadStatus: loaded.status,
      loadError: loaded.error ?? null,
      screen: loaded.store.settings.onboarding.completed ? 'main' : 'onboarding',
    });
    document.documentElement.lang = loaded.store.settings.locale;

    this.engine = new PostureEngine(
      {
        clock: systemClock,
        clinical: CLINICAL_CONFIG,
        idGen: () => crypto.randomUUID(),
        utcOffsetMin: () => -new Date().getTimezoneOffset(),
        events: {
          onAlerts: (a, s) => this.handleAlerts(a, s),
          onBreaks: (e, s) => this.handleBreaks(e, s),
          onSummary: (s) => this.mutateStore((st) => st.sessions.push(s)),
          onBreakRecord: (r) => this.mutateStore((st) => st.breaks.push(r)),
          onAlertRecord: (r) => this.mutateStore((st) => st.alerts.push(r)),
          onAlertUpdate: (u) =>
            this.mutateStore((st) => {
              const a = st.alerts.findLast((x) => x.t === u.t);
              if (a) Object.assign(a, u);
            }),
          onAway: (e) => this.mutateStore((st) => st.away.push(e)),
          onBlock: (b) => this.mutateStore((st) => st.blocks.push(b)),
        },
      },
      loaded.store.settings,
    );

    this.unsubscribers.push(this.camera.subscribe((cam) => this.onCameraState(cam)));
    this.unsubscribers.push(this.platform.onSystemEvent((e) => this.onSystemEvent(e)));
    this.unsubscribers.push(this.platform.onTrayCommand((c) => this.onTrayCommand(c)));
    // La miniatura gestiona el descanso por sí sola: se le envía el estado en cuanto cambia.
    this.unsubscribers.push(
      useApp.subscribe((s, prev) => {
        if (s.breakUi !== prev.breakUi) this.pushTray();
      }),
    );

    const unlock = (): void => {
      void this.unlockAudio().then(() => {
        if (get().audio !== 'running') return;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      });
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const flush = (): void => {
      this.engine.flushStats();
      void this.persistNow();
    };
    window.addEventListener('pagehide', () => {
      this.engine.closeStats();
      void this.persistNow();
    });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

    // 1 s: la miniatura muestra la cuenta atrás en mm:ss.
    this.trayTimer = setInterval(() => this.pushTray(), 1000);
    if (this.platform.capabilities.launchAtLogin) {
      const actual = await this.platform.getLaunchAtLogin();
      if (actual !== get().settings.launchAtLogin)
        this.updateSettings((s) => ({ ...s, launchAtLogin: actual }));
    }
    if (loaded.store.settings.onboarding.completed) await this.startCamera();
  }

  dispose(): void {
    this.unsubscribers.forEach((u) => u());
    this.worker?.terminate();
    if (this.trayTimer) clearInterval(this.trayTimer);
    this.camera.dispose();
    this.vision.close();
    this.host.remove();
  }

  // ---------- cámara y visión ----------
  async startCamera(): Promise<void> {
    const s = get().settings;
    set({ paused: false });
    this.engine.setPaused(false);
    await this.camera.start({ deviceId: s.cameraDeviceId, label: s.cameraLabel });
    void this.ensureVision();
  }

  async selectCamera(deviceId: string, label: string): Promise<void> {
    this.updateSettings((s) => ({ ...s, cameraDeviceId: deviceId, cameraLabel: label }));
    await this.camera.start({ deviceId, label });
  }

  async refreshDevices(): Promise<void> {
    await this.camera.listDevices();
  }

  async requestCameraAccess(): Promise<void> {
    await this.startCamera();
  }

  openCameraSettings(): void {
    void this.platform.openCameraSettings();
  }

  private async ensureVision(): Promise<void> {
    if (get().model === 'ready' || get().model === 'cpu' || get().model === 'loading') return;
    set({ model: 'loading', modelError: null });
    try {
      const s = get().settings;
      await this.vision.init({
        baseUrl: './',
        withFace: s.useFaceLandmarker || s.blink.enabled,
        withBlink: s.blink.enabled,
      });
      set({ model: this.vision.delegate === 'CPU' ? 'cpu' : 'ready' });
      this.startLoop();
    } catch (err) {
      set({ model: 'error', modelError: err instanceof Error ? err.message : String(err) });
      this.startLoop(); // los temporizadores de descanso siguen funcionando sin visión
    }
  }

  async retryVision(): Promise<void> {
    this.vision.close();
    set({ model: 'idle' });
    await this.ensureVision();
  }

  private onCameraState(cam: CameraState): void {
    set({ camera: cam });
    if (cam.status === 'running' && cam.active) {
      const key = cameraModeKey(cam.active);
      if (key !== this.lastCameraKey) {
        this.lastCameraKey = key;
        const saved = get().settings.cameraModes[key];
        // Cada cámara conserva su propio modo (frontal o lateral); la primera vez hereda el actual.
        this.updateSettings((x) => ({
          ...x,
          mode: saved ?? x.mode,
          cameraModes: { ...x.cameraModes, [key]: saved ?? x.mode },
        }));
      }
      const s = get().settings;
      const profile = selectProfile(get().store.profiles, {
        deviceId: cam.active.deviceId,
        label: cam.active.label,
        mode: s.mode,
      });
      this.engine.setProfile(profile);
      set({ profile });
    }
  }

  private startLoop(): void {
    if (this.worker) return;
    this.worker = new Worker(new URL('../breaks/ticker.worker.ts', import.meta.url), { type: 'module' });
    const frameMs = 1000 / get().settings.fps;
    this.lastFps = get().settings.fps;
    this.worker.onmessage = (e: MessageEvent<{ type: 'frame' | 'tick' }>): void => {
      if (e.data.type === 'frame') this.onFrame();
      else this.onTick();
    };
    this.worker.postMessage({ type: 'start', frameMs, tickMs: 1000 });
  }

  private onTick(): void {
    const now = systemClock.nowMs();
    if (now - this.lastFrameAt > 1500) this.publish(this.engine.tick(now));
  }

  private onFrame(): void {
    if (this.detecting) return;
    const v = this.video;
    const model = get().model;
    if (get().paused || v.readyState < 2 || v.videoWidth === 0 || (model !== 'ready' && model !== 'cpu'))
      return;
    this.detecting = true;
    try {
      const now = systemClock.nowMs();
      const ts = Math.max(now, this.lastTs + 1);
      this.lastTs = ts;
      this.lastFrameAt = now;
      const res = this.vision.detect(v, ts);
      let lighting = null;
      if (now - this.lastLumaAt > 2000) {
        this.lastLumaAt = now;
        lighting = sampleLuminance(v, this.lumaCanvas);
      }
      const snap = this.engine.processFrame({
        t: now,
        poses: res.poses,
        aspect: v.videoWidth / v.videoHeight,
        face: res.face,
        blink: res.blink,
        lighting,
      });
      this.publish(snap);
      this.drawSkeleton(snap);
    } catch (err) {
      console.error('frame error', err instanceof Error ? err.message : err);
    } finally {
      this.detecting = false;
    }
  }

  private publish(snap: EngineSnapshot): void {
    set({ snapshot: snap });
    const fps = snap.suggestedFps;
    if (this.worker && fps !== this.lastFps) {
      this.lastFps = fps;
      this.worker.postMessage({ type: 'setFrameMs', frameMs: 1000 / fps });
    }
  }

  private drawSkeleton(snap: EngineSnapshot): void {
    const s = get().settings;
    const c = this.overlay;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (c.width !== this.video.videoWidth) {
      c.width = this.video.videoWidth;
      c.height = this.video.videoHeight;
    }
    ctx.clearRect(0, 0, c.width, c.height);
    if (!s.showPreview || !s.showSkeleton || !snap.skeleton) return;
    const color = LEVEL_COLOR[snap.indicator];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    const pt = (i: number): { x: number; y: number } | null => {
      const l = snap.skeleton?.[i];
      return l ? { x: l.x * c.width, y: l.y * c.height } : null;
    };
    for (const [a, b] of SKELETON_EDGES) {
      const p = pt(a);
      const q = pt(b);
      if (!p || !q) continue;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    for (const i of [LM.NOSE, LM.L_EYE, LM.R_EYE, LM.L_EAR, LM.R_EAR, LM.L_SHOULDER, LM.R_SHOULDER]) {
      const p = pt(i);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- ajustes ----------
  updateSettings(fn: (s: Settings) => Settings): void {
    const prev = get().settings;
    const candidate = fn(structuredClone(prev));
    const active = get().camera.active;
    if (active && candidate.mode !== prev.mode) {
      candidate.cameraModes = { ...candidate.cameraModes, [cameraModeKey(active)]: candidate.mode };
    }
    const next = sanitizeSettings(candidate).settings;
    set({ settings: next });
    document.documentElement.lang = next.locale;
    this.engine.configure(next);
    if (next.mode !== prev.mode) {
      set({ profile: null });
      const cam = get().camera.active;
      if (cam) {
        const profile = selectProfile(get().store.profiles, {
          deviceId: cam.deviceId,
          label: cam.label,
          mode: next.mode,
        });
        this.engine.setProfile(profile);
        set({ profile });
      }
    }
    if (next.useFaceLandmarker !== prev.useFaceLandmarker || next.blink.enabled !== prev.blink.enabled)
      void this.retryVision();
    if (next.launchAtLogin !== prev.launchAtLogin) void this.platform.setLaunchAtLogin(next.launchAtLogin);
    if (next.fps !== prev.fps && this.worker) {
      this.lastFps = next.fps;
      this.worker.postMessage({ type: 'setFrameMs', frameMs: 1000 / next.fps });
    }
    this.mutateStore((st) => {
      st.settings = next;
    });
  }

  completeOnboarding(): void {
    this.updateSettings((s) => ({ ...s, onboarding: { ...s.onboarding, completed: true } }));
    set({ screen: 'calibration' });
  }

  navigate(screen: Screen): void {
    set({ screen });
  }

  // ---------- calibración ----------
  async runCalibration(): Promise<void> {
    const cam = get().camera;
    if (cam.status !== 'running' || !cam.active) return;
    const durationMs = 5000;
    set({
      calibration: {
        state: 'capturing',
        startedAt: systemClock.nowMs(),
        durationMs,
        failure: null,
        detail: null,
      },
    });
    this.engine.startCalibration();
    await new Promise((r) => setTimeout(r, durationMs));
    const { result, profile } = this.engine.finishCalibration({
      deviceId: cam.active.deviceId,
      deviceLabel: cam.active.label,
    });
    if (result.ok && profile) {
      this.upsertProfile(profile);
      set({ profile, calibration: { state: 'done', startedAt: 0, durationMs, failure: null, detail: null } });
      this.engine.clearPersonChanged();
    } else if (!result.ok) {
      set({
        calibration: {
          state: 'failed',
          startedAt: 0,
          durationMs,
          failure: result.reason,
          detail: result.detail ?? null,
        },
      });
    }
  }

  resetCalibrationUi(): void {
    this.engine.cancelCalibration();
    set({ calibration: { state: 'idle', startedAt: 0, durationMs: 5000, failure: null, detail: null } });
  }

  private upsertProfile(profile: CalibrationProfile): void {
    this.mutateStore((st) => {
      st.profiles = [...st.profiles.filter((p) => p.id !== profile.id), profile];
    });
  }

  // ---------- avisos ----------
  async unlockAudio(): Promise<void> {
    const status = await this.audio.unlock();
    set({ audio: status });
  }

  playTestTone(kind: 'MALA_POSTURA' | 'CRITICA' | 'BREAK' | 'POSITIVE' = 'MALA_POSTURA'): boolean {
    const s = get().settings.alerts;
    return this.audio.play(kind, s.toneSet, s.volume);
  }

  async requestNotifications(): Promise<void> {
    const r = await this.platform.requestNotificationPermission();
    set({ notificationAccess: r });
  }

  snoozeAlerts(minutes: number): void {
    this.engine.snoozeAlerts(minutes, systemClock.nowMs());
    this.toast('info', 'toast.snoozed', { count: minutes });
  }

  setDnd(on: boolean): void {
    this.updateSettings((s) => ({ ...s, alerts: { ...s.alerts, dnd: on } }));
  }

  private t(): ReturnType<typeof makeT> {
    return makeT(get().settings.locale);
  }

  private quiet(): boolean {
    const a = get().settings.alerts;
    const d = new Date();
    return (
      a.dnd ||
      inQuietHours(d.getHours() * 60 + d.getMinutes(), {
        enabled: a.quietEnabled,
        startMin: a.quietStartMin,
        endMin: a.quietEndMin,
      })
    );
  }

  private audioWarned = false;

  /** El contexto se reanuda solo si ya hubo interacción; si sigue bloqueado, se avisa una vez. */
  private playAlertSound(
    tone: 'MALA_POSTURA' | 'CRITICA',
    toneSet: Settings['alerts']['toneSet'],
    volume: number,
  ): void {
    if (this.audio.play(tone, toneSet, volume)) return;
    setTimeout(() => {
      const status = this.audio.status;
      set({ audio: status });
      if (status !== 'running' && !this.audioWarned) {
        this.audioWarned = true;
        this.toast('warning', 'toast.audioSuspended');
      }
    }, 500);
  }

  private handleAlerts(actions: AlertAction[], _snap: EngineSnapshot): void {
    const t = this.t();
    const a = get().settings.alerts;
    const hyper = get().settings.hypervigilance;
    for (const act of actions) {
      switch (act.kind) {
        case 'sound':
          if (hyper) this.playAlertSound(act.tone, a.toneSet, a.volume);
          break;
        case 'notification':
          void this.platform.notify({
            title: t('alert.notification.title'),
            body: t(alertMessageKey(act.reason)),
            silent: true,
          });
          break;
        case 'overlay':
          this.platform.showOverlay(4000);
          set({ alertBorder: true });
          setTimeout(() => set({ alertBorder: false }), 4000);
          break;
        case 'positive':
          this.toast('positive', 'toast.positive');
          break;
        case 'audioSuspendedNotice':
          if (hyper) this.toast('warning', 'toast.audioSuspended');
          break;
        case 'suggestSensitivity':
          this.toast('info', 'toast.suggestSensitivity');
          break;
        case 'hydration':
          this.toast('info', 'toast.hydration');
          if (a.notificationsEnabled) {
            void this.platform.notify({
              title: t('alert.notification.title'),
              body: t('toast.hydration'),
              silent: true,
            });
          }
          break;
      }
    }
  }

  private handleBreaks(events: BreakEvent[], _snap: EngineSnapshot): void {
    const t = this.t();
    const a = get().settings.alerts;
    for (const e of events) {
      if (e.type === 'prewarn') {
        this.toast('info', 'toast.breakSoon', { count: Math.max(1, Math.round(e.inMs / 60_000)) });
      } else if (e.type === 'due') {
        if (!this.quiet()) {
          set({ breakUi: { kind: e.kind, startedAt: systemClock.nowMs(), timerStartedAt: null } });
          if (a.soundEnabled) this.audio.play('BREAK', a.toneSet, a.volume);
          if (a.notificationsEnabled) {
            void this.platform.notify({
              title: t(`break.notification.title.${e.kind}`),
              body: t(`break.notification.body.${e.kind}`),
              silent: true,
            });
          }
        }
      } else if (e.type === 'eye') {
        this.toast('info', 'toast.eye');
      } else if (e.type === 'absenceReset') {
        this.toast('positive', 'toast.breakByAbsence');
        set({ breakUi: null });
      }
    }
  }

  finishBreak(kind: BreakKind, how: 'done' | 'skip', exerciseId?: string): void {
    const outcome = this.engine.finishBreak(kind, how, exerciseId);
    set({ breakUi: null });
    this.toast(outcome === 'completed' ? 'positive' : 'info', `toast.break.${outcome}`);
  }

  snoozeBreak(kind: BreakKind): void {
    this.engine.snoozeBreak(kind);
    set({ breakUi: null });
    this.toast('info', 'toast.breakSnoozed', { count: Math.round(get().settings.breaks.snoozeMin) });
  }

  exerciseDone(): void {
    this.engine.exerciseDone();
  }

  openBreak(kind: BreakKind): void {
    set({ breakUi: { kind, startedAt: systemClock.nowMs(), timerStartedAt: null } });
  }

  startBreakTimer(): void {
    const ui = get().breakUi;
    if (ui && ui.timerStartedAt === null) set({ breakUi: { ...ui, timerStartedAt: systemClock.nowMs() } });
  }

  /** Ejercicio sugerido para el descanso abierto (null si no hay descanso o no está permitido). */
  breakExercise(): Exercise | null {
    const ui = get().breakUi;
    if (!ui) return null;
    const { settings, snapshot } = get();
    return suggestExercise(
      ui.kind,
      {
        redFlagsConfirmed: settings.onboarding.redFlagsConfirmed,
        advancedAccepted: settings.onboarding.advancedExercisesAccepted,
        preset: settings.preset,
      },
      snapshot?.reason ?? null,
    );
  }

  closeBreakUi(): void {
    set({ breakUi: null });
  }

  // ---------- pausa / sistema / bandeja ----------
  pause(on: boolean): void {
    set({ paused: on });
    this.engine.setPaused(on);
    if (on) this.camera.stop();
    else void this.startCamera();
  }

  private onSystemEvent(e: SystemEvent): void {
    if (e === 'lock' || e === 'suspend') this.engine.setSystemState('locked');
    else {
      this.engine.setSystemState('active');
      void this.unlockAudio();
    }
  }

  private onTrayCommand(c: TrayCommand): void {
    if (c === 'togglePause') this.pause(!get().paused);
    else if (c === 'snooze15') this.snoozeAlerts(15);
    else if (c === 'recalibrate') set({ screen: 'calibration' });
    else {
      const ui = get().breakUi;
      if (!ui) return;
      if (c === 'breakStart') this.startBreakTimer();
      else if (c === 'breakDone') this.finishBreak(ui.kind, 'done', this.breakExercise()?.id);
      else if (c === 'breakSnooze') this.snoozeBreak(ui.kind);
      else if (c === 'breakSkip') this.finishBreak(ui.kind, 'skip');
    }
  }

  canMiniMode(): boolean {
    return this.platform?.capabilities.miniMode ?? false;
  }

  setMiniMode(on: boolean): void {
    this.platform.setMiniMode(on);
    this.pushTray();
  }

  private pushTray(): void {
    const snap = get().snapshot;
    if (!snap) return;
    const t = this.t();
    const day = get().store.sessions.slice(-12);
    const ok = day.reduce((a, s) => a + s.okMs, 0);
    const all = day.reduce((a, s) => a + s.okMs + s.mildMs + s.badMs + s.criticalMs, 0);
    const ui = get().breakUi;
    const ex = this.breakExercise();
    const breakInfo = ui
      ? {
          kind: ui.kind,
          title: t(`break.title.${ui.kind}`),
          body: t(`break.body.${ui.kind}`),
          exercise: ex ? t(`exercise.${ex.id}.name`) : t('break.noExercise'),
          illustration: ex?.illustration ?? null,
          steps: ex ? Array.from({ length: ex.steps }, (_, i) => t(`exercise.${ex.id}.step.${i + 1}`)) : [],
          countdown: formatMmSs(
            ui.timerStartedAt === null
              ? BREAK_DURATION_MS[ui.kind]
              : Math.max(BREAK_DURATION_MS[ui.kind] - (systemClock.nowMs() - ui.timerStartedAt), 0),
          ),
          started: ui.timerStartedAt !== null,
          snoozeMin: Math.round(get().settings.breaks.snoozeMin),
        }
      : undefined;
    const sittingMin = Math.round(snap.breaks.sittingMs / 60_000);
    const nextBreakMin = Math.round(snap.breaks.remainingMs / 60_000);
    this.platform.updateTray({
      level: snap.indicator,
      suppressed: snap.suppressed,
      paused: get().paused,
      locale: get().settings.locale,
      sittingMin,
      nextBreakMin,
      goodPercent: all > 0 ? Math.round((ok / all) * 100) : null,
      labels: {
        status: t(snap.suppressed ? `suppressed.${snap.suppressed}` : `level.${snap.indicator}`),
        sitting: t('tray.sitting', { count: sittingMin }),
        nextBreak: t('tray.nextBreak', { count: nextBreakMin }),
        good: all > 0 ? t('tray.good', { count: Math.round((ok / all) * 100) }) : '',
      },
      mini: {
        hypervigilance: get().settings.hypervigilance,
        sitting: formatMmSs(snap.breaks.sittingMs),
        sittingLabel: t('dashboard.sitting'),
        meters: KEY_METERS.map((id) => {
          const th = snap.thresholds[id];
          const v = snap.deviations[id] ?? null;
          return {
            label: t(deviationLabelKey(id)),
            text: formatMeterValue(v, th?.unit === 'deg' ? '°' : '%'),
            zone: meterZone(v, th?.amber, th?.red),
            ...meterBar(v, th?.amber, th?.red),
          };
        }),
        remaining: snap.breaks.pending ? '' : formatMmSs(snap.breaks.remainingMs),
        remainingLabel: snap.breaks.pending ? t('dashboard.breakPending') : t('mini.nextBreak'),
        ...(breakInfo ? { breakInfo } : {}),
      },
    });
  }

  // ---------- datos ----------
  toast(kind: 'info' | 'positive' | 'warning', key: string, params?: Record<string, string | number>): void {
    const id = this.toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, key, params }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 7000);
  }

  dismissToast(id: number): void {
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
  }

  private mutateStore(fn: (s: Store) => void): void {
    const st = structuredClone(get().store);
    fn(st);
    set({ store: st });
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persistNow(), 2000);
  }

  private async persistNow(): Promise<void> {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    try {
      await saveStore(this.platform.storage, get().store);
      if (get().persistError) set({ persistError: null });
    } catch (err) {
      set({ persistError: err instanceof Error ? err.message : String(err) });
    }
  }

  exportData(format: 'json' | 'csv'): void {
    this.engine.flushStats();
    const st = get().store;
    const text = format === 'json' ? exportJSON(st) : exportCSV(st);
    const blob = new Blob([text], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neckguard-data.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async eraseAllData(): Promise<void> {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    await eraseAll(this.platform.storage);
    const fresh = defaultStore();
    this.engine.setProfile(null);
    this.engine.configure(fresh.settings);
    set({
      store: fresh,
      settings: fresh.settings,
      profile: null,
      screen: 'onboarding',
      loadStatus: 'fresh',
      loadError: null,
    });
    document.documentElement.lang = fresh.settings.locale;
  }
}

export const runtime = new AppRuntime();
