# Privacidad

## Qué hace la app

- **Procesamiento 100 % local.** Los fotogramas viven solo en memoria durante su análisis. No se guardan ni se envían.
- **Solo se almacenan agregados** (`SessionSummary`: milisegundos por estado, por causa de no análisis, por franja horaria y por desviación; con el parpadeo activado, solo tiempo medido, nº de parpadeos y tiempo con frecuencia baja; `DailyRecord`), eventos de aviso/descanso, ausencias y bloques sentados (solo marca de tiempo, duración y causa), ajustes y el perfil de calibración (medianas y σ numéricas). El esquema no admite imágenes ni landmarks y `migrateStore`/`saveStore` los rechazan.
- **Sin red en ejecución**: modelos, WASM, fuentes (del sistema), sonidos (Web Audio) e iconos van empaquetados. CSP `default-src 'self'` (+ `'wasm-unsafe-eval'` para WASM). En Electron además se cancelan todas las peticiones salvo `app:`, `blob:` y `data:`.
- **Sin telemetría ni cuentas.**
- **Exportar** (JSON/CSV) y **borrar todos mis datos** en Ajustes.
- Los logs no contienen imágenes ni landmarks.
- macOS muestra el indicador de cámara activa mientras se analiza; se puede pausar la cámara desde el panel o la barra de menús.

## Verificación automatizada

- `src/privacy.test.ts`: con `fetch`, `XMLHttpRequest`, `WebSocket` y `sendBeacon` sustituidos por dobles que lanzan, una sesión completa (calibrar, avisar, descansos, guardar, exportar) no los invoca; ninguna escritura contiene `data:`, `Blob`, `ImageData` ni landmarks; el código fuente no contiene URLs ni llamadas de red.
- `e2e/app.spec.ts`: en Chromium con cámara simulada, todas las peticiones van al propio origen; la CSP de producción no contiene `unsafe-inline`/`unsafe-eval`.
- `electron/validate.test.ts`: validación de cada mensaje IPC y del protocolo `app://`.

## Fuera de estas garantías

La descarga de modelos ocurre **solo en `npm install`/`npm run prepare:assets`** (hash en `assets/models.lock.json`, confianza en el primer uso).

## Checklist (ver estado en docs/QA.md)

- [x] Sin peticiones externas en ejecución (test automático)
- [x] Sin imágenes/landmarks almacenados (test automático)
- [x] Exportar/borrar datos
- [ ] Inspección manual de tráfico con Little Snitch/`nettop` en la app empaquetada
- [ ] Revisión legal de licencias de MediaPipe y modelos
