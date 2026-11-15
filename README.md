# NeckGuard

Monitor local de postura cervical y descansos. Una única base de código TypeScript/React que funciona como **web** y como **app de macOS (Electron)**.

- Analiza la cámara (portátil o USB) con MediaPipe Pose/Face Landmarker **en tu equipo**: ningún fotograma sale del dispositivo, no se guarda vídeo ni imágenes.
- Avisa (visual y sonoro, con histéresis, enfriamiento y horario silencioso) cuando la desviación postural se **sostiene**, y recuerda los descansos.
- No es un producto sanitario. Los umbrales son valores de partida **sin validar clínicamente** (ver [docs/CLINICAL.md](docs/CLINICAL.md)).

## Requisitos

Node ≥ 20 (probado con 24), npm, macOS 12+ para Electron.

## Instalación y ejecución (web)

```bash
npm install          # copia el WASM de MediaPipe a public/wasm y descarga los modelos a public/models
npm run dev          # http://localhost:5173  (la cámara requiere localhost o HTTPS)
```

`npm install` es el único momento con red (descarga de modelos, con hash fijado en `assets/models.lock.json`). Después, la app no hace ninguna petición externa.

## Scripts

| Script                      | Qué hace                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `npm test`                  | Tests unitarios y de UI (Vitest, < 1 s)                                             |
| `npm run test:coverage`     | Idem + cobertura con umbrales (90 % líneas / 85 % ramas del núcleo)                 |
| `npm run test:e2e`          | Playwright con cámara simulada: arranque, CSP, tráfico externo, axe, exportar       |
| `npm run lint`              | ESLint (incluye regla de «sin literales en componentes») + Prettier                 |
| `npm run typecheck`         | TypeScript estricto (app + Electron)                                                |
| `npm run build`             | Build web en `dist/` (CSP estricta inyectada)                                       |
| `npm run electron:dev`      | Build + ejecuta Electron                                                            |
| `npm run electron:pack`     | `.dmg` universal (arm64+x64) sin firmar. Ver [docs/PACKAGING.md](docs/PACKAGING.md) |
| `npm run electron:pack:dir` | `.app` sin empaquetar (más rápido, para pruebas)                                    |

## Estructura

```
src/
  vision/     filtros One-Euro, presencia/luz/persona principal, wrapper de MediaPipe
  posture/    métricas, desviaciones, calibración, clasificador, máquina de estados (puro)
  alerts/     política de avisos (pura), tonos y Web Audio
  breaks/     temporizadores de descanso (puros) y Worker de temporizador
  engine/     integra todo el núcleo; sin DOM ni Electron
  stats/      modelo, migraciones, persistencia atómica, agregación, exportación
  settings/   clinical-config (umbrales + confianza), esquema de ajustes, presets
  exercises/  biblioteca y reglas de acceso
  i18n/       es / en
  camera/     getUserMedia, reconexión, selección de dispositivo
  platform/   contrato Platform + implementaciones web y Electron
  app/        runtime (orquestación) y store
  ui/         React
electron/     main, preload (sandbox), validación IPC
docs/         ARCHITECTURE, CLINICAL, PRIVACY, ASSUMPTIONS, PACKAGING, QA
```

## Uso

1. **Onboarding**: aviso legal, confirmación de señales de alerta (sin ella los ejercicios quedan bloqueados), cámara/modo, sonido.
2. **Calibración** (obligatoria): siéntate erguido/a, retrae la barbilla, relaja hombros; ~5 s. Se rechaza con motivo si hay movimiento, poca confianza o landmarks ausentes. Atajo de recalibración: ⌘⇧R.
3. **Panel**: estado, indicadores clave (cambio respecto a tu base), anillo de tiempo sentado, controles (pausar, posponer 15/30/60, No molestar).
4. **Modos**: _frontal_ (la cámara te mira de frente; métricas relativas), _lateral_ (cámara de perfil; ΔCVA aproximado, recomendado con dolor cervical) o _ladeado_ (el portátil junto a otra pantalla: la cámara te ve en ángulo; lado más visible + métricas relativas, precisión intermedia). Tanto la cámara del portátil como una USB admiten los tres modos; el modo y la calibración se recuerdan por cámara.

## Estado

Ver [CHANGELOG.md](CHANGELOG.md) y [docs/QA.md](docs/QA.md) (qué está verificado, qué es supuesto y qué falta por validar con personas reales).

## Licencia

NeckGuard se distribuye bajo la **GNU Affero General Public License v3.0** (`AGPL-3.0-only`, ver [LICENSE](LICENSE)). Las licencias de los componentes de terceros y el análisis de compatibilidad están en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (se regenera con `npm run licenses`). Pendiente antes de redistribuir: confirmar la licencia de los ficheros de modelo de MediaPipe.
