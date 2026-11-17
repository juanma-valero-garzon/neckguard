// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

// Catálogo en español (idioma por defecto). Las claves con sufijo .one/.other son variantes plurales.
export const es = {
  'app.name': 'NeckGuard',
  'app.tagline': 'Monitor local de postura cervical y descansos. Todo se procesa en tu equipo.',

  'common.back': 'Atrás',
  'common.next': 'Siguiente',
  'common.cancel': 'Cancelar',
  'common.close': 'Cerrar',
  'common.retry': 'Reintentar',
  'common.loading': 'Cargando…',
  'common.skip': 'Saltar al contenido',

  'nav.label': 'Navegación principal',
  'nav.main': 'Panel',
  'nav.stats': 'Estadísticas',
  'nav.exercises': 'Ejercicios',
  'nav.settings': 'Ajustes',
  'nav.about': 'Acerca de',

  'level.OK': 'Postura correcta',
  'level.AVISO_LEVE': 'Aviso leve',
  'level.MALA_POSTURA': 'Mala postura',
  'level.CRITICA': 'Postura crítica',

  'suppressed.notCalibrated': 'Sin calibrar: aún no se evalúa tu postura.',
  'suppressed.paused': 'Análisis en pausa.',
  'suppressed.locked': 'Equipo bloqueado o suspendido.',
  'suppressed.noData': 'Sin datos de la cámara.',
  'suppressed.absent': 'No se detecta a nadie frente a la cámara.',
  'suppressed.lowLight': 'Poca luz: avisos de postura suspendidos.',
  'suppressed.backlit': 'Contraluz: avisos de postura suspendidos.',
  'suppressed.lowConfidence': 'Detección poco fiable: avisos de postura suspendidos.',
  'suppressed.standing': 'Estás de pie: no cuenta como sedestación.',
  'suppressed.help.notCalibrated': 'Calibra para que la app conozca tu postura de referencia.',
  'suppressed.help.noData': 'Comprueba que la cámara no esté tapada ni en uso por otra aplicación.',
  'suppressed.help.lowLight': 'Enciende una luz frontal suave para mejorar la detección.',
  'suppressed.help.backlit': 'Evita tener una ventana o foco detrás de ti; coloca la luz delante.',
  'suppressed.help.lowConfidence': 'Asegúrate de que se vean tu cabeza y tus hombros completos.',
  'suppressed.help.standing': 'Vuelve a sentarte para reanudar el análisis.',

  'deviation.protrusion': 'Cabeza adelantada',
  'deviation.headDown': 'Cabeza baja',
  'deviation.slouch': 'Encorvamiento',
  'deviation.shoulderElevation': 'Hombros elevados',
  'deviation.shoulderAsymmetry': 'Asimetría de hombros',
  'deviation.headTilt': 'Inclinación lateral de la cabeza',
  'deviation.headRotation': 'Rotación de la cabeza',
  'deviation.proximity': 'Demasiado cerca de la pantalla',

  'alert.notification.title': 'NeckGuard',
  'alert.msg.protrusion': 'Retrae la barbilla y lleva la cabeza hacia atrás, sobre los hombros.',
  'alert.msg.headDown': 'Sube la mirada y recoge ligeramente la barbilla.',
  'alert.msg.slouch': 'Siéntate más atrás y estira la espalda con suavidad.',
  'alert.msg.shoulderElevation': 'Relaja los hombros y déjalos caer.',
  'alert.msg.shoulderAsymmetry': 'Nivela los hombros y reparte el peso por igual.',
  'alert.msg.headTilt': 'Endereza la cabeza.',
  'alert.msg.headRotation': 'Gira la cabeza hacia la pantalla.',
  'alert.msg.proximity': 'Aléjate un poco de la pantalla.',
  'alert.msg.generic': 'Revisa tu postura: espalda erguida, hombros relajados y cabeza sobre los hombros.',

  'toast.positive': 'Bien hecho: postura corregida.',
  'toast.audioSuspended':
    'El sonido está bloqueado por el navegador; los avisos serán solo visuales hasta que interactúes con la app.',
  'toast.suggestSensitivity':
    'Parece que los avisos no te resultan útiles. Puedes ajustar la sensibilidad en Ajustes.',
  'toast.hydration':
    'Estás parpadeando poco: parpadea de forma consciente varias veces, aparta la vista de la pantalla y, si notas sequedad, usa lágrimas artificiales.',
  'toast.snoozed.one': 'Avisos pospuestos {count} minuto.',
  'toast.snoozed.other': 'Avisos pospuestos {count} minutos.',
  'toast.breakSoon.one': 'Descanso en {count} minuto.',
  'toast.breakSoon.other': 'Descanso en {count} minutos.',
  'toast.breakSnoozed.one': 'Descanso pospuesto {count} minuto.',
  'toast.breakSnoozed.other': 'Descanso pospuesto {count} minutos.',
  'toast.eye': 'Regla 20-20-20: mira a lo lejos (6 m) durante 20 segundos.',
  'toast.breakByAbsence': 'Descanso cumplido: has estado fuera. El contador se ha reiniciado.',
  'toast.break.completed': 'Descanso cumplido. ¡Buen trabajo!',
  'toast.break.declared': 'Descanso registrado como declarado (sin ausencia ni ejercicio guiado).',
  'toast.break.skipped': 'Descanso saltado.',

  'legal.notMedical':
    'NeckGuard no es un producto sanitario: no diagnostica ni trata. Es una ayuda ergonómica general. Los umbrales son valores de partida sin validar clínicamente.',

  'onboarding.step': 'Paso {current} de {total}',
  'onboarding.welcome.title': 'Bienvenido/a a NeckGuard',
  'onboarding.welcome.body':
    'Usa tu cámara para vigilar la postura del cuello y los hombros y recordarte los descansos, con avisos visuales y sonoros poco intrusivos.',
  'onboarding.privacy.1': 'Todo el procesamiento es local: ningún fotograma sale de tu equipo.',
  'onboarding.privacy.2': 'No se guarda vídeo ni imágenes; solo métricas agregadas.',
  'onboarding.privacy.3': 'Sin cuentas, sin telemetría y sin conexión a internet durante el uso.',
  'onboarding.legal.accept': 'He leído y entiendo que esta aplicación no es un producto sanitario.',
  'onboarding.redflags.title': 'Señales de alerta',
  'onboarding.redflags.intro':
    'Antes de usar los ejercicios, confirma que no tienes ninguna de estas señales:',
  'onboarding.redflags.action':
    'Si aparece cualquiera de ellas, suspende los ejercicios y consulta con un profesional sanitario (urgencias si es grave o de inicio súbito).',
  'onboarding.redflags.confirm': 'Confirmo que no presento ninguna de estas señales de alerta.',
  'onboarding.redflags.skipHint':
    'Sin esta confirmación el monitor de postura funciona, pero los ejercicios quedan bloqueados.',
  'onboarding.camera.title': 'Cámara y modo de uso',
  'onboarding.camera.body':
    'Elige cómo está colocada tu cámara y concede el permiso. La imagen no se guarda en ningún momento.',
  'onboarding.camera.allow': 'Permitir cámara',
  'onboarding.camera.ok': 'Cámara lista.',
  'onboarding.alerts.title': 'Sonido y notificaciones',
  'onboarding.alerts.body':
    'Prueba el sonido (el navegador exige un gesto tuyo para activarlo) y habilita las notificaciones si lo deseas.',
  'onboarding.alerts.testSound': 'Probar sonido',
  'onboarding.alerts.enableNotifications': 'Activar notificaciones',
  'onboarding.finish': 'Terminar y calibrar',

  'redflag.arm': 'Dolor que se irradia al brazo o a la mano.',
  'redflag.tingling': 'Hormigueo o adormecimiento en brazos o manos.',
  'redflag.weakness': 'Debilidad en brazos o piernas.',
  'redflag.dizzy': 'Mareos.',
  'redflag.vision': 'Alteraciones visuales.',
  'redflag.worse': 'Dolor que empeora, constante o que te despierta por la noche.',
  'redflag.trauma': 'Dolor tras un traumatismo reciente.',
  'redflag.fever': 'Fiebre junto con dolor de cuello.',
  'redflag.sphincter': 'Pérdida de control de esfínteres.',

  'mode.frontal': 'Frontal (la cámara te mira de frente)',
  'mode.lateral': 'Lateral (la cámara está a un lado, de perfil)',
  'mode.frontal.desc':
    'Válido para la cámara del portátil o una USB colocada de frente. Calibración personal y métricas relativas; precisión moderada.',
  'mode.lateral.desc':
    'Válido para la cámara del portátil o una USB colocada de perfil. Mide el ángulo oreja-hombro (aproximación del CVA); recomendado con dolor cervical.',
  'mode.frontal.short': 'Modo frontal: precisión moderada, basada en cambios respecto a tu calibración.',
  'mode.lateral.short': 'Modo lateral: precisión superior para cabeza adelantada (ΔCVA aproximado).',
  'mode.oblique': 'Ladeado (portátil junto a otra pantalla)',
  'mode.oblique.desc':
    'Posición típica del portátil cuando usas una pantalla adicional: la cámara te ve en ángulo (de tres cuartos). Combina el lado más visible con medidas relativas a tu calibración; precisión intermedia.',
  'mode.oblique.short':
    'Modo ladeado: precisión intermedia; el escorzo reduce la sensibilidad y se compensa con tu calibración.',
  'calibration.place.oblique':
    'Deja el portátil (o la cámara) donde lo usas habitualmente y mira a tu pantalla de trabajo con tu postura de siempre. Deben verse tu cabeza y, al menos, el hombro más cercano a la cámara. Si mueves la pantalla o el portátil, recalibra.',
  'mode.perCamera':
    'El modo se recuerda para cada cámara: tanto la del portátil como una USB pueden usarse de frente o de perfil.',
  'mode.accuracy':
    'Una cámara frontal no puede medir el ángulo craneovertebral real; el modo lateral es el más preciso (recomendado con dolor cervical) y el ladeado ofrece una precisión intermedia.',

  'camera.error.denied':
    'Permiso de cámara denegado. Concédelo en Ajustes del Sistema > Privacidad y seguridad > Cámara.',
  'camera.error.notFound': 'No se encuentra ninguna cámara. Conéctala o elige otra.',
  'camera.error.busy': 'La cámara está en uso por otra aplicación. Reintentando automáticamente…',
  'camera.error.overconstrained': 'La cámara no admite la resolución solicitada.',
  'camera.error.insecure': 'El navegador bloquea la cámara en este contexto (se requiere HTTPS o localhost).',
  'camera.error.unknown': 'No se pudo iniciar la cámara.',
  'camera.openSettings': 'Abrir ajustes de cámara',
  'camera.reconnecting.one': 'Cámara desconectada. Reconectando (intento {count})…',
  'camera.reconnecting.other': 'Cámara desconectada. Reconectando (intento {count})…',
  'camera.starting': 'Iniciando cámara…',
  'camera.idle': 'La cámara está apagada.',
  'camera.start': 'Iniciar cámara',
  'model.loading': 'Cargando modelo de detección…',
  'model.error':
    'No se pudo cargar el modelo de detección. Los temporizadores de descanso siguen funcionando.',
  'model.cpu': 'Sin aceleración gráfica: se usa la CPU (más lento).',
  'preview.hidden': 'Vista previa oculta (el análisis continúa)',

  'calibration.title': 'Calibración',
  'calibration.step1.title': 'Prepárate',
  'calibration.step2.title': 'Capturando tu postura de referencia',
  'calibration.step3.title': 'Listo',
  'calibration.instr.1': 'Siéntate erguido/a, con la espalda apoyada.',
  'calibration.instr.2': 'Retrae ligeramente la barbilla, con la mirada al frente.',
  'calibration.instr.3': 'Relaja los hombros y quédate quieto/a unos 5 segundos.',
  'calibration.place.frontal':
    'Coloca la cámara de frente, aproximadamente a la altura de tus ojos. Si la mueves después, recalibra.',
  'calibration.place.lateral':
    'Coloca la cámara (o gira el portátil) a un lado, perpendicular a tu plano sagital y a la altura de hombros y cuello. Debe verse un solo lado de tu cuerpo.',
  'calibration.notReady': 'Aún no se detecta a una persona. Colócate frente a la cámara.',
  'calibration.start': 'Calibrar',
  'calibration.hold': 'Mantén la postura sin moverte.',
  'calibration.progress': 'Progreso de la captura',
  'calibration.done': 'Calibración guardada para esta cámara y este modo.',
  'calibration.done.note':
    'Los umbrales se expresan como cambios respecto a esta postura y ya tienen en cuenta el ruido medido.',
  'calibration.redo': 'Recalibrar',
  'calibration.finish': 'Ir al panel',
  'calibration.fail.tooFewSamples':
    'No se capturaron suficientes fotogramas. Asegúrate de estar visible y repite.',
  'calibration.fail.lowConfidence':
    'La detección es poco fiable (poca luz, contraluz u oclusión). Mejora la iluminación y repite.',
  'calibration.fail.missingLandmarks':
    'No se ven todos los puntos necesarios (hombros, ojos u orejas). Ajusta la cámara y repite.',
  'calibration.fail.excessiveMovement': 'Te moviste demasiado durante la captura. Quédate quieto/a y repite.',
  'calibration.fail.highVariance':
    'La medición es demasiado inestable para fijar umbrales fiables. Mejora la luz o la posición de la cámara.',
  'calibration.fail.badPlacement':
    'La cámara parece estar de frente en modo lateral. Colócala a un lado, de perfil.',

  'card.collapse': 'Contraer sección',
  'card.expand': 'Expandir sección',
  'dashboard.camera': 'Cámara',
  'dashboard.hidePreview': 'Ocultar vista previa',
  'dashboard.showPreview': 'Mostrar vista previa',
  'dashboard.status': 'Estado',
  'dashboard.allGood': 'Todo en orden. Recuerda variar de postura con frecuencia.',
  'dashboard.needsCalibration': 'Falta la calibración de esta cámara y modo.',
  'dashboard.deviceChanged': 'Se ha detectado una cámara distinta a la guardada: calibra su perfil.',
  'dashboard.suggestRecalibrate':
    'Varias métricas llevan minutos fuera de lo normal. ¿Ha cambiado la silla, la cámara o la altura? Recalibra.',
  'dashboard.personChanged':
    'Se ha detectado un cambio brusco de persona o de posición. Recalibra si es necesario.',
  'dashboard.soundSuspended': 'El sonido está desactivado hasta que interactúes con la app.',
  'dashboard.enableSound': 'Activar sonido',
  'dashboard.indicators': 'Indicadores clave (cambio respecto a tu base)',
  'dashboard.moreIndicators': 'Más indicadores',
  'dashboard.cvaInfo': 'CVA aproximado: {cva}° (solo informativo; no es un veredicto).',
  'dashboard.sitting': 'Tiempo sentado',
  'dashboard.blink': 'Parpadeo',
  'dashboard.blink.rate': '{rate} parpadeos/min',
  'dashboard.blink.measuring': 'Midiendo…',
  'dashboard.sittingRing': 'Progreso hasta el próximo descanso',
  'dashboard.nextBreak': 'Próximo descanso ({kind}) en {time}',
  'dashboard.breakPending': 'Tienes un descanso pendiente.',
  'dashboard.takeBreak': 'Hacer el descanso',
  'dashboard.controls': 'Controles',
  'dashboard.pause': 'Pausar cámara',
  'dashboard.resume': 'Reanudar',
  'dashboard.pausedTag': 'En pausa',
  'dashboard.snooze': 'Posponer {count} min',
  'dashboard.dnd': 'No molestar',
  'dashboard.hypervigilance': 'Hipervigilancia',
  'settings.hypervigilance.hint':
    'OFF: sin aviso sonoro por mala postura, y la miniatura solo muestra el tiempo hasta la pausa.',

  'break.kind.micro': 'micro',
  'break.kind.long': 'largo',
  'break.title.micro': 'Microdescanso',
  'break.title.long': 'Descanso largo',
  'break.body.micro': 'Levántate o cambia de posición durante 1–2 minutos y haz la retracción cervical.',
  'break.body.long': 'Camina unos 5 minutos, hidrátate y haz movilidad de hombros y extensión torácica.',
  'break.noExercise': 'Confirma las señales de alerta en el onboarding para ver ejercicios sugeridos.',
  'break.start': 'Empezar cuenta atrás',
  'break.done': 'Hecho',
  'break.snooze': 'Posponer {count} min',
  'break.skip': 'Saltar',
  'break.doneHint':
    '«Hecho» cuenta como cumplido solo si te has ausentado o has completado la cuenta atrás; si no, se registra como declarado.',
  'break.notification.title.micro': 'Microdescanso',
  'break.notification.title.long': 'Descanso largo',
  'break.notification.body.micro': 'Llevas un rato sentado/a: levántate un momento.',
  'break.notification.body.long': 'Toca un descanso largo: camina y estira.',

  'stats.title': 'Estadísticas',
  'stats.empty': 'Aún no hay datos. Usa la app un rato y vuelve.',
  'stats.goodByDay': 'Tiempo en buena postura por día',
  'stats.trend.none': 'Aún no hay datos suficientes para una tendencia.',
  'stats.trend.up': 'Tendencia: {value} puntos porcentuales mejor que la semana anterior.',
  'stats.trend.down': 'Tendencia: {value} puntos porcentuales peor que la semana anterior.',
  'stats.goodTime': 'Buena postura (7 días)',
  'stats.analysed': 'Tiempo analizado: {time}',
  'stats.alerts': 'Avisos',
  'stats.last7': 'Últimos 7 días',
  'stats.breaks': 'Descansos cumplidos',
  'stats.breaksDetail': 'Declarados: {declared} · Saltados: {skipped}',
  'stats.topDeviations': 'Desviaciones más frecuentes',
  'stats.noDeviations': 'Sin desviaciones registradas.',
  'stats.weeks': 'Semanas',
  'stats.period.day': 'Día',
  'stats.period.week': 'Semana',
  'stats.period.month': 'Mes',
  'stats.prev': 'Anterior',
  'stats.next': 'Siguiente',
  'stats.noPeriodData': 'No hay datos en este periodo.',
  'stats.good': 'Buena postura',
  'stats.delta.up': '+{value} puntos respecto al periodo anterior',
  'stats.delta.down': '−{value} puntos respecto al periodo anterior',
  'stats.delta.same': 'Igual que el periodo anterior',
  'stats.delta.none': 'Sin comparación: faltan datos suficientes en alguno de los periodos.',
  'stats.reliability.high': 'Fiabilidad alta',
  'stats.reliability.low': 'Fiabilidad baja',
  'stats.reliability.insufficient': 'Datos insuficientes',
  'stats.reliability.help':
    'La fiabilidad depende del tiempo sentado y analizado y de la parte del tiempo que se pudo analizar.',
  'stats.presence': 'Presencia',
  'stats.blink': 'Parpadeo',
  'stats.blink.rate': 'Media: {rate} parpadeos/min',
  'stats.blink.low': '{value} % del tiempo medido por debajo de la frecuencia sugerida.',
  'stats.seated': 'Sentado y analizado: {time}',
  'stats.away': 'Fuera de la silla: {time}',
  'stats.awayCount': 'Pausas: {count} · la más larga: {longest}',
  'stats.longestBlock': 'Mayor tiempo seguido sentado/a: {time}',
  'stats.coverage': 'Parte del tiempo analizada: {value} %',
  'stats.awayNote':
    'El tiempo fuera de la silla (ausente, de pie o con el equipo bloqueado) no cuenta como buena ni como mala postura.',
  'stats.notAnalysed': 'Tiempo sin analizar',
  'stats.cause.absent': 'Ausente (nadie delante de la cámara)',
  'stats.cause.standing': 'De pie',
  'stats.cause.locked': 'Equipo bloqueado o suspendido',
  'stats.cause.paused': 'Análisis en pausa',
  'stats.cause.nodata': 'Cámara sin imagen',
  'stats.cause.light': 'Poca luz, contraluz o baja confianza',
  'stats.cause.notCalibrated': 'Sin calibrar',
  'stats.cause.unknown': 'Causa desconocida (datos antiguos)',
  'stats.byDay': 'Buena postura por día',
  'stats.heatmap': 'Buena postura por hora',
  'stats.heatmap.none': 'Aún no hay datos por hora suficientes.',
  'stats.heatmap.cell': '{hour}:00 — {value} % buena postura',
  'stats.heatmap.cellNone': '{hour}:00 — sin datos suficientes',
  'stats.hour.title': 'Resumen de la hora {hour}:00',
  'stats.hour.good': 'Buena postura',
  'stats.hour.mild': 'Aviso leve',
  'stats.hour.bad': 'Mala postura',
  'stats.hour.critical': 'Postura crítica',
  'stats.hour.away': 'Fuera de la silla',
  'stats.day.title': 'Resumen del día {date}',
  'stats.day.close': 'Cerrar detalle',

  'advice.title': 'Pautas para mejorar',
  'advice.none': 'No hay pautas por ahora: sigue así.',
  'advice.disclaimer':
    'Pautas orientativas calculadas con tus datos; no son consejo médico. Si tienes dolor persistente, consulta con un/a profesional.',
  'advice.exercise': 'Ejercicio sugerido: {name}.',
  'advice.insufficientData':
    'Solo hay {minutes} min de tiempo sentado y analizado: es poco para sacar conclusiones sobre tu postura.',
  'advice.lowCoverage':
    'Solo se ha podido analizar el {coverage} % del tiempo en que estabas delante del equipo.',
  'advice.lowCoverage.light': 'Revisa la iluminación: la poca luz o el contraluz impiden analizar.',
  'advice.lowCoverage.calibration': 'Calibra tu postura para que se pueda analizar.',
  'advice.lowCoverage.camera': 'Comprueba que la cámara está activa, bien encuadrada y sin obstáculos.',
  'advice.dominantDeviation':
    '{deviation} concentra el {share} % de tu tiempo en mala postura: empieza por corregir esta.',
  'advice.tip.protrusion':
    'Sube la pantalla a la altura de los ojos, apoya la espalda en el respaldo y recoge ligeramente la barbilla.',
  'advice.tip.headDown':
    'Sube la pantalla o el portátil hasta que el borde superior quede a la altura de los ojos.',
  'advice.tip.slouch':
    'Apoya la zona lumbar en el respaldo y siéntate con la pelvis hacia atrás; un pequeño cojín lumbar puede ayudar.',
  'advice.tip.shoulderElevation':
    'Relaja los hombros y apoya los antebrazos en la mesa o en los reposabrazos.',
  'advice.tip.shoulderAsymmetry': 'Centra el teclado y el ratón y evita cargar el peso sobre un solo lado.',
  'advice.tip.headTilt': 'Coloca la pantalla de frente y evita sujetar el teléfono con el hombro.',
  'advice.tip.headRotation': 'Coloca la pantalla principal frente a ti y los demás monitores a los lados.',
  'advice.tip.proximity': 'Aléjate de la pantalla hasta una distancia aproximada de un brazo.',
  'advice.worstHour':
    'Hacia las {hour}:00 es cuando peor postura mantienes ({good} % buena): programa una pausa justo antes.',
  'advice.worstWeekday': 'El día con peor postura suele ser {weekday} ({good} % buena).',
  'advice.fatigue':
    'Tu postura empeora a lo largo de la jornada ({drop} puntos menos en la segunda mitad): añade pausas por la tarde.',
  'advice.longSitting':
    'Has estado hasta {longest} min seguidos sentado/a. Levántate y muévete unos minutos antes de continuar.',
  'advice.fewPauses':
    'Haces {perHour} pausas por hora sentado/a. Levantarte con más frecuencia ayuda a variar de postura.',
  'advice.goodMovement': 'Buen hábito: has hecho {count} pausas fuera de la silla.',
  'advice.skippedBreaks':
    'Has saltado el {share} % de los descansos. Si te interrumpen, ajusta los intervalos en Ajustes.',
  'advice.ignoredAlerts':
    'El {share} % de los avisos no se corrigió. Revisa la sensibilidad o las horas silenciosas en Ajustes.',
  'advice.improving': 'Mejora: {points} puntos más de buena postura que en el periodo anterior.',
  'advice.worsening': 'Empeora: {points} puntos menos de buena postura que en el periodo anterior.',
  'advice.goalReached': 'Objetivo cumplido: {good} % del tiempo sentado en buena postura.',

  'exercises.title': 'Biblioteca de ejercicios',
  'exercises.blocked':
    'Los ejercicios están bloqueados hasta que confirmes que no presentas señales de alerta.',
  'exercises.safety':
    'Detén cualquier ejercicio si aparece dolor irradiado, hormigueo, mareo o si el síntoma empeora. No hay ejercicios con sobrepresión ni rotaciones forzadas.',
  'exercises.advanced': 'Ejercicios avanzados',
  'exercises.advancedHiddenSensitive':
    'El preset «Sensible» no muestra ejercicios avanzados. Cambia de preset para verlos.',
  'exercises.advancedWarning':
    'Los ejercicios avanzados incluyen extensión cervical. No son adecuados con dolor cervical intenso, mareos o síntomas neurológicos. Consulta con un profesional ante cualquier duda.',
  'exercises.advancedAccept': 'Entiendo la advertencia y quiero ver los ejercicios avanzados.',
  'exercises.unlock': 'Desbloquear',
  'exercise.reps': 'Repeticiones:',
  'exercise.stop': 'Cuándo parar:',
  'exercise.rule.symptoms':
    'Regla de seguridad: si el síntoma se extiende hacia el brazo o la mano, o empeora, para. Si disminuye o desaparece, puedes continuar.',

  'exercise.chinTuck.name': 'Retracción cervical en sedestación',
  'exercise.chinTuck.objective':
    'Recuperar la posición retraída de la cabeza sobre los hombros y reducir la carga cervical.',
  'exercise.chinTuck.step.1': 'Siéntate erguido/a, con la espalda apoyada y la mirada al frente.',
  'exercise.chinTuck.step.2':
    'Sin bajar ni subir la barbilla, lleva la cabeza suavemente hacia atrás, como si hicieras una «doble barbilla».',
  'exercise.chinTuck.step.3': 'Mantén la posición 1–2 segundos, sin forzar.',
  'exercise.chinTuck.step.4': 'Vuelve despacio a la posición inicial.',
  'exercise.chinTuck.reps': 'Unas 10 repeticiones suaves, cada 30 minutos o en cada pausa.',
  'exercise.chinTuck.stop':
    'Para si el dolor baja hacia el hombro, el brazo o la mano, si aparece hormigueo o mareo, o si el síntoma empeora.',
  'exercise.chinTuck.caution.1': 'Movimiento suave, sin empujar con las manos.',
  'exercise.chinTuck.caution.2': 'Es normal notar una ligera tensión en la nuca; el dolor no debe aumentar.',

  'exercise.chinTuckExt.name': 'Retracción con extensión (avanzado)',
  'exercise.chinTuckExt.objective':
    'Añadir una extensión cervical suave tras la retracción para recuperar movilidad.',
  'exercise.chinTuckExt.step.1': 'Haz una retracción cervical completa (ejercicio básico).',
  'exercise.chinTuckExt.step.2':
    'Desde ahí, mira suavemente hacia arriba extendiendo el cuello, sin adelantar la cabeza.',
  'exercise.chinTuckExt.step.3': 'Mantén 1–2 segundos.',
  'exercise.chinTuckExt.step.4': 'Vuelve a la retracción y relaja.',
  'exercise.chinTuckExt.reps': '5–8 repeticiones suaves, 2–3 veces al día.',
  'exercise.chinTuckExt.stop':
    'Para de inmediato si el dolor u hormigueo se extiende al brazo o la mano, o si hay mareo o alteraciones visuales.',
  'exercise.chinTuckExt.caution.1':
    'Solo si has aceptado la advertencia; no recomendado con dolor cervical intenso.',
  'exercise.chinTuckExt.caution.2': 'No fuerces el final del recorrido ni empujes con las manos.',
  'exercise.chinTuckExt.caution.3': 'Si tienes dudas, consulta antes con un profesional.',

  'exercise.neckExt.name': 'Extensión de cuello sentado (avanzado)',
  'exercise.neckExt.objective':
    'Recuperar el movimiento de inclinar la cabeza hacia atrás sin que esta se adelante.',
  'exercise.neckExt.step.1':
    'Sentado/a y erguido/a, haz unas retracciones cervicales (ejercicio básico) y quédate en la última.',
  'exercise.neckExt.step.2':
    'Sube el mentón e inclina la cabeza hacia atrás, como para mirar el techo, sin dejar que la cabeza se deslice hacia delante.',
  'exercise.neckExt.step.3':
    'Opcional: con la cabeza atrás, gira la nariz un par de centímetros a cada lado, con suavidad y a buen ritmo, sin forzar.',
  'exercise.neckExt.step.4':
    'Tras unos segundos, vuelve despacio a la posición inicial. En cada repetición busca llegar tan atrás como te resulte cómodo.',
  'exercise.neckExt.reps': '10 repeticiones suaves por serie, repartidas a lo largo del día.',
  'exercise.neckExt.stop':
    'Para de inmediato si el dolor u hormigueo se extiende al brazo o la mano, si hay mareo o alteraciones visuales, o si el síntoma empeora.',
  'exercise.neckExt.caution.1':
    'Hazlo después de la retracción, y solo si has aceptado la advertencia de los ejercicios avanzados.',
  'exercise.neckExt.caution.2':
    'No empujes con las manos ni fuerces el final del recorrido. Si el dolor es intenso y no puedes hacerlo, quédate con la retracción básica.',
  'exercise.neckExt.caution.3': 'Si tienes dudas, consulta antes con un profesional.',

  'exercise.thoracic.name': 'Extensión torácica sobre el respaldo',
  'exercise.thoracic.objective':
    'Contrarrestar la postura encorvada movilizando la parte alta de la espalda.',
  'exercise.thoracic.step.1': 'Siéntate con el respaldo a la altura de los omóplatos.',
  'exercise.thoracic.step.2': 'Entrelaza los dedos detrás de la cabeza sin tirar del cuello.',
  'exercise.thoracic.step.3':
    'Inspira y arquea suavemente la espalda alta sobre el respaldo, mirando al frente.',
  'exercise.thoracic.step.4': 'Espira y vuelve a la posición neutra.',
  'exercise.thoracic.reps': '6–8 repeticiones, en cada descanso largo.',
  'exercise.thoracic.stop':
    'Para si notas dolor agudo en la espalda, el pecho o el cuello, hormigueo o mareo.',
  'exercise.thoracic.caution.1': 'Mantén el cuello neutro: el movimiento ocurre en la espalda alta.',
  'exercise.thoracic.caution.2': 'No fuerces el rango de movimiento.',

  'exercise.shoulders.name': 'Movilidad de hombros',
  'exercise.shoulders.objective': 'Aliviar la tensión de hombros y trapecio.',
  'exercise.shoulders.step.1': 'Siéntate erguido/a con los brazos relajados.',
  'exercise.shoulders.step.2':
    'Sube los hombros hacia las orejas y llévalos hacia atrás y abajo en un círculo lento.',
  'exercise.shoulders.step.3': 'Repite y después cambia de sentido.',
  'exercise.shoulders.reps': '8 círculos en cada sentido.',
  'exercise.shoulders.stop': 'Para si aparece dolor agudo en el hombro u hormigueo en el brazo.',
  'exercise.shoulders.caution.1': 'Movimientos lentos y amplios, sin rebotes.',

  'exercise.lumbarRoll.name': 'Uso de rodillo lumbar',
  'exercise.lumbarRoll.objective': 'Mantener una ligera lordosis lumbar al estar sentado/a.',
  'exercise.lumbarRoll.step.1':
    'Coloca el rodillo o una toalla enrollada en la curva baja de la espalda, sobre la cintura.',
  'exercise.lumbarRoll.step.2': 'Siéntate al fondo de la silla para que la pelvis quede apoyada.',
  'exercise.lumbarRoll.step.3': 'Ajusta la altura hasta notar un apoyo cómodo, sin empujar.',
  'exercise.lumbarRoll.reps': 'Úsalo mientras trabajas y cambia de postura cada 30 minutos.',
  'exercise.lumbarRoll.stop': 'Retíralo si aumenta el dolor lumbar o aparece hormigueo en las piernas.',
  'exercise.lumbarRoll.caution.1': 'El apoyo debe ser suave, no una presión fuerte.',
  'exercise.lumbarRoll.caution.2': 'Con dolor lumbar persistente, consulta con un profesional.',

  'settings.title': 'Ajustes',
  'settings.camera': 'Cámara y análisis',
  'settings.device': 'Cámara',
  'settings.noDevices': 'Sin cámaras disponibles',
  'settings.unnamedCamera': 'Cámara {n}',
  'settings.mode': 'Modo de uso',
  'settings.side': 'Lado visible',
  'settings.side.auto': 'Automático',
  'settings.side.left': 'Izquierdo',
  'settings.side.right': 'Derecho',
  'settings.showPreview': 'Mostrar vista previa',
  'settings.showSkeleton': 'Mostrar esqueleto',
  'settings.faceLandmarker': 'Usar Face Landmarker (cabeceo)',
  'settings.faceLandmarker.hint':
    'Mejora la medición de cabeza baja en modo frontal; consume algo más de CPU.',
  'settings.fps': 'Fotogramas por segundo: {count}',
  'settings.powerSaving': 'Modo ahorro adaptativo',
  'settings.powerSaving.hint': 'Reduce los fps si todo va bien o no hay nadie frente a la cámara.',
  'settings.standing': 'Detectar que estás de pie',
  'settings.standing.hint': 'Para escritorios elevables: de pie no cuenta como sedestación continua.',
  'settings.sensitivity': 'Sensibilidad y preset',
  'settings.preset': 'Preset',
  'settings.sensitivityScale': 'Escala de umbrales: ×{value}',
  'settings.sensitivityScale.hint': 'Mayor que 1 = menos sensible; menor que 1 = más sensible.',
  'settings.thresholdsUnvalidated':
    'Los umbrales son valores de partida y no han sido validados clínicamente.',
  'settings.viewThresholds': 'Ver umbrales y su nivel de confianza',
  'preset.standard': 'Estándar',
  'preset.sensitive': 'Sensible (dolor cervical activo)',
  'preset.custom': 'Personalizado',
  'preset.standard.desc': 'Micropausa cada 30 min y descanso largo a los 55 min.',
  'preset.sensitive.desc':
    'Umbrales más sensibles, descansos más frecuentes (20/45 min) y sin ejercicios avanzados.',
  'preset.custom.desc': 'Ajusta tú mismo/a la sensibilidad y los intervalos.',
  'settings.alerts': 'Avisos',
  'settings.sound': 'Sonido',
  'settings.volume': 'Volumen: {value} %',
  'settings.toneSet': 'Sonido de aviso',
  'settings.testSound': 'Probar',
  'settings.notifications': 'Notificaciones del sistema',
  'settings.positive': 'Refuerzo positivo al corregir',
  'settings.cooldown': 'Enfriamiento entre avisos (min)',
  'settings.cooldown.hint': 'Si ignoras los avisos, el intervalo se alarga automáticamente.',
  'settings.repeatSound': 'Repetir el sonido mientras persista la mala postura',
  'settings.repeatSeconds': 'Intervalo de repetición del sonido (s)',
  'settings.repeatSound.hint':
    'Respeta No molestar, horario silencioso y posponer; se detiene al corregir la postura.',
  'settings.dailyCap': 'Tope diario de avisos sonoros',
  'settings.quiet': 'Horario silencioso',
  'settings.quietRange': 'Desde / hasta',
  'settings.quietFrom': 'Inicio del horario silencioso',
  'settings.quietTo': 'Fin del horario silencioso',
  'tone.soft': 'Suave',
  'tone.chime': 'Campanilla',
  'tone.wood': 'Madera',
  'settings.breaks': 'Descansos',
  'settings.breaksEnabled': 'Recordar descansos',
  'settings.breaksPresetNote': 'Los intervalos los fija el preset; elige «Personalizado» para editarlos.',
  'settings.microMin': 'Microdescanso cada (min)',
  'settings.longMin': 'Descanso largo cada (min)',
  'settings.eye': 'Regla 20-20-20',
  'settings.eye.hint': 'Recordatorio discreto cada 20 min para mirar a lo lejos.',
  'settings.blink': 'Monitorizar el parpadeo',
  'settings.blink.hint':
    'Sugiere hidratar los ojos si parpadeas poco. Requiere cámara frontal u oblicua y funciona a 15 fps o más; consume más CPU.',
  'settings.absence': 'Ausencia que reinicia el contador (min)',
  'settings.snoozeMin': 'Duración de «Posponer» (min)',
  'settings.general': 'General',
  'settings.language': 'Idioma',
  'language.es': 'Español',
  'language.en': 'English',
  'settings.launchAtLogin': 'Iniciar con el sistema',
  'settings.launchAtLogin.hint': 'Disponible en la app de macOS.',
  'settings.privacy': 'Privacidad y datos',
  'settings.privacy.body':
    'Solo se guardan métricas agregadas en este dispositivo. Puedes exportarlas o borrarlas cuando quieras.',
  'settings.export.json': 'Exportar mis datos (JSON)',
  'settings.export.csv': 'Exportar mis datos (CSV)',
  'settings.erase': 'Borrar todos mis datos',
  'settings.erase.confirm': 'Se borrarán ajustes, calibraciones y estadísticas.',
  'settings.erase.yes': 'Sí, borrar todo',

  'data.load.restoredFromBackup': 'Los datos estaban dañados; se ha restaurado la última copia de seguridad.',
  'data.load.reset':
    'Los datos estaban dañados o eran incompatibles y no había copia válida; se han reiniciado.',
  'data.persistError': 'No se pudieron guardar los datos:',

  'audio.unavailable': 'Sonido no disponible',
  'audio.running': 'Sonido activo',
  'audio.suspended': 'Sonido bloqueado: haz clic para activarlo',
  'notif.granted': 'Notificaciones permitidas',
  'notif.denied': 'Notificaciones bloqueadas',
  'notif.default': 'Notificaciones sin configurar',
  'notif.unsupported': 'Notificaciones no disponibles',

  'about.title': 'Acerca de NeckGuard',
  'about.redflags': 'Señales de alerta',
  'about.privacy': 'Privacidad',
  'about.cameraIndicator':
    'macOS muestra el indicador de cámara activa mientras se analiza. Puedes pausar la cámara desde el panel o la barra de menús.',
  'about.thresholds': 'Umbrales clínicos de partida',
  'about.thresholds.caption': 'Cambio respecto a tu calibración — {mode}',
  'about.thresholds.note':
    'El valor absoluto de la literatura para el CVA (≈ 48–50°) solo se muestra como referencia informativa, nunca como veredicto.',
  'about.notReviewed':
    'Estos valores NO han sido revisados por un/a fisioterapeuta. Deben validarse antes de un uso real.',
  'about.reviewed': 'Valores revisados por un/a profesional.',
  'about.col.deviation': 'Desviación',
  'about.col.amber': 'Ámbar',
  'about.col.red': 'Rojo',
  'about.col.confidence': 'Confianza',
  'confidence.consensus': 'Consenso',
  'confidence.limited': 'Literatura limitada',
  'confidence.heuristic': 'Heurística',
  'about.license': 'Licencia',
  'about.license.body':
    '© 2026 NeckGuard contributors. NeckGuard es software libre bajo la licencia GNU Affero General Public License v3.0 (AGPL-3.0-only). Puedes usarlo, estudiarlo, modificarlo y redistribuirlo según sus términos; si ofreces una versión modificada como servicio en red, debes ofrecer su código fuente a las personas usuarias.',
  'about.license.full': 'Texto completo de la licencia (AGPL-3.0)',
  'about.license.third': 'Licencias de componentes de terceros',
  'about.source': 'Código fuente y seguimiento de incidencias',
  'about.license.error': 'No se pudo cargar el texto de la licencia.',
  'about.limits': 'Límites técnicos',
  'about.limit.cva':
    'El CVA de la app es una aproximación (oreja-hombro con C7 estimado); no equivale al CVA clínico.',
  'about.limit.frontal':
    'Una cámara frontal no distingue bien acercarse a la pantalla de adelantar la cabeza; se combinan escalas facial y de hombros.',
  'about.limit.camera': 'Si cambias la cámara, la silla o la altura del portátil, recalibra.',

  'tray.sitting.one': 'Sentado/a: {count} minuto',
  'tray.sitting.other': 'Sentado/a: {count} minutos',
  'tray.nextBreak.one': 'Próximo descanso: {count} minuto',
  'tray.nextBreak.other': 'Próximo descanso: {count} minutos',
  'tray.good': 'Buena postura: {count} %',
  'menubar.open': 'Abrir NeckGuard',
  'menubar.waiting': 'Esperando datos…',
  'mini.enter': 'Modo miniatura',
  'mini.restore': 'Restaurar ventana',
  'mini.nextBreak': 'Próximo descanso',
} as const;

export type MessageKey = keyof typeof es;
