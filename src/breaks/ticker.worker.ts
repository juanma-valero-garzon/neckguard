// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

// Temporizador en Worker: los timers del hilo principal se ralentizan con la ventana en segundo plano.
interface StartMsg {
  type: 'start';
  frameMs: number;
  tickMs: number;
}
interface FrameMsg {
  type: 'setFrameMs';
  frameMs: number;
}
interface StopMsg {
  type: 'stop';
}

let frameTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;

const startFrame = (ms: number): void => {
  if (frameTimer) clearInterval(frameTimer);
  frameTimer = setInterval(() => postMessage({ type: 'frame' }), Math.max(ms, 30));
};

self.onmessage = (e: MessageEvent<StartMsg | FrameMsg | StopMsg>): void => {
  const m = e.data;
  if (m.type === 'start') {
    startFrame(m.frameMs);
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => postMessage({ type: 'tick' }), m.tickMs);
  } else if (m.type === 'setFrameMs') {
    startFrame(m.frameMs);
  } else if (m.type === 'stop') {
    if (frameTimer) clearInterval(frameTimer);
    if (tickTimer) clearInterval(tickTimer);
    frameTimer = tickTimer = null;
  }
};
