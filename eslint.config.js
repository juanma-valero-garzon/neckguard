import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-electron',
      'release',
      'coverage',
      'public',
      'node_modules',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Núcleo determinista: relojes y azar siempre inyectados.
      'no-restricted-globals': ['error', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Usa el Clock inyectado.' },
        { object: 'Math', property: 'random', message: 'Usa el Rng inyectado.' },
        { object: 'performance', property: 'now', message: 'Usa el Clock inyectado.' },
      ],
    },
  },
  {
    // Capas con acceso legítimo al entorno (DOM, plataforma, UI, tests).
    files: [
      'src/**/*.test.{ts,tsx}',
      'src/ui/**',
      'src/platform/**',
      'src/camera/**',
      'src/app/**',
      'src/vision/landmarker.ts',
      'src/breaks/ticker.worker.ts',
      'src/alerts/audio.ts',
      'src/main.tsx',
      'e2e/**',
    ],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    files: ['src/ui/**/*.tsx'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '19' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // i18n: ningún literal de texto en componentes.
      'react/jsx-no-literals': [
        'error',
        { noStrings: false, allowedStrings: ['·', '—', '/', '%', ':', '°', '+', '-', '×'] },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'electron/**/*.cts', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
