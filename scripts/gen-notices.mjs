// Genera THIRD_PARTY_NOTICES.md (avisos de licencias de lo que se distribuye), que "Acerca de" incrusta en el build.
// Se ejecuta tras `npm install` y antes de `npm run build`.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// Paquetes cuyo código acaba dentro de dist/ (lo que Vite empaqueta). Fuente de verdad: dependencias de ejecución.
const RUNTIME_ROOTS = ['react', 'react-dom', 'zustand', '@mediapipe/tasks-vision'];

const readPkg = (name) => {
  const p = join(nm, name, 'package.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};
const licenseOf = (j) => {
  const l = j.license ?? (j.licenses ?? []).map((x) => x.type).join(' OR ');
  return typeof l === 'object' ? l.type : l || 'UNKNOWN';
};
const licenseText = (name) => {
  const dir = join(nm, name);
  const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n));
  if (f) return readFileSync(join(dir, f), 'utf8').trim();
  const apache = join(root, 'assets', 'licenses', 'Apache-2.0.txt');
  if (licenseOf(readPkg(name)) === 'Apache-2.0' && existsSync(apache)) {
    return `${readFileSync(apache, 'utf8').trim()}\n\n(El paquete no incluye fichero LICENSE; se reproduce el texto estándar de Apache-2.0.)`;
  }
  return '(sin fichero de licencia en el paquete)';
};

const closure = new Map();
const visit = (name) => {
  if (closure.has(name)) return;
  const j = readPkg(name);
  if (!j) throw new Error(`Falta ${name}: ejecuta npm install`);
  closure.set(name, j);
  Object.keys(j.dependencies ?? {}).forEach(visit);
};
RUNTIME_ROOTS.forEach(visit);

// Histograma de licencias del árbol completo (herramientas de desarrollo; no se distribuyen).
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const all = new Set(
  Object.keys(lock.packages)
    .filter((k) => k.startsWith('node_modules/'))
    .map((k) => k.replace(/^.*node_modules\//, '')),
);
const hist = new Map();
for (const n of all) {
  const j = readPkg(n);
  if (!j) continue;
  const l = licenseOf(j);
  hist.set(l, (hist.get(l) ?? 0) + 1);
}
const histRows = [...hist.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `| ${l} | ${n} |`);

const rows = [...closure.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([n, j]) => `| ${n} | ${j.version} | ${licenseOf(j)} |`);

const texts = [...closure.keys()].sort().map((n) => {
  const j = closure.get(n);
  return `### ${n} ${j.version} — ${licenseOf(j)}\n\n\`\`\`text\n${licenseText(n)}\n\`\`\``;
});

const out = `# Avisos de licencias de terceros

NeckGuard ${pkg.version} se distribuye bajo la **${pkg.license}** (ver \`LICENSE\`). Este fichero se genera con
\`npm run licenses\` (scripts/gen-notices.mjs); no lo edites a mano.

## Compatibilidad con la AGPL-3.0

| Familia de licencia | Compatibilidad con AGPL-3.0 | Dónde aparece |
| --- | --- | --- |
| MIT, ISC, BSD-2/3-Clause, 0BSD | Compatible (permisivas) | React, ReactDOM, Scheduler, Zustand; herramientas de desarrollo |
| Apache-2.0 | Compatible con GPL-3.0/AGPL-3.0 (no con GPL-2.0) | @mediapipe/tasks-vision y su WASM; TypeScript y Playwright (solo desarrollo) |
| MPL-2.0 | Compatible (MPL-2.0 §3.3, licencia secundaria) | axe-core y lightningcss (solo desarrollo, no se distribuyen) |
| LGPL-2.1 | Compatible como componente enlazado dinámicamente | FFmpeg dentro de Electron/Chromium (ver abajo) |
| BlueOak-1.0.0, Python-2.0, CC-BY-4.0, WTFPL, CC0 | Compatibles / sin restricción relevante | Solo herramientas de desarrollo o datos de desarrollo |

Conclusión: no se ha encontrado ninguna dependencia **distribuida** con licencia incompatible con la AGPL-3.0. Esto es un
análisis técnico, no asesoramiento legal.

## Componentes incluidos en la aplicación web (dist/)

| Paquete | Versión | Licencia |
| --- | --- | --- |
${rows.join('\n')}

### Modelos y WASM de MediaPipe

- \`public/wasm/vision_wasm_internal.*\` se copia de \`@mediapipe/tasks-vision\` (Apache-2.0).
- \`public/models/pose_landmarker_lite.task\` y \`face_landmarker.task\` se descargan de storage.googleapis.com/mediapipe-models
  (hash en \`assets/models.lock.json\`). **La licencia de estos ficheros de modelo no ha podido verificarse a partir de una fuente
  primaria**: el repositorio MediaPipe es Apache-2.0 y las fichas de modelo (model cards) enlazadas por la documentación son la
  referencia; confírmalo antes de redistribuir los modelos y, si no se confirma, no los incluyas en el paquete distribuido.

### Electron (solo en la app de macOS)

Electron (MIT) incorpora Chromium (BSD-3-Clause y numerosos componentes de terceros) y FFmpeg (LGPL-2.1). El empaquetado
incluye en \`NeckGuard.app/Contents/Resources/\` los ficheros \`LICENSE.electron.txt\` y \`LICENSES.chromium.html\`, que son la lista
autoritativa de esos componentes y deben redistribuirse con la aplicación. No se ha auditado exhaustivamente cada componente de Chromium.

## Herramientas de desarrollo (no se distribuyen)

Recuento de licencias declaradas en todo el árbol de dependencias instalado:

| Licencia | Paquetes |
| --- | --- |
${histRows.join('\n')}

## Textos de licencia de los componentes distribuidos

${texts.join('\n\n')}
`;

writeFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), out);
console.log(`[licenses] THIRD_PARTY_NOTICES.md (${closure.size} paquetes distribuidos)`);
