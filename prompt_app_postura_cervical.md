# PROMPT: Aplicación "NeckGuard" – Monitor de postura cervical y descansos (Web → Electron/macOS)

## 0. REGLAS DE TRABAJO Y PRIORIDADES

- **Prioridad ante conflictos:** 1) privacidad, 2) seguridad clínica del usuario, 3) fiabilidad/precisión, 4) baja intrusión, 5) rendimiento, 6) estética.
- **No inventes** APIs, versiones, parámetros ni referencias. Antes de usar una librería, consulta su documentación vigente y **fija versiones exactas** (lockfile). Si no puedes verificar algo, indícalo y márcalo como *supuesto*.
- **Cifras clínicas = valores de partida, no validados.** Cada umbral lleva un nivel de confianza (`consenso` / `literatura limitada` / `heurística`) y vive en un único fichero versionado (`clinical-config`) con comentarios. Indica expresamente que deben ser revisados por un/a fisioterapeuta humano/a antes de un uso real.
- Registra cada supuesto que hagas en `docs/ASSUMPTIONS.md`.
- Haz solo las preguntas imprescindibles; si no hay respuesta, aplica el valor por defecto propuesto y regístralo.
- Entrega por ficheros y en bloques manejables; no pegues proyectos enteros en una sola respuesta.

## 1. ROLES

Actúa simultáneamente como:

**A) Arquitecto/a y diseñador/a senior de aplicaciones para macOS y web**, con experiencia en TypeScript, visión por computador en el navegador, Electron, Human Interface Guidelines de Apple, accesibilidad y rendimiento.

**B) Fisioterapeuta especialista en columna cervical**. Tú defines los criterios clínicos (qué es una postura correcta, umbrales, ejercicios y pautas de descanso); el rol A los implementa fielmente. Si un criterio técnico entra en conflicto con uno clínico, prevalece el clínico y lo explicas. Si la limitación técnica impide cumplir el criterio clínico (p. ej. no se puede medir algo con una cámara frontal), **no lo simules**: degrada la función, informa a la persona usuaria de la limitación y documenta el límite.

## 2. OBJETIVO DEL PRODUCTO

Una aplicación que, usando la **cámara del portátil o una cámara USB** (seleccionable), analice en tiempo real la postura de la persona sentada frente al equipo y:

1. **Corrija la postura** cuando no sea adecuada, con **aviso visual y sonoro**.
2. **Recuerde los descansos** cuando la persona lleve sentada más tiempo del recomendado.

Finalidad clínica: **prevenir el dolor cervical, evitar la cabeza protruida (forward head posture), favorecer la retracción cefálica y mantener una lordosis cervical fisiológica.**

**Usuario objetivo:** adulto/a que trabaja sentado/a frente a un portátil o monitor, sin patología grave conocida.

**Fuera de alcance (v1):** cuentas/nube/sincronización, telemetría, grabación de vídeo, diagnóstico, entrenamiento de modelos propios, Windows/Linux (el código no debe impedirlos, pero no se empaquetan), análisis de varias personas a la vez, postura de pie o de otras zonas corporales.

## 3. PRINCIPIOS NO NEGOCIABLES

- **Privacidad total**: todo el procesamiento es local. Ningún fotograma sale del dispositivo, no se guarda vídeo ni imágenes. Solo se almacenan métricas agregadas (localStorage/IndexedDB; en Electron, un fichero JSON local). Los fotogramas viven solo en memoria durante su análisis; los logs nunca contienen imágenes ni landmarks crudos. Debe existir **exportar mis datos** (JSON/CSV) y **borrar todos mis datos** desde Ajustes, y el esquema de datos debe estar versionado con migraciones.
- **No es un producto sanitario**: no diagnostica ni trata. Mostrar un aviso claro en el onboarding y en "Acerca de". Incluir señales de alerta: si aparece dolor irradiado a brazo, hormigueo, debilidad, mareos, alteraciones visuales, dolor que empeora o es nocturno/constante, dolor tras un traumatismo reciente, fiebre, o pérdida de control de esfínteres, **suspender los ejercicios y consultar con un profesional (urgencias si es grave o de inicio súbito)**. Los ejercicios requieren confirmar en el onboarding que no se presenta ninguna de estas señales.
- **Sin red en ejecución:** modelos, fuentes, sonidos e iconos van empaquetados; ninguna descarga ni petición externa tras la instalación.
- **Poco intrusiva**: avisos con histéresis, retardos y enfriamiento para no generar fatiga de alertas.
- **Ligera**: CPU baja (objetivo < 15 % en un MacBook con Apple Silicon), análisis a 10–15 fps es suficiente. Debe medirse con un procedimiento reproducible (Activity Monitor/`powermetrics`, 10 min, vista previa oculta y visible) y existir un **modo ahorro adaptativo** (baja fps, o pausa el análisis, si no hay cambios o la persona está ausente).

## 4. CRITERIOS CLÍNICOS (rol fisioterapeuta)

Define e implementa estos criterios como configuración editable:

**Postura ideal de referencia (sedestación):** pelvis neutra con ligera lordosis lumbar, tórax erguido, hombros relajados y atrás, cabeza **retraída** sobre los hombros (oreja alineada con el hombro), mirada horizontal, mentón ligeramente recogido (sin flexionar el cuello), pantalla con el borde superior a la altura de los ojos.

**Principios clínicos de partida:**
- **La mejor postura es la siguiente postura:** no existe una postura estática perfecta. La app debe premiar la **variación y el movimiento**, y penalizar la desviación **sostenida**, no el desvío puntual.
- Los umbrales se expresan preferentemente como **desviación respecto a la línea base personal calibrada (Δ)**, no como valores absolutos, porque la medición con cámara tiene error. Todo umbral debe ser mayor que el ruido medido en la calibración (p. ej. ≥ 2σ).
- Los valores absolutos de la literatura (p. ej. CVA) se muestran solo como referencia informativa, nunca como veredicto.

**Desviaciones a detectar (por orden de prioridad):**

1. **Protrusión cefálica**: cabeza adelantada respecto a los hombros. Métrica ideal: ángulo craneovertebral (CVA: línea trago–C7 respecto a la horizontal). Referencia orientativa de la literatura: CVA < ~48–50° sugiere protrusión (el punto de corte exacto varía entre estudios). **Importante:** MediaPipe no detecta trago ni C7, así que el CVA de la app es una **aproximación** (oreja–hombro, con C7 estimado) y no equivale al CVA clínico; documenta el sesgo y usa **ΔCVA respecto a la línea base**. Valores iniciales a validar: ámbar Δ ≥ 5°, rojo Δ ≥ 10° por debajo de la base (confianza: heurística). Zonas verde/ámbar/roja configurables.
2. **Flexión cervical sostenida / cabeza baja**: mirar hacia abajo (portátil bajo), pérdida de lordosis cervical.
3. **Encorvamiento / hombros caídos hacia delante** (slouch) y colapso del tronco.
4. **Hombros elevados** (tensión) y **asimetría** de hombros.
5. **Inclinación o rotación lateral mantenida** de la cabeza.
6. **Proximidad excesiva a la pantalla** (suele acompañar a la protrusión).

**Pausas (basadas en ergonomía):**
- **Microdescanso cada 30 min** de sedestación continua (1–2 min): levantarse o cambiar de posición, y hacer **retracción cervical** (chin tuck) en sedestación, ~10 repeticiones suaves, sostener 1–2 s.
- **Descanso largo cada 50–60 min** (5 min): caminar, hidratarse, movilidad de hombros y extensión torácica.
- **Regla 20-20-20** opcional (cada 20 min mirar a 6 m durante 20 s) como recordatorio visual discreto.
- Todo configurable, con presets "Estándar", "Sensible" (dolor cervical activo) y "Personalizado".
- Si la persona está ausente ≥ 3 min (configurable) se considera descanso completado y se reinicia el contador. **Ausencia ≠ falta de datos:** si la cámara falla, está tapada o hay poca luz, el contador se pausa en estado "sin datos" y no cuenta ni como sentado ni como descanso.
- Las pautas de tiempo son heurísticas ergonómicas, no una prescripción individual; deben poder desactivarse y adaptarse (p. ej. mayor frecuencia en el preset "Sensible").
- Si la persona está de pie (trabajo con mesa elevable), no cuenta como sedestación continua (detección opcional por altura/escala de hombros).

**Biblioteca de ejercicios incluida** (texto + ilustración sencilla SVG, con aviso de seguridad): retracción cervical en sedestación, retracción con extensión (solo como opción avanzada y con advertencia), extensión torácica sobre el respaldo, movilidad de hombros, uso de rodillo lumbar. Cada ejercicio: objetivo, pasos, repeticiones, "cuándo parar", contraindicaciones/precauciones y nivel (básico/avanzado). Sin ejercicios con sobrepresión ni rotaciones forzadas. Regla de seguridad a respetar: si el síntoma se extiende hacia brazo/mano o empeora, parar; si disminuye o desaparece, continuar. Los ejercicios avanzados se desbloquean solo tras aceptar la advertencia, y el preset "Sensible" no los muestra por defecto.

## 5. VISIÓN POR COMPUTADOR (rol arquitecto)

- **Librería recomendada:** MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) con **Pose Landmarker** (+ **Face Landmarker** opcional para orientación de la cabeza), ejecución en cliente con WASM/WebGL/WebGPU. Modelos empaquetados localmente (para funcionar offline y en Electron). Justifica cualquier alternativa (TensorFlow.js MoveNet, etc.). Elige la variante del modelo (lite/full/heavy) con un spike medido (CPU, latencia, estabilidad de orejas/hombros) y documenta el resultado.
- **Hilos:** `getUserMedia` solo existe en el hilo principal. Decide y justifica con medición entre (a) enviar fotogramas al Worker (`ImageBitmap`/`VideoFrame` transferibles) y (b) inferir en el hilo principal dejando solo los temporizadores en el Worker.
- **Cámara:** `getUserMedia`, listado con `enumerateDevices`, selector de dispositivo, persistencia de la elección, reconexión si se desconecta la USB, gestión clara de permisos denegados.
- **Dos modos de uso, con la lógica clínica adecuada a cada uno:**
  - **Modo frontal** (cámara del portátil, el más común). Una cámara frontal no puede medir el CVA real, así que se usa **calibración personal + métricas relativas**:
    - Escala facial (distancia interpupilar / ancho facial) frente a la línea base → proxy de protrusión/acercamiento.
    - Posición vertical de orejas/nariz respecto a la línea de hombros y distancia oreja–hombro → flexión/caída de cabeza y encorvamiento.
    - Inclinación de la línea de hombros y de la línea de ojos → asimetría/inclinación lateral.
    - Cabeceo (pitch) de la cabeza estimado con Face Landmarker (matriz de transformación facial) → flexión/extensión cervical.
  - **Modo lateral/perfil** (cámara USB colocada a un lado, recomendado para precisión clínica): cálculo directo del **CVA** (oreja/trago–C7 aproximado con hombro) y del desplazamiento horizontal oreja–hombro.
  - Explica en la UI qué precisión ofrece cada modo y recomienda el lateral cuando haya dolor cervical.
- **Límites técnicos que debes respetar y documentar:**
  - Una cámara frontal no distingue bien "acercarse a la pantalla" de "adelantar la cabeza": combina la escala facial con la escala de hombros (si ambas crecen → se acerca el tronco; si crece solo la cara → protrusión cefálica).
  - Si la cámara está por debajo o por encima de los ojos, el cabeceo tiene un sesgo constante: la calibración lo absorbe, pero cambios posteriores de posición de la cámara/portátil obligan a recalibrar.
  - En modo lateral, Face Landmarker deja de ser fiable con giros de la cabeza elevados: usa solo Pose y usa el lado **visible** (detectarlo y permitir elegirlo); la cámara debe estar perpendicular al plano sagital y a la altura de los hombros/cuello. Valida esta colocación en la calibración.
  - Aplica la corrección de espejo de forma coherente entre vista previa y cálculos.
- **Calibración guiada (obligatoria en el primer uso):** asistente de 3 pasos con instrucciones del fisioterapeuta ("siéntate erguido, retrae la barbilla, relaja hombros"), captura de ~5 s de línea base, promedio y mediana de métricas, y posibilidad de recalibrar con un atajo. Guardar perfiles de calibración por cámara (identificada por `deviceId` con respaldo por etiqueta, ya que el `deviceId` puede cambiar al revocar permisos) y por modo (frontal/lateral). **Validación de la calibración:** rechazar y repetir si hay movimiento excesivo, confianza baja, landmarks ausentes o varianza alta; guardar también el **ruido (σ)** de cada métrica para fijar umbrales mínimos. Sugerir recalibrar si la línea base se desplaza de forma persistente (cambio de silla, cámara o altura).
- **Robustez:** filtrado de ruido (media móvil/exponencial o filtro One-Euro), ignorar fotogramas con baja confianza o landmarks no visibles, detección de presencia (persona presente/ausente), manejo de poca luz, gafas, y movimiento breve (hablar, estirarse) con debounce. Con varias personas en cuadro, analizar solo la principal (la más grande/centrada) y sugerir recalibrar si cambia de forma brusca. Medir la luminancia media y la confianza; con poca luz o contraluz, **suspender los avisos de postura** (no emitir falsos positivos) y sugerir mejorar la iluminación. Los temporizadores se basan en marcas de tiempo monotónicas (no en acumular ticks) para sobrevivir a suspensiones y cambios de reloj.
- **Máquina de estados de postura:** `OK → AVISO_LEVE → MALA_POSTURA → CRÍTICA`, con entrada tras N segundos sostenidos (p. ej. 10–15 s), salida con histéresis, y registro del motivo concreto (qué desviación).
  - Valores iniciales (a ajustar con datos reales): `AVISO_LEVE` tras ≥ 10 s en zona ámbar; `MALA_POSTURA` tras ≥ 20 s en zona roja o ≥ 2 min en ámbar; `CRÍTICA` tras ≥ 5 min en roja. Salida a `OK` solo tras ≥ 5 s en verde (histéresis) y con margen (p. ej. 20 % por dentro del umbral de entrada).
  - Cada desviación mantiene su propio estado; el estado global es el más grave, y el mensaje mostrado es el de la desviación de mayor prioridad (sección 4), sin acumular varios mensajes a la vez.
  - La máquina de estados debe ser una función pura (estado, métricas, tiempo) → nuevo estado, para poder testearla con fixtures.

## 6. SISTEMA DE AVISOS

**Postura incorrecta:**
- Visual: indicador de estado con color (verde/ámbar/rojo), mensaje específico y accionable ("Retrae la barbilla y sube la mirada", "Siéntate más atrás", "Relaja los hombros"), borde suave de pantalla/overlay discreto y notificación del sistema.
- Sonoro: sonidos suaves generados con **Web Audio API** (sin depender de ficheros), 2–3 tonos distintos por gravedad, **volumen y sonido configurables**, opción de silenciar o solo visual.
- Escalado progresivo según el estado: `AVISO_LEVE` → solo indicador visual discreto (sin sonido ni notificación); `MALA_POSTURA` → mensaje + tono suave + notificación; `CRÍTICA` → overlay discreto + segundo tono, nunca más de uno cada X minutos.
- **Enfriamiento** (no repetir antes de X minutos), **tope diario** de avisos sonoros configurable, **horario silencioso**, botón "posponer 15/30/60 min" y modo "No molestar" manual. En Electron, activar "No molestar" automáticamente cuando haya compartición de pantalla o la aplicación esté a pantalla completa, si es detectable.
- Si la persona ignora repetidamente los avisos, **reducir la frecuencia** en vez de aumentarla (evitar fatiga de alertas) y ofrecer ajustar la sensibilidad.
- El `AudioContext` se desbloquea con un gesto del usuario (política de autoplay) durante el onboarding; si está suspendido, degradar a aviso visual y avisar.
- Refuerzo positivo: mensaje breve cuando se corrige la postura.

**Descansos:**
- Aviso previo (2 min antes) y aviso de descanso con ejercicio sugerido, cuenta atrás del descanso, botones "Hecho", "Posponer 5 min", "Saltar".
- Contador de tiempo sentado visible (anillo de progreso) que se reinicia con la ausencia/descanso.
- Un descanso se considera cumplido solo si la persona se ausenta (o completa el ejercicio guiado) un mínimo configurable; pulsar "Hecho" sin ausencia ni ejercicio cuenta como "declarado" y se distingue en las estadísticas.

## 7. DISEÑO (rol diseñador macOS/web)

- Estilo **nativo de macOS** (HIG): tipografía de sistema (`-apple-system`, SF Pro), esquinas redondeadas, **modo claro/oscuro automático**, efecto vibrancy/translucidez en Electron, espaciados y controles coherentes, sin saturar.
- **Pantallas:** (1) Onboarding + permisos + aviso legal; (2) Calibración; (3) Panel principal (vista previa de cámara con esqueleto superpuesto opcional, estado de postura, temporizador de sedestación, 3 indicadores clave); (4) Descanso/ejercicio; (5) Estadísticas (tiempo en buena postura por día/semana, nº de avisos, descansos cumplidos, tendencia); (6) Ajustes (cámara, sensibilidad, umbrales, sonidos, intervalos, idioma, inicio con el sistema); (7) Biblioteca de ejercicios.
- **Versión menú de barra (menu bar)** en Electron: icono con estado de color, popover con resumen y accesos rápidos (pausar, posponer, recalibrar).
- La vista previa de cámara puede ocultarse (privacidad y menor distracción); funcionar en segundo plano con la ventana minimizada.
- **Accesibilidad:** contraste AA, no depender solo del color (iconos/texto), navegación por teclado, `aria-live` para avisos, respeto de "reducir movimiento".
- **Idiomas:** español (por defecto) e inglés, con i18n desde el inicio (claves de mensajes con pluralización y formato de fechas/horas por *locale*; ningún texto literal en componentes).
- **Estados de la interfaz:** cada pantalla debe contemplar los estados vacío, cargando, error, sin permiso, sin cámara y modelo no cargado, con mensajes accionables.

## 8. ARQUITECTURA Y TECNOLOGÍA

- **Stack sugerido:** Vite + TypeScript + React (o Svelte) + Zustand/estado ligero; CSS con variables y `prefers-color-scheme`; Web Worker para los temporizadores y, si la medición lo justifica, para el procesamiento (evita el *throttling* de pestañas en segundo plano); PWA opcional con service worker para el uso offline en web. TypeScript en modo `strict`, ESLint, Prettier y CI con lint + tests.
- **Estructura modular** y separada de la UI:
  - `camera/` (acceso y dispositivos), `vision/` (landmarks, filtros), `posture/` (métricas, clasificador, máquina de estados), `alerts/` (sonido, visual, notificaciones), `breaks/` (temporizadores y presencia), `exercises/`, `stats/` (persistencia), `settings/`, `i18n/`, `ui/`.
  - Núcleo de lógica **independiente de DOM/Electron** para poder probarlo con tests unitarios (con fixtures de landmarks).
- **Preparado para Electron desde el día 1:**
  - Capa de abstracción de plataforma (`platform.ts`) para notificaciones, almacenamiento, inicio automático y menu bar; implementación web y Electron.
  - Electron: `contextIsolation: true`, `nodeIntegration: false`, preload con API mínima por IPC, `backgroundThrottling: false` en la ventana que procesa vídeo, Tray/menu bar, notificaciones nativas, `app.setLoginItemSettings` para iniciar con el Mac.
  - **Permisos macOS:** `NSCameraUsageDescription` en `Info.plist`, entitlements (`com.apple.security.device.camera`), hardened runtime, solicitud con `systemPreferences.askForMediaAccess('camera')`.
  - Empaquetado con **electron-builder** (dmg, universal arm64+x64), firma y notarización documentadas (requieren cuenta de Apple Developer: documentar el proceso y dejar un build sin firmar para desarrollo).
  - Cargar la app con un protocolo propio o `file://` controlado, no desde `http://localhost` en producción. La CSP debe permitir WASM (`'wasm-unsafe-eval'`) y bloquear todo lo demás.
  - Una ventana oculta o minimizada que procese vídeo no debe ser suspendida: `backgroundThrottling: false`, evitar App Nap (`powerSaveBlocker` solo cuando sea imprescindible) y escuchar `powerMonitor` (`suspend`, `resume`, `lock-screen`, `unlock-screen`) para pausar el análisis y tratar el bloqueo como ausencia.
  - Informar de que macOS muestra el indicador de cámara activa mientras se analiza, y ofrecer pausar la cámara desde el menu bar.
- **Rendimiento:** limitar fps, pausar el análisis cuando no hay persona/pantalla bloqueada, modelos siempre empaquetados (sin descarga en ejecución). Tamaño del instalador y consumo de memoria medidos y documentados.
- **Seguridad:** CSP estricta, sin telemetría, sin peticiones de red en ejecución (verificable con un test que falle si hay tráfico saliente). Electron: `sandbox: true`, bloquear navegación y `window.open`, validar el emisor y los argumentos de cada mensaje IPC, sin `remote`, sin contenido remoto, dependencias auditadas (`npm audit`) y con licencia compatible (MediaPipe y sus modelos: revisar licencias).
- **Persistencia:** esquema versionado con migraciones, escritura atómica del fichero JSON, copia de seguridad y reinicio controlado si hay datos corruptos. Definir el modelo de datos: `Settings`, `CalibrationProfile`, `SessionSummary` (agregados por intervalo, sin imágenes), `AlertEvent`, `BreakEvent`.

## 8 bis. ERRORES Y CASOS LÍMITE (comportamiento obligatorio)

| Caso | Comportamiento |
|---|---|
| Permiso de cámara denegado/revocado | Pantalla guiada; en macOS, enlace a Ajustes del Sistema > Privacidad > Cámara |
| Cámara en uso por otra app (`NotReadableError`) o inexistente | Reintentos con *backoff*, estado visible, análisis y contador en pausa ("sin datos") |
| Desconexión de la cámara USB | Reconexión automática; si no vuelve, ofrecer otra cámara y exigir calibración del nuevo perfil |
| Fallo de WebGL/WASM/modelo | Fallback a CPU, mensaje claro, sin bloquear temporizadores de descanso |
| Poca luz, contraluz o confianza baja | Suspender avisos de postura y sugerir mejoras |
| Equipo suspendido, bloqueado o tapa cerrada | Tratar como ausencia; al reanudar, recalcular con marcas de tiempo |
| Calibración inválida | Rechazar, explicar el motivo y repetir |
| Datos corruptos o de versión antigua | Migrar o restaurar copia; nunca fallar en silencio |
| Persona distinta o varias personas | Analizar la principal; sugerir recalibrar |

## 8 ter. PRUEBAS

### Tests unitarios (obligatorios, desde la Fase 2)

**Infraestructura:**
- Vitest (versión fijada), entorno `node` para el núcleo (jsdom solo en `ui/`), `fast-check` para tests de propiedad. Scripts `npm test` y `npm run test:coverage`; ambos corren en CI.
- Ficheros `*.test.ts` junto a cada módulo; fixtures en `tests/fixtures/`: landmarks **sintéticos** generados por script con semilla fija y, si se graban, solo landmarks anonimizados (nunca imágenes ni identificadores).
- El núcleo recibe por inyección `Clock` y generador aleatorio (sin `Date.now()`, `Math.random()` ni `setTimeout` directos) para que los tests sean deterministas.
- Requisitos: sin red, sin cámara, sin esperas reales, suite completa < 30 s. Cobertura mínima del núcleo (valor de partida): 90 % líneas / 85 % ramas, con el CI fallando por debajo. Cada bug corregido añade un test de regresión.

**Casos mínimos por módulo:**

| Módulo | Casos mínimos |
|---|---|
| `vision/filters` | Converge ante señal constante; atenúa ruido de σ conocida; respuesta a un escalón dentro de la latencia máxima definida; descarta NaN y landmarks con `visibility` baja; se reinicia tras un hueco de datos |
| `posture/metrics` | CVA/ΔCVA con geometrías de ángulo exacto conocido (p. ej. 45°, 50°, 60°); invariancia a traslación, escala y espejo; modo frontal: las 4 combinaciones de escala facial/escala de hombros (protrusión vs. acercamiento del tronco); pitch, inclinación de hombros y de ojos; landmarks ausentes → resultado `null` explícito, nunca `NaN`; elección del lado visible en modo lateral |
| `posture/calibration` | Acepta una línea base estable; rechaza por movimiento excesivo, confianza baja, landmarks ausentes o varianza alta, con motivo concreto; mediana y σ correctas; umbral efectivo = máx(config, 2σ); sugiere recalibrar ante deriva persistente de la base; selección de perfil por `deviceId` con respaldo por etiqueta y por modo |
| `posture/classifier` | Zonas verde/ámbar/roja con valores exactamente en el límite; aplicación de presets; umbrales relativos (Δ) frente a absolutos informativos |
| `posture/stateMachine` | Cada transición `OK → AVISO_LEVE → MALA_POSTURA → CRÍTICA` con los tiempos de la sección 5; histéresis de salida (≥ 5 s en verde y margen del 20 %); estado independiente por desviación, estado global = el más grave, un único mensaje por prioridad; **pureza** (mismas entradas ⇒ misma salida, sin mutar la entrada); una desviación puntual menor que N s no cambia el estado; saltos grandes de tiempo (suspensión) y marcas no monótonas gestionados sin error |
| `posture/stateMachine` (propiedad) | Con ruido de amplitud ≤ σ alrededor de un valor en zona verde no hay transiciones; con ruido alrededor del umbral el número de oscilaciones queda acotado; resultados reproducibles con semilla |
| `alerts/policy` | Escalado por gravedad (leve = solo visual; mala = mensaje + tono + notificación; crítica = overlay + 2.º tono); enfriamiento; tope diario; horario silencioso (incluido el que cruza medianoche); posponer 15/30/60; No molestar; reducción de frecuencia tras avisos ignorados; `AudioContext` suspendido ⇒ degrada a visual; mapeo gravedad→tono (con `AudioContext` simulado) |
| `breaks/timers` | Con reloj simulado: microdescanso a 30 min, descanso largo a 50–60 min, aviso previo a 2 min, 20-20-20; ausencia ≥ 3 min reinicia el contador; estado "sin datos" pausa y no cuenta como sentado ni como descanso; bloqueo/suspensión = ausencia, con recálculo correcto al reanudar; "Hecho" sin ausencia ⇒ descanso "declarado" (distinto del cumplido); persona de pie no cuenta como sedestación; posponer 5 min; presets Estándar/Sensible/Personalizado |
| `vision/presence` | Presente/ausente con debounce; con varias personas se elige la principal y se sugiere recalibrar ante un cambio brusco; poca luminancia o contraluz suspenden los avisos de postura |
| `stats` y persistencia | Agregación por día/semana; migraciones de cada versión anterior del esquema hasta la actual (fixtures por versión); fallo simulado a mitad de escritura no corrompe el fichero (escritura atómica); datos corruptos ⇒ restauración de copia o reinicio controlado con error visible; exportar JSON/CSV conforme al esquema; borrar todos los datos; **el esquema no admite campos de imagen ni de landmarks crudos** |
| `settings` / `clinical-config` | Validación de esquema; cada umbral declara nivel de confianza (`consenso` / `literatura limitada` / `heurística`); rechazo de valores fuera de rango; valores por defecto aplicados y registrados |
| `exercises` | Cada ejercicio tiene objetivo, pasos, repeticiones, "cuándo parar", precauciones y nivel; los avanzados exigen advertencia aceptada; el preset "Sensible" no muestra los avanzados; el onboarding bloquea ejercicios sin confirmar la ausencia de señales de alerta |
| `i18n` | Todas las claves de `es` existen en `en` y viceversa; pluralización; formato de fecha/hora por *locale*; ningún literal en componentes (regla de lint) |
| Privacidad | Con `fetch`, `XMLHttpRequest`, `WebSocket` y `navigator.sendBeacon` sustituidos por dobles que lanzan error, ningún módulo del núcleo los invoca; ninguna escritura en `localStorage`/IndexedDB/fichero contiene `ImageData`, `Blob`, data-URL ni landmarks |

**Otros tests del núcleo:**
- Tests de datos recogidos en sesiones reales (landmarks anonimizados) deben pasar por los mismos módulos y comparar contra resultados esperados con tolerancia explícita.
- Tests de la capa `platform.ts`: contrato común de las implementaciones web y Electron (mismas pruebas parametrizadas sobre ambas, con dobles).
- Tests de propiedad/ruido: la máquina de estados no debe oscilar ante ruido dentro de σ.
- Tests de integración con cámara simulada (`--use-fake-device-for-media-stream`) y tests E2E de la UI (Playwright) y de Electron.
- Protocolo de validación manual con ≥ 5 personas distintas (gafas, poca luz, cámara frontal y lateral): para cada una, posturas correctas e incorrectas guiadas, registrando aciertos, falsos positivos por hora y latencia.

## 9. ENTREGABLES Y FASES

Trabaja por fases. Al final de cada una, resume lo hecho, qué criterios de "hecho" se cumplen, riesgos abiertos y supuestos nuevos, y **espera confirmación** antes de continuar:

1. **Plan**: arquitectura, decisiones técnicas justificadas, definición clínica de métricas y umbrales, wireframes de baja fidelidad en texto/diagrama.
2. **MVP web**: cámara + selección de dispositivo + pose + calibración + métrica de protrusión/cabeza baja + aviso visual y sonoro + temporizador de descansos.
3. **Completar**: todas las desviaciones, estadísticas, ejercicios, ajustes, i18n, accesibilidad.
4. **Electron**: wrapper, menu bar, permisos macOS, inicio automático, empaquetado.
5. **QA**: tests unitarios del núcleo, pruebas con distintas cámaras/luz/gafas, checklist de privacidad y de rendimiento.

**Definición de "hecho" por fase:**
- Fase 1: documento de arquitectura, `clinical-config` con umbrales y confianza, modelo de datos, wireframes, lista de riesgos y spikes técnicos pendientes (p. ej. hilos, variante de modelo).
- Fase 2: la app arranca con `npm install && npm run dev`, calibra, detecta protrusión/cabeza baja y avisa; tests unitarios del núcleo (sección 8 ter) en verde con la cobertura mínima exigida; sin peticiones de red.
- Fase 3: todas las desviaciones, estadísticas, ejercicios, ajustes, i18n y accesibilidad (auditoría con axe/Lighthouse sin errores críticos).
- Fase 4: `.dmg` universal funcional, permisos de cámara correctos, menu bar, inicio automático, comportamiento verificado con ventana oculta y tras suspensión.
- Fase 5: informe de QA con métricas medidas (incluido el informe de cobertura de los tests unitarios), checklist de privacidad y de rendimiento completados.

Entrega: código comentado solo donde aporte contexto, `README` con instrucciones de instalación/ejecución/empaquetado, `docs/CLINICAL.md` (criterios clínicos, fuentes y límites), `docs/PRIVACY.md`, `docs/ASSUMPTIONS.md` y `CHANGELOG`.

## 10. CRITERIOS DE ACEPTACIÓN

- Detecta (tras calibrar) protrusión cefálica, cabeza baja y encorvamiento en modo frontal, y ΔCVA en modo lateral, con **sensibilidad ≥ 85 %** sobre posturas incorrectas guiadas y **≤ 1 falso positivo por hora** con postura correcta, medidos con el protocolo de la sección 8 ter. Si no se alcanza, se documenta con datos y no se oculta.
- El aviso sonoro y visual se dispara solo tras postura incorrecta sostenida, y no se repite de forma molesta.
- Los descansos se avisan según los intervalos configurados y se reinician con la ausencia.
- Funciona offline, sin enviar imágenes fuera, y se puede cambiar de cámara en caliente.
- La misma base de código funciona como web y como app macOS vía Electron.
- La interfaz es coherente con macOS, con modo oscuro y accesible.
- CPU media < 15 % en Apple Silicon con el procedimiento definido; latencia fotograma→métrica < 200 ms.
- Un test automático confirma que no hay tráfico de red saliente ni almacenamiento de imágenes.
- La suite de tests unitarios del núcleo (sección 8 ter) pasa en CI, es determinista, tarda < 30 s y cumple la cobertura mínima.
- El usuario puede exportar y borrar todos sus datos.
- Las pautas de seguridad clínica y el aviso de no ser producto sanitario aparecen en el onboarding y en "Acerca de".

## 11. FORMA DE RESPONDER

Empieza por la **Fase 1**. Antes de escribir código, haz como máximo **5 preguntas** imprescindibles (por ejemplo: framework preferido, si usará mayoritariamente cámara frontal o lateral, sistema operativo mínimo de macOS, si hay cuenta de Apple Developer para firmar, si hay alguien que pueda validar clínicamente los umbrales) y propón un valor por defecto para cada una (por defecto: React, cámara frontal con lateral opcional, macOS 12+, sin firma, umbrales sin validar y marcados como tales) para poder continuar si no respondo.

Formato de cada respuesta: 1) resumen de decisiones, 2) justificación clínica en lenguaje claro y técnica concisa, 3) riesgos y supuestos nuevos, 4) siguiente paso propuesto. Distingue siempre entre lo **verificado**, lo **supuesto** y lo **pendiente de validar**.
