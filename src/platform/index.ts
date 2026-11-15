// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import type { Platform } from './platform';
import { browserEnv, createWebPlatform } from './web';
import { createElectronPlatform } from './electron';

export function detectPlatform(): Platform {
  if (typeof window !== 'undefined' && window.neckguard) return createElectronPlatform(window.neckguard);
  return createWebPlatform(browserEnv());
}
