import type { AlertAction, AlertState } from '../alerts/policy';
import { initialAlertState, snooze as snoozeAlertState, stepAlerts } from '../alerts/policy';
import type { BlinkAlertState } from '../alerts/blinkPolicy';
import { initialBlinkAlertState, stepBlinkAlert } from '../alerts/blinkPolicy';
import type { BreakEvent, BreakKind, BreakOutcome, BreakPresence, BreakState } from '../breaks/timers';
import {
  finishBreak,
  initialBreakState,
  markExerciseDone,
  nextBreak,
  pendingBreak,
  snoozeBreak,
  stepBreaks,
} from '../breaks/timers';
import type { CaptureMode, Clock, DeviationId, Landmark, PostureLevel, PresenceStatus } from '../core/types';
import { DEVIATION_IDS } from '../core/types';
import type { CalibrationProfile, CalibrationResult } from '../posture/calibration';
import {
  CalibrationSession,
  makeProfile,
  shouldSuggestRecalibration,
  type DriftWindow,
} from '../posture/calibration';
import type { EffectiveThresholds, ZoneReadings } from '../posture/classifier';
import { classify, effectiveThresholds, informativeCva } from '../posture/classifier';
import type { DeviationValues } from '../posture/deviations';
import { computeDeviations, emptyDeviations } from '../posture/deviations';
import type { RawMetrics } from '../posture/metrics';
import { DEFAULT_METRICS_CONFIG, computeRawMetrics } from '../posture/metrics';
import type { MachineState } from '../posture/stateMachine';
import { initialMachineState, stepMachine } from '../posture/stateMachine';
import type { ClinicalConfig } from '../settings/clinical-config';
import { resolvePreset, type ResolvedPreset } from '../settings/presets';
import type { Settings } from '../settings/schema';
import type {
  ActivityState,
  AlertEvent,
  AwayEpisode,
  BreakRecord,
  SessionSummary,
  SittingBlock,
} from '../stats/model';
import { SessionRecorder, activityOf, dayKeyOf } from '../stats/aggregate';
import { BlinkDetector } from '../vision/blink';
import { LandmarkSmoother } from '../vision/filters';
import { LM } from '../vision/landmarks';
import type { LightingState, PresenceState, PrimaryTrackerState } from '../vision/presence';
import {
  assessLighting,
  initialPresence,
  isStanding,
  poseSignature,
  selectPrimaryPerson,
  stepPresence,
  trackPrimary,
} from '../vision/presence';

export interface FrameInput {
  t: number; // monotónico (ms)
  poses: readonly (readonly Landmark[])[];
  aspect: number;
  face?: { pitchDeg: number; yawDeg: number } | null;
  /** Cierre ocular medio (0-1); null/omitido si no se midió. */
  blink?: number | null;
  /** Luminancia muestreada (0-255); puede omitirse en la mayoría de fotogramas. */
  lighting?: { meanLuma: number; centerLuma: number; edgeLuma: number } | null;
}

export type SuppressedReason =
  | 'notCalibrated'
  | 'paused'
  | 'locked'
  | 'noData'
  | 'absent'
  | 'lowLight'
  | 'backlit'
  | 'lowConfidence'
  | 'standing';

export interface EngineSnapshot {
  t: number;
  presence: PresenceStatus;
  level: PostureLevel;
  indicator: PostureLevel;
  reason: DeviationId | null;
  levels: Record<DeviationId, PostureLevel>;
  deviations: DeviationValues;
  zones: ZoneReadings;
  thresholds: EffectiveThresholds;
  raw: RawMetrics | null;
  cvaInfo: ReturnType<typeof informativeCva>;
  suppressed: SuppressedReason | null;
  lighting: LightingState;
  breaks: {
    nextKind: BreakKind;
    remainingMs: number;
    sittingMs: number;
    pending: BreakKind | null;
  };
  calibration: { active: boolean; count: number };
  suggestRecalibration: boolean;
  personChanged: boolean;
  suggestedFps: number;
  /** Parpadeos/min recientes; null si la medida está desactivada o no hay datos suficientes. */
  blink: { enabled: boolean; ratePerMin: number | null };
  /** Landmarks suavizados de la persona principal (solo memoria; para el esqueleto superpuesto). */
  skeleton: (Landmark | null)[] | null;
}

export interface EngineEvents {
  onAlerts?(actions: AlertAction[], snapshot: EngineSnapshot): void;
  onBreaks?(events: BreakEvent[], snapshot: EngineSnapshot): void;
  onSummary?(summary: SessionSummary): void;
  onBreakRecord?(record: BreakRecord): void;
  onAlertRecord?(record: { t: number; level: 'MALA_POSTURA' | 'CRITICA'; reason: DeviationId | null }): void;
  /** Completa un aviso ya registrado (`t` es su marca de tiempo) con su resultado. */
  onAlertUpdate?(update: Pick<AlertEvent, 't' | 'recoveredMs' | 'ignored'>): void;
  onAway?(episode: AwayEpisode): void;
  onBlock?(block: SittingBlock): void;
}

export interface EngineDeps {
  clock: Clock;
  clinical: ClinicalConfig;
  idGen: () => string;
  utcOffsetMin: () => number;
  events?: EngineEvents;
}

const STALE_MS = 4000;
const FLUSH_MS = 5 * 60_000;
const DRIFT_WINDOW_MS = 60_000;
/** Un aviso sin corregir la postura en este tiempo se marca como ignorado. */
const ALERT_IGNORED_MS = 10 * 60_000;
export const CALIBRATION_TARGET_FRAMES = 40;
/** Por debajo de este ritmo un parpadeo (100-400 ms) puede pasar entre dos fotogramas. */
export const BLINK_MIN_FPS = 15;

const vis = (lms: readonly Landmark[], i: number): number => lms[i]?.visibility ?? 0;

/** Visibilidad media de los landmarks relevantes para el modo (en lateral y ladeado solo cuenta el lado visible). */
function meanVisibility(lms: readonly Landmark[], mode: CaptureMode): number {
  const vals =
    mode === 'frontal'
      ? [LM.NOSE, LM.L_EYE, LM.R_EYE, LM.L_SHOULDER, LM.R_SHOULDER].map((i) => vis(lms, i))
      : [
          vis(lms, LM.NOSE),
          Math.max(vis(lms, LM.L_EAR), vis(lms, LM.R_EAR)),
          Math.max(vis(lms, LM.L_SHOULDER), vis(lms, LM.R_SHOULDER)),
        ];
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export class PostureEngine {
  private settings!: Settings;
  private preset!: ResolvedPreset;
  private profile: CalibrationProfile | null = null;
  private thresholds: EffectiveThresholds = {};

  private smoother = new LandmarkSmoother();
  private presence: PresenceState = initialPresence();
  private tracker: PrimaryTrackerState = { last: null };
  private machine: MachineState = initialMachineState();
  private alertState: AlertState = initialAlertState();
  private blink = new BlinkDetector();
  private blinkAlert: BlinkAlertState = initialBlinkAlertState();
  private blinkRate: number | null = null;
  private breakState: BreakState = initialBreakState();
  private calibration: CalibrationSession | null = null;
  private bothSidesFrames = 0;
  private recorder: SessionRecorder;

  private lastT: number | null = null;
  private lastFrameT: number | null = null;
  private lastRaw: RawMetrics | null = null;
  private lastSkeleton: (Landmark | null)[] | null = null;
  private lastDeviations: DeviationValues = emptyDeviations();
  private lastZones: ZoneReadings = {};
  private lastStanding = false;
  private lighting: LightingState = 'ok';
  private lastMeanVis = 0;
  private lastFlush: number;
  private okSince: number | null = null;
  private driftWindows: DriftWindow[] = [];
  private driftStart: number | null = null;
  private driftMin = Infinity;
  private personChanged = false;
  private system: 'active' | 'locked' = 'active';
  private paused = false;
  private audio: 'running' | 'suspended' | 'unavailable' = 'running';
  private lastLevel: PostureLevel = 'OK';
  private lastReason: DeviationId | null = null;
  private lastSuppressed: SuppressedReason | null = null;
  private pendingAlert: { wall: number; t: number } | null = null;

  constructor(
    private readonly deps: EngineDeps,
    settings: Settings,
  ) {
    this.settings = settings;
    this.recorder = new SessionRecorder(deps.idGen, () => this.settings.mode, deps.clock.wallMs(), {
      utcOffsetMin: deps.utcOffsetMin,
      sink: {
        session: (s) => deps.events?.onSummary?.(s),
        away: (e) => deps.events?.onAway?.(e),
        block: (b) => deps.events?.onBlock?.(b),
      },
      blockBreakMs: () => this.preset.breaks.resetAfterAbsentMs,
    });
    this.lastFlush = deps.clock.nowMs();
    this.configure(settings);
  }

  /** Aplica ajustes (y recalcula umbrales). No reinicia contadores. */
  configure(settings: Settings): void {
    const modeChanged = this.settings.mode !== settings.mode;
    this.settings = settings;
    this.preset = resolvePreset(settings);
    if (modeChanged) {
      this.profile = null;
      this.resetPosture();
    }
    this.recomputeThresholds();
    if (!this.blinkOn()) this.resetBlink();
  }

  private blinkOn(): boolean {
    return this.settings.blink.enabled && this.settings.mode !== 'lateral';
  }

  private resetBlink(): void {
    this.blink.reset();
    this.blinkAlert = initialBlinkAlertState();
    this.blinkRate = null;
  }

  setProfile(profile: CalibrationProfile | null): void {
    this.profile = profile && profile.mode === this.settings.mode ? profile : null;
    this.resetPosture();
    this.recomputeThresholds();
  }

  private recomputeThresholds(): void {
    this.thresholds = this.profile
      ? effectiveThresholds(
          this.settings.mode,
          this.deps.clinical,
          this.profile.deviationSigma,
          this.preset.sensitivityScale,
        )
      : {};
  }

  private resetPosture(): void {
    this.machine = initialMachineState();
    this.smoother.reset();
    this.lastDeviations = emptyDeviations();
    this.lastZones = {};
    this.driftWindows = [];
    this.driftStart = null;
    this.driftMin = Infinity;
    this.personChanged = false;
  }

  // ---- calibración ----
  startCalibration(): void {
    this.calibration = new CalibrationSession(this.settings.mode, this.deps.clinical);
    this.bothSidesFrames = 0;
    this.smoother.reset();
  }

  cancelCalibration(): void {
    this.calibration = null;
  }

  finishCalibration(meta: { deviceId: string; deviceLabel: string }): {
    result: CalibrationResult;
    profile: CalibrationProfile | null;
  } {
    const session = this.calibration;
    this.calibration = null;
    if (!session) return { result: { ok: false, reason: 'tooFewSamples' }, profile: null };
    if (this.settings.mode === 'lateral' && session.count > 0 && this.bothSidesFrames / session.count > 0.5) {
      return { result: { ok: false, reason: 'badPlacement' }, profile: null };
    }
    const result = session.finish();
    if (!result.ok) return { result, profile: null };
    const profile = makeProfile(result, {
      ...meta,
      mode: this.settings.mode,
      side: this.lastRaw?.side ?? this.settings.preferredSide,
      createdAt: this.deps.clock.wallMs(),
    });
    this.setProfile(profile);
    return { result, profile };
  }

  // ---- entradas externas ----
  setSystemState(state: 'active' | 'locked'): void {
    this.system = state;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setAudioStatus(status: 'running' | 'suspended' | 'unavailable'): void {
    this.audio = status;
  }

  snoozeAlerts(minutes: number, t: number): void {
    this.alertState = snoozeAlertState(this.alertState, t, minutes);
  }

  // ---- descansos ----
  finishBreak(kind: BreakKind, how: 'done' | 'skip', exerciseId?: string): BreakOutcome {
    const awayMs = this.breakState.awaySinceDue;
    const guided = this.breakState.exerciseDone;
    const { state, outcome } = finishBreak(this.breakState, kind, how, this.preset.breaks);
    this.breakState = state;
    this.deps.events?.onBreakRecord?.({
      t: this.deps.clock.wallMs(),
      kind,
      outcome,
      ...(how === 'done' && guided && exerciseId ? { exerciseId } : {}),
      ...(awayMs > 0 ? { awayMs } : {}),
    });
    return outcome;
  }

  snoozeBreak(kind: BreakKind): void {
    this.breakState = snoozeBreak(this.breakState, kind, this.preset.breaks);
  }

  exerciseDone(): void {
    this.breakState = markExerciseDone(this.breakState);
  }

  // ---- bucle principal ----
  processFrame(frame: FrameInput): EngineSnapshot {
    this.lastFrameT = frame.t;
    return this.advance(frame.t, frame);
  }

  /** Avance periódico (temporizador del Worker) cuando no hay fotograma nuevo. */
  tick(t: number): EngineSnapshot {
    return this.advance(t, null);
  }

  flushStats(): void {
    const s = this.recorder.flush(this.deps.clock.wallMs());
    if (s) this.deps.events?.onSummary?.(s);
    this.lastFlush = this.deps.clock.nowMs();
  }

  /** Al salir: vuelca el intervalo y cierra las ausencias y bloques sentados en curso. */
  closeStats(): void {
    this.flushStats();
    this.recorder.closeOpen();
  }

  private advance(t: number, frame: FrameInput | null): EngineSnapshot {
    const dt = this.lastT === null ? 0 : Math.max(t - this.lastT, 0);
    if (this.lastT !== null && t < this.lastT) return this.snapshot(t);
    this.lastT = t;
    const events = this.deps.events;

    // 1) Visión
    let hasPerson = false;
    let raw: RawMetrics | null = null;
    if (frame) {
      const idx = selectPrimaryPerson(frame.poses, frame.aspect);
      hasPerson = idx >= 0;
      if (hasPerson) {
        const pose = frame.poses[idx] as readonly Landmark[];
        const tr = trackPrimary(this.tracker, poseSignature(pose, frame.aspect), t);
        this.tracker = tr.state;
        if (tr.jump && this.profile) this.personChanged = true;
        this.lastMeanVis = meanVisibility(pose, this.settings.mode);
        const smoothed = this.smoother.process(pose, t);
        this.lastSkeleton = smoothed;
        raw = computeRawMetrics(
          {
            landmarks: smoothed,
            aspect: frame.aspect,
            mode: this.settings.mode,
            preferredSide: this.settings.preferredSide ?? this.profile?.side ?? null,
            facePitchDeg: this.settings.useFaceLandmarker ? frame.face?.pitchDeg : null,
            faceYawDeg: this.settings.useFaceLandmarker ? frame.face?.yawDeg : null,
          },
          DEFAULT_METRICS_CONFIG,
        );
        this.lastRaw = raw;
      } else {
        this.lastSkeleton = null;
        this.lastRaw = null;
        this.lastMeanVis = 0;
        this.smoother.reset();
      }
      if (frame.lighting) {
        this.lighting = assessLighting({ ...frame.lighting, meanVisibility: this.lastMeanVis });
      }
    }

    const cameraOk = this.lastFrameT !== null && t - this.lastFrameT <= STALE_MS && !this.paused;
    const hadPerson = frame ? hasPerson : this.presence.status === 'present';
    this.presence = stepPresence(this.presence, { t, cameraOk, hasPerson: hadPerson });
    const presence = this.presence.status;
    if (presence === 'absent' || presence === 'nodata') {
      if (!frame) this.lastSkeleton = null;
      this.machine = initialMachineState();
    }

    // 2) Calibración en curso
    if (this.calibration && frame) {
      this.calibration.add({ raw: hasPerson ? raw : null, meanVisibility: this.lastMeanVis });
      const pose = hasPerson ? (frame.poses[selectPrimaryPerson(frame.poses, frame.aspect)] ?? null) : null;
      if (
        pose &&
        vis(pose, LM.L_EAR) > 0.7 &&
        vis(pose, LM.R_EAR) > 0.7 &&
        vis(pose, LM.L_SHOULDER) > 0.7 &&
        vis(pose, LM.R_SHOULDER) > 0.7
      ) {
        this.bothSidesFrames += 1;
      }
    }

    // 3) Desviaciones y clasificación
    const standing = !!(
      this.settings.standingDetection &&
      raw &&
      this.profile &&
      isStanding(raw, this.profile.baseline)
    );
    this.lastStanding = standing;
    let suppressed: SuppressedReason | null = null;
    if (this.system === 'locked') suppressed = 'locked';
    else if (this.paused) suppressed = 'paused';
    else if (presence === 'nodata') suppressed = 'noData';
    else if (presence === 'absent') suppressed = 'absent';
    else if (!this.profile) suppressed = 'notCalibrated';
    else if (this.lighting !== 'ok') suppressed = this.lighting;
    else if (standing) suppressed = 'standing';

    if (frame && this.profile && raw && hasPerson) {
      this.lastDeviations = computeDeviations(raw, this.profile.baseline);
      this.lastZones = classify(
        this.lastDeviations,
        this.thresholds,
        this.deps.clinical.stateMachine.exitMargin.value,
      );
    } else if (frame) {
      this.lastZones = {};
    }

    const sm = this.deps.clinical.stateMachine;
    const out = stepMachine(
      this.machine,
      { t, readings: this.lastZones, active: suppressed === null },
      {
        mildAfterAmberMs: sm.mildAfterAmberMs.value,
        badAfterRedMs: sm.badAfterRedMs.value,
        badAfterAmberMs: sm.badAfterAmberMs.value,
        criticalAfterRedMs: sm.criticalAfterRedMs.value,
        exitGreenMs: sm.exitGreenMs.value,
        maxGapMs: Math.max(sm.maxGapMs.value, 2500),
      },
    );
    this.machine = out.state;
    this.lastLevel = out.level;
    this.lastReason = out.reason;

    // 4) Alertas
    const offset = this.deps.utcOffsetMin();
    const wall = this.deps.clock.wallMs();
    const localMs = (((wall + offset * 60_000) % 86_400_000) + 86_400_000) % 86_400_000;
    const decision = stepAlerts(
      this.alertState,
      {
        t,
        level: out.level,
        reason: out.reason,
        localMinutes: Math.floor(localMs / 60_000),
        dayKey: dayKeyOf(wall, offset),
        audio: this.audio,
        suppressed: suppressed !== null,
      },
      this.preset.alerts,
    );
    this.alertState = decision.state;

    // 5) Descansos y estadísticas
    const breakPresence: BreakPresence =
      this.system === 'locked'
        ? 'locked'
        : presence === 'nodata'
          ? 'nodata'
          : presence === 'absent'
            ? 'absent'
            : standing
              ? 'standing'
              : 'present';
    const br = stepBreaks(this.breakState, { t, presence: breakPresence }, this.preset.breaks);
    this.breakState = br.state;

    const activity = activityOf({
      locked: this.system === 'locked',
      paused: this.paused,
      presence,
      calibrated: this.profile !== null,
      lightingOk: this.lighting === 'ok',
      standing,
      gap: dt > this.preset.breaks.maxGapMs,
    });
    const activeDeviations =
      activity === 'seated'
        ? DEVIATION_IDS.filter((id) => {
            const z = this.lastZones[id];
            return !!z && z.zone !== 'green';
          })
        : [];
    this.recorder.add(wall, dt, activity, out.level, out.reason, activeDeviations);
    let hydration = false;
    if (frame && this.blinkOn()) {
      const measurable =
        hasPerson &&
        presence === 'present' &&
        this.system === 'active' &&
        !this.paused &&
        this.lighting === 'ok' &&
        !standing;
      const step = this.blink.step(t, measurable ? (frame.blink ?? null) : null);
      this.blinkRate = this.blink.ratePerMin(t);
      const cfg = this.deps.clinical.blink;
      const low = this.blinkRate !== null && this.blinkRate < cfg.lowBelowPerMin.value;
      if (step.validMs > 0)
        this.recorder.addBlink(step.validMs, step.blinked ? 1 : 0, low ? step.validMs : 0);
      const r = stepBlinkAlert(
        this.blinkAlert,
        {
          t,
          ratePerMin: this.blinkRate,
          localMinutes: Math.floor(localMs / 60_000),
          dnd: this.preset.alerts.dnd,
          snoozed: this.alertState.snoozedUntil !== null && t < this.alertState.snoozedUntil,
          quiet: this.preset.alerts.quiet,
        },
        {
          lowBelowPerMin: cfg.lowBelowPerMin.value,
          sustainedLowMs: cfg.sustainedLowMs.value,
          cooldownMs: cfg.cooldownMs.value,
        },
      );
      this.blinkAlert = r.state;
      hydration = r.fire;
    }
    if (t - this.lastFlush >= FLUSH_MS) this.flushStats();

    this.okSince = out.level === 'OK' && presence === 'present' ? (this.okSince ?? t) : null;
    this.updateDrift(t);

    this.lastSuppressed = suppressed;
    this.trackAlertOutcome(t, activity, out.level);
    const snap = this.snapshot(t, decision.indicator, suppressed);
    if (decision.actions.length) {
      const intrusive = decision.actions.find(
        (a) => a.kind === 'sound' || a.kind === 'notification' || a.kind === 'overlay',
      );
      if (intrusive && decision.state.lastIntrusiveAt === t && out.level !== 'OK') {
        this.resolvePendingAlert(true);
        this.pendingAlert = { wall, t };
        events?.onAlertRecord?.({
          t: wall,
          level: out.level === 'CRITICA' ? 'CRITICA' : 'MALA_POSTURA',
          reason: out.reason,
        });
      }
      events?.onAlerts?.(decision.actions, snap);
    }
    if (hydration) events?.onAlerts?.([{ kind: 'hydration' }], snap);
    if (br.events.length) {
      for (const e of br.events) {
        if (e.type === 'absenceReset')
          events?.onBreakRecord?.({ t: wall, kind: 'micro', outcome: 'absence' });
      }
      events?.onBreaks?.(br.events, snap);
    }
    return snap;
  }

  /** Cierra el seguimiento del último aviso: corregido, ignorado o sin conclusión (el usuario se fue). */
  private trackAlertOutcome(t: number, activity: ActivityState, level: PostureLevel): void {
    const p = this.pendingAlert;
    if (!p) return;
    if (activity === 'seated') {
      if (level === 'OK') {
        this.pendingAlert = null;
        this.deps.events?.onAlertUpdate?.({ t: p.wall, recoveredMs: t - p.t });
      } else if (t - p.t >= ALERT_IGNORED_MS) this.resolvePendingAlert(true);
    } else if (activity !== 'light' && activity !== 'notCalibrated') this.pendingAlert = null;
  }

  private resolvePendingAlert(ignored: boolean): void {
    const p = this.pendingAlert;
    this.pendingAlert = null;
    if (p && ignored) this.deps.events?.onAlertUpdate?.({ t: p.wall, ignored: true });
  }

  private updateDrift(t: number): void {
    this.driftStart ??= t;
    if (Object.keys(this.lastZones).length > 0) {
      const nonGreenNow = DEVIATION_IDS.filter((id) => {
        const z = this.lastZones[id];
        return z && z.zone !== 'green';
      }).length;
      this.driftMin = Math.min(this.driftMin, nonGreenNow);
    }
    if (t - this.driftStart >= DRIFT_WINDOW_MS) {
      if (Number.isFinite(this.driftMin)) this.driftWindows.push({ nonGreenCount: this.driftMin });
      this.driftWindows = this.driftWindows.slice(-10);
      this.driftStart = t;
      this.driftMin = Infinity;
    }
  }

  private snapshot(
    t: number,
    indicator?: PostureLevel,
    suppressed?: SuppressedReason | null,
  ): EngineSnapshot {
    const cfg = this.preset.breaks;
    const nb = nextBreak(this.breakState, cfg);
    const presence = this.presence.status;
    const fps = this.settings.fps;
    let suggestedFps = fps;
    if (this.system === 'locked' || this.paused) suggestedFps = 1;
    else if (presence === 'absent' || presence === 'nodata') suggestedFps = 2;
    else if (this.settings.powerSaving && this.okSince !== null && t - this.okSince > 120_000)
      suggestedFps = Math.max(5, Math.round(fps / 2));
    if (this.blinkOn() && presence === 'present' && this.system === 'active' && !this.paused)
      suggestedFps = Math.max(suggestedFps, BLINK_MIN_FPS);
    const ref = this.deps.clinical.cvaReference.value.lowBelowDeg;
    return {
      t,
      presence,
      level: this.lastLevel,
      indicator: indicator ?? this.lastLevel,
      reason: this.lastReason,
      levels: Object.fromEntries(DEVIATION_IDS.map((id) => [id, this.machine.devs[id].level])) as Record<
        DeviationId,
        PostureLevel
      >,
      deviations: this.lastDeviations,
      zones: this.lastZones,
      thresholds: this.thresholds,
      raw: this.lastRaw,
      cvaInfo: informativeCva(this.lastRaw?.cvaDeg ?? null, ref),
      suppressed: suppressed === undefined ? this.lastSuppressed : suppressed,
      lighting: this.lighting,
      breaks: {
        nextKind: nb.kind,
        remainingMs: nb.remainingMs,
        sittingMs: this.breakState.long,
        pending: pendingBreak(this.breakState),
      },
      calibration: { active: this.calibration !== null, count: this.calibration?.count ?? 0 },
      suggestRecalibration: shouldSuggestRecalibration(this.driftWindows),
      personChanged: this.personChanged,
      suggestedFps,
      blink: { enabled: this.blinkOn(), ratePerMin: this.blinkRate },
      skeleton: this.lastSkeleton,
    };
  }

  getSnapshot(): EngineSnapshot {
    return this.snapshot(this.lastT ?? 0);
  }

  getProfile(): CalibrationProfile | null {
    return this.profile;
  }

  clearPersonChanged(): void {
    this.personChanged = false;
  }
}
