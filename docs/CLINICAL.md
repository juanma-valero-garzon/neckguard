# Criterios clínicos, fuentes y límites

> **Aviso.** NeckGuard no es un producto sanitario. Todos los umbrales son **valores de partida sin validar clínicamente**; deben ser revisados por un/a fisioterapeuta humano/a antes de un uso real (`clinicianReviewed: false` en `src/settings/clinical-config.ts`).

## Principios

- **La mejor postura es la siguiente postura**: se penaliza la desviación **sostenida**, no el desvío puntual (cronómetros + histéresis).
- Los umbrales son **Δ respecto a la línea base personal**, nunca absolutos, y siempre ≥ 2σ del ruido medido en la calibración.
- El CVA absoluto (≈ 48–50°, la literatura varía) es solo **referencia informativa**.
- Si la limitación técnica impide el criterio clínico, se **degrada y se informa** (no se simula).

## Desviaciones (por prioridad) y umbrales de partida

Todos con confianza `heurística` (ver el fichero de configuración, que es la única fuente).

| Desviación                 | Frontal (ámbar / rojo)                                                  | Lateral                                             |
| -------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| Cabeza adelantada          | +6 % / +12 % de escala facial relativa a hombros                        | ΔCVA aprox. 5° / 10°                                |
| Cabeza baja                | Δcabeceo 8° / 15° (Face Landmarker; proxy nariz-ojos ×140°/u si no hay) | Δángulo oreja-nariz 8° / 15°                        |
| Encorvamiento              | Descenso del tronco 6 % / 12 % del ancho de hombros                     | Δinclinación hombro-cadera 6° / 12° (si hay cadera) |
| Hombros elevados           | Acortamiento cuello-hombro 6 % / 12 %                                   | — (no medible)                                      |
| Asimetría de hombros       | Δinclinación 3° / 6°                                                    | —                                                   |
| Inclinación lateral cabeza | Δ línea de ojos 6° / 10°                                                | —                                                   |
| Rotación cabeza            | Δyaw 15° / 25° (proxy ×100°/u si no hay Face Landmarker)                | —                                                   |
| Proximidad a pantalla      | +10 % / +20 % escala de hombros                                         | —                                                   |

### Aproximaciones y sesgos documentados

- **CVA**: MediaPipe no detecta trago ni C7. Se usa oreja–hombro con C7 estimado (hombro desplazado hacia atrás 0.2×distancia oreja-hombro). Equivale a un CVA clínico solo en tendencia → se usa **ΔCVA**.
- **Frontal**: acercarse a la pantalla vs adelantar la cabeza se separa combinando escala facial y de hombros (protrusión = faceRel/shoulderRel − 1; proximidad = shoulderRel − 1).
- **Encorvamiento/hombros (frontal)**: asume cámara y silla fijas. Descenso global del tronco ⇒ encorvamiento; acortamiento cuello–hombro con tronco estable ⇒ hombros elevados.
- Cámara por encima/debajo de los ojos: sesgo constante absorbido por la calibración; si se mueve, recalibrar.
- Modo lateral: se usa solo Pose y el lado visible (detectado o elegido); la calibración rechaza cámaras de frente (`badPlacement`).
- **Modo ladeado** (portátil junto a una pantalla adicional, vista de tres cuartos): usa el lado más visible (se fija el de la calibración para que no oscile) y medidas relativas a la base. El escorzo reduce la sensibilidad del ΔCVA (umbral 4°/8° en vez de 5°/10°). Encorvamiento y hombros elevados se miden con la altura de oreja y hombro del lado visible, en % de la distancia oreja-hombro de la base (10 %/20 %). Cabeceo: Face Landmarker o ángulo oreja-nariz. Rotación solo con Face Landmarker. **No se evalúan** asimetría de hombros ni proximidad (la perspectiva las falsea). Se calibra mirando a la pantalla de trabajo habitual; si se mueve la pantalla o el portátil, recalibrar. Umbrales **heurísticos y sin validar**.

## Máquina de estados y tiempos (heurísticos)

AVISO_LEVE ≥10 s ámbar · MALA_POSTURA ≥20 s rojo o ≥2 min ámbar · CRÍTICA ≥5 min rojo · salida: ≥5 s en verde con margen del 20 %.

## Descansos (ergonomía; heurísticos)

Estándar: microdescanso 30 min (1–2 min, retracción cervical), largo 55 min (5 min, caminar/hidratarse/movilidad), aviso previo 2 min, regla 20-20-20 opcional, ausencia ≥3 min = descanso cumplido. **Sensible**: 20/45 min, umbrales ×0,8, sin ejercicios avanzados. «Hecho» sin ausencia ni cuenta atrás completada = **declarado** (se distingue en estadísticas). Sin datos de cámara ≠ ausencia: el contador se pausa.

## Parpadeo e hidratación ocular (opcional; heurístico)

Con la monitorización activada se cuenta el parpadeo (blendshapes `eyeBlinkLeft/Right` del Face Landmarker, histéresis 0,5/0,3; un cierre > 600 ms no cuenta) en una ventana de 60 s, con al menos 45 s de medida válida. En reposo se admiten ~15–20 parpadeos/min y frente a pantallas baja a ~5–7 (literatura limitada). Se sugiere hidratar (parpadeo consciente, mirar lejos, lágrimas artificiales) si la frecuencia está **< 10/min durante ≥ 3 min**, como máximo una vez cada 20 min; respeta DND, horario silencioso y posponer. Los valores están en `CLINICAL_CONFIG.blink` y no están validados clínicamente. No es un diagnóstico de ojo seco.

## Ejercicios

Retracción cervical (básico), retracción con extensión y extensión de cuello sentado (ambos **avanzados**, requieren aceptar advertencia; ocultos en «Sensible»), extensión torácica, movilidad de hombros, rodillo lumbar. Cada uno: objetivo, pasos, repeticiones, cuándo parar, precauciones, nivel. Sin sobrepresión ni rotaciones forzadas. **Regla de seguridad**: si el síntoma se extiende al brazo o la mano, o empeora ⇒ parar; si disminuye o desaparece ⇒ continuar. Los ejercicios están bloqueados hasta confirmar en el onboarding que no hay señales de alerta (dolor irradiado, hormigueo, debilidad, mareo, alteraciones visuales, dolor que empeora/nocturno/constante, traumatismo reciente, fiebre, pérdida de esfínteres).

## Pendiente de validación clínica

Todos los umbrales; los tiempos de la máquina de estados; las pautas de pausa; el texto de los ejercicios; los factores de proxy (`noseDropDegPerUnit`, `yawDegPerUnit`, `c7OffsetRatio`).
