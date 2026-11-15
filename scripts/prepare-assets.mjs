// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

// Prepara los activos empaquetados (WASM + modelos). Solo se ejecuta en instalación/compilación;
// en ejecución la app no hace ninguna petición de red.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const lockPath = join(root, 'assets', 'models.lock.json');

const BASE = 'https://storage.googleapis.com/mediapipe-models';
const ALL_MODELS = {
  'pose_landmarker_lite.task': `${BASE}/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`,
  'pose_landmarker_full.task': `${BASE}/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task`,
  'face_landmarker.task': `${BASE}/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`,
};
const wanted = (process.env.NECKGUARD_MODELS ?? 'pose_landmarker_lite.task,face_landmarker.task').split(',');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function copyWasm() {
  const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
  if (!existsSync(src)) {
    console.warn('[assets] @mediapipe/tasks-vision no instalado todavía; se omite copia WASM');
    return;
  }
  mkdirSync(join(publicDir, 'wasm'), { recursive: true });
  // Solo la variante clásica (hilo principal); la variante "module" duplicaría ~15 MB sin uso.
  cpSync(src, join(publicDir, 'wasm'), { recursive: true, filter: (f) => !f.includes('_module_') });
  console.log('[assets] WASM copiado a public/wasm');
}

async function fetchModels() {
  mkdirSync(join(publicDir, 'models'), { recursive: true });
  mkdirSync(dirname(lockPath), { recursive: true });
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : {};
  let lockChanged = false;
  for (const name of wanted) {
    const url = ALL_MODELS[name];
    if (!url) throw new Error(`Modelo desconocido: ${name}`);
    const dest = join(publicDir, 'models', name);
    if (existsSync(dest) && lock[name] && sha256(readFileSync(dest)) === lock[name].sha256) continue;
    console.log(`[assets] descargando ${name}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Descarga fallida ${name}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = sha256(buf);
    if (lock[name] && lock[name].sha256 !== hash) {
      throw new Error(`Hash distinto para ${name}; revisa assets/models.lock.json antes de continuar`);
    }
    writeFileSync(dest, buf);
    if (!lock[name]) {
      lock[name] = { url, sha256: hash, bytes: statSync(dest).size };
      lockChanged = true;
    }
  }
  if (lockChanged) writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

copyWasm();
try {
  await fetchModels();
} catch (err) {
  console.warn(`[assets] ${err instanceof Error ? err.message : err}`);
  console.warn('[assets] Ejecuta "npm run prepare:assets" con red para obtener los modelos.');
  process.exitCode = process.env.CI ? 1 : 0;
}
