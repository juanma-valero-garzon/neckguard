# Supuestos

Respuestas por defecto a las preguntas de la Fase 1 (no hubo respuesta del usuario):

| #   | Pregunta              | Supuesto aplicado                                                            |
| --- | --------------------- | ---------------------------------------------------------------------------- |
| 1   | Framework             | React 19 + Vite + Zustand                                                    |
| 2   | Cámara                | Frontal por defecto, lateral opcional                                        |
| 3   | macOS mínimo          | 12 (Monterey)                                                                |
| 4   | Firma Apple Developer | No; build sin firmar (`identity: null`), proceso documentado en PACKAGING.md |
| 5   | Validación clínica    | Umbrales **sin validar**, marcados como tales en UI y docs                   |

Supuestos técnicos y de producto:

- **Matriz facial** de Face Landmarker: columna-mayor, convención OpenGL (+z hacia la cámara); `pitch = atan2(-m[9], m[10])` (+ = abajo). Sin verificar con cámara real; la calibración absorbe un signo/offset constante pero no una inversión de sentido → **verificar**.
- Proxy nariz-ojos → grados (140°/unidad) y proxy de guiñada (100°/unidad): heurísticos (geometría facial aproximada).
- C7 estimado con desplazamiento del hombro de 0.2×(oreja-hombro): heurístico.
- Un hueco entre pasos de temporizador > 30 s se interpreta como suspensión del equipo (= ausencia).
- Estar de pie (si está activado) se trata como ausencia a efectos de descanso y suprime avisos de postura.
- El nivel de postura solo baja por verde sostenido (no por mejoras parciales).
- Detección automática de «No molestar» por compartición de pantalla/pantalla completa **no implementada** (no es detectable de forma fiable sin APIs privadas); solo DND manual y horario silencioso.
- Fuentes: tipografía del sistema (`-apple-system`), sin ficheros de fuente empaquetados.
- **Parpadeo** (opcional): requiere Face Landmarker con blendshapes, cámara frontal u oblicua (no lateral) y ≥ 15 fps, por lo que anula el ahorro adaptativo por debajo de ese ritmo. Gafas con reflejos, poca luz o mirar hacia abajo pueden dar falsos negativos; umbrales sin verificar con cámara real.
- Lado visible en modo lateral: automático por visibilidad; el usuario puede fijarlo.
- La variante de modelo es `lite`; sin el spike medido no se ha decidido otra.
- Notificaciones web: requieren permiso del navegador; en Electron se usan las nativas.
- Licencias de MediaPipe/modelos: se asume Apache-2.0 según el proveedor; pendiente de revisión.
- La app es un solo ámbito de usuario por equipo (un perfil de datos).
- Estadísticas (todos heurísticos, en `clinical-config.ts › statistics`): una ausencia < 30 s no cuenta como pausa; una ausencia ≥ 3 min (`resetAfterAbsentMs`) corta un bloque sentado; sedestación prolongada ≥ 60 min; fiabilidad alta ≥ 60 min sentado y ≥ 70 % de cobertura, baja ≥ 15 min y ≥ 30 %; objetivo orientativo ≥ 80 % de buena postura; una franja horaria cuenta con ≥ 5 min sentado.
- La cobertura excluye las pausas (ausente, de pie, bloqueado, en pausa): solo penaliza lo sentado sin analizar y la cámara sin imagen.
- Un aviso se marca como ignorado si la postura no vuelve a OK en 10 min; si el usuario se va antes, no se concluye nada.
- Si la app se cierra de forma abrupta, la ausencia o el bloque sentado en curso no se registran (los tiempos por intervalo sí).
- Los avisos, descansos, ausencias y bloques usan el desfase horario actual para asignarse a un día; las sesiones nuevas guardan el suyo.
- Las pautas son orientativas, no consejo médico; los ejercicios sugeridos respetan el bloqueo por señales de alerta.
- Tipos TypeScript 5.9 (no 7.x) por compatibilidad con typescript-eslint.
