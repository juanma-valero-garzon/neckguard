# Changelog

## Sin publicar

### Añadido

- Estadísticas v3: resúmenes por día, semana y mes con comparación con el periodo anterior, franjas horarias, pausas y bloques sentados, y pautas de mejora locales (reglas deterministas, es/en).
- El tiempo fuera de la silla (ausente, de pie, equipo bloqueado) se registra por causa y nunca cuenta como buena ni mala postura; cada resumen indica su fiabilidad y la parte del tiempo que se pudo analizar.
- Avisos con resultado (tiempo hasta corregir / ignorado) y descansos con ejercicio y tiempo fuera de la silla.
- Resúmenes diarios permanentes: lo anterior a 45 días se compacta sin perder totales.

### Cambiado

- Esquema de datos v3 (migración automática desde v1 y v2). Las sesiones antiguas conservan su tiempo «sin analizar» como causa desconocida y no tienen franjas horarias.

## 0.1.0 — 2026-11-07

### Añadido

- Núcleo puro y testeado: filtros One-Euro, métricas frontal/lateral (ΔCVA aproximado), calibración con validación, clasificador con umbral efectivo = máx(config, 2σ), máquina de estados con histéresis, política de avisos, temporizadores de descanso, presencia/luz/persona principal.
- UI React: onboarding con aviso legal y señales de alerta, calibración guiada, panel, ventana de descanso, estadísticas, ejercicios (SVG), ajustes, Acerca de; es/en; modo claro/oscuro; accesibilidad AA.
- Avisos visuales y sonoros (Web Audio), notificaciones, overlay, posponer, No molestar, horario silencioso.
- Persistencia versionada con migración, copia de seguridad y escritura atómica; exportar JSON/CSV y borrar datos.
- Electron: protocolo `app://`, sandbox, menú de barra con popover, notificaciones nativas, inicio con el sistema, `powerMonitor`, empaquetado con electron-builder.
- Tests (242), E2E Playwright, CI.

### Conocido

- Umbrales sin validación clínica; precisión y rendimiento sin medir con personas/hardware reales (ver docs/QA.md).
