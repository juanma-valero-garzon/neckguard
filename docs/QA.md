# Informe de QA

Fecha: 2026-11-07. Entorno: macOS (Apple Silicon), Node 24, Chromium headless de Playwright con cámara simulada.

## Verificado (automático)

| Comprobación                                | Resultado                                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests unitarios + UI + Electron (Vitest)    | 18 ficheros, **242 tests**, ~0,9 s (< 30 s)                                                                                                                            |
| Cobertura (núcleo; ver `vitest.config.ts`)  | Líneas **98,8 %**, ramas **95,3 %**, funciones 96,8 %, sentencias 98,0 % (umbral 90/85)                                                                                |
| Typecheck estricto (app + Electron)         | Sin errores                                                                                                                                                            |
| ESLint + Prettier                           | Sin errores                                                                                                                                                            |
| `npm audit --omit=dev`                      | 0 vulnerabilidades                                                                                                                                                     |
| E2E (Playwright, Chromium, cámara simulada) | Arranque, onboarding completo, cámara iniciada, **modelo Pose local cargado**, WASM local, **0 peticiones externas**, CSP estricta, exportar/borrar datos, modo oscuro |
| Accesibilidad (axe wcag2a/2aa)              | Sin violaciones críticas/serias en onboarding, panel, ajustes, estadísticas, ejercicios y Acerca de (tras corregir un contraste en el panel)                           |
| Electron                                    | Compila, arranca (protocolo `app://` carga `index.html`), empaqueta `.app` arm64 con `NSCameraUsageDescription` y arranca                                              |
| Tamaños                                     | `dist/` 25 MB (modelos 9,1 MB + WASM 14 MB); `.app` sin comprimir 312 MB (Electron)                                                                                    |

## Cobertura funcional de los tests unitarios

Filtros One-Euro, métricas (ángulos exactos, invariancias, 4 combinaciones frontales), calibración (aceptación/rechazo con motivo, σ, perfiles), clasificador, máquina de estados (+ propiedad con `fast-check`), política de avisos, Web Audio simulado, descansos, presencia/luz/persona principal, estadísticas y persistencia (migración v1→v2, escritura interrumpida, datos corruptos, exportación), ajustes y `clinical-config`, ejercicios, i18n (paridad es/en, plurales, formatos, claves usadas), privacidad, contrato de `Platform` (web y Electron), errores de cámara, validación IPC, UI (onboarding, bloqueo de ejercicios, idioma).

## NO verificado / pendiente (honestidad)

- **Sensibilidad ≥ 85 % y ≤ 1 falso positivo/hora** con personas reales (frontal y lateral, gafas, poca luz): **no medido**. Protocolo manual requerido (≥ 5 personas): posturas correctas e incorrectas guiadas, registrando aciertos, falsos positivos/h y latencia.
- **CPU < 15 % y latencia < 200 ms** en Apple Silicon: no medido. Procedimiento: Activity Monitor/`powermetrics`, 10 min, con vista previa oculta y visible.
- **Spikes**: variante de modelo (lite/full) y hilos (inferencia en Worker).
- **Convención de la matriz facial** y de los proxies con cámara real.
- Tests con landmarks reales anonimizados: no hay datos reales todavía (solo sintéticos con semilla fija).
- Pruebas con cámara USB real (reconexión), tapa cerrada/suspensión real, App Nap, tráfico con herramienta externa en la app empaquetada.
- E2E de Electron (Playwright `_electron`) no escrito; la validación IPC sí está testeada.
- `.dmg` universal, firma y notarización (sin cuenta de Apple Developer).
- Auditoría Lighthouse; revisión clínica por fisioterapeuta; revisión legal de licencias.

## Checklists

Privacidad: ver docs/PRIVACY.md. Rendimiento: pendiente de medición (ver arriba).
