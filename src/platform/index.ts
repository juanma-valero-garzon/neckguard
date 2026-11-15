import type { Platform } from './platform';
import { browserEnv, createWebPlatform } from './web';
import { createElectronPlatform } from './electron';

export function detectPlatform(): Platform {
  if (typeof window !== 'undefined' && window.neckguard) return createElectronPlatform(window.neckguard);
  return createWebPlatform(browserEnv());
}
