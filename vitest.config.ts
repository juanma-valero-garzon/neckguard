import { defineConfig } from 'vitest/config';
import { transformWithOxc, type Plugin } from 'vite';

// Vite no trata .cts como TypeScript: se transpila aquí solo para poder probar el código de Electron.
const ctsAsTs = (): Plugin => ({
  name: 'cts-as-ts',
  enforce: 'pre',
  transform: (code, id) =>
    id.endsWith('.cts') ? transformWithOxc(code, id.replace(/\.cts$/, '.ts'), { lang: 'ts' }) : null,
});

export default defineConfig({
  plugins: [ctsAsTs()],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'src/vision/filters.ts',
        'src/vision/presence.ts',
        'src/posture/**/*.ts',
        'src/alerts/policy.ts',
        'src/alerts/tones.ts',
        'src/alerts/audio.ts',
        'src/breaks/timers.ts',
        'src/stats/**/*.ts',
        'src/settings/**/*.ts',
        'src/exercises/**/*.ts',
        'src/i18n/**/*.ts',
        'src/engine/**/*.ts',
        'src/platform/web.ts',
        'src/platform/electron.ts',
        'src/camera/errors.ts',
        'electron/validate.cts',
      ],
      exclude: ['**/*.test.ts', 'src/**/types.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      thresholds: { lines: 90, branches: 85, functions: 85, statements: 90 },
    },
  },
});
