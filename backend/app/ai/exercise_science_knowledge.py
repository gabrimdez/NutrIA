"""Base de conocimiento de ciencia del ejercicio: anatomía funcional, biomecánica y readaptación."""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Anatomía funcional por grupo muscular + mapeo ejercicio ↔ función
# ---------------------------------------------------------------------------

EXERCISE_SCIENCE_COMPACT = """
ANATOMÍA FUNCIONAL Y SELECCIÓN DE EJERCICIOS (base científica compacta; úsala para explicar al usuario POR QUÉ se elige cada ejercicio):

PECTORAL MAYOR
- Funciones: aducción horizontal del húmero (fibras medias), flexión de hombro (fibras claviculares), rotación interna.
- Porción clavicular (pecho superior): se activa más en ángulos inclinados (30-45°) y en movimientos de flexión del hombro con aducción → press inclinado, cruce de poleas ascendente.
- Porción esternal (pecho medio/inferior): máxima activación en aducción horizontal pura → press plano, aperturas horizontales en máquina/polea, peck deck.
- Estiramiento bajo carga (posición de elongación) potencia hipertrofia: las aperturas y cruces con brazos abiertos llevan la fibra a su mayor longitud muscular.
- Ejemplo: el press plano trabaja pecho porque el movimiento principal es aducción horizontal del húmero contra resistencia; las aperturas en máquina maximizan el rango de estiramiento en esa función.

DORSAL ANCHO + REDONDO MAYOR
- Funciones: aducción del húmero (acercar brazo al cuerpo), extensión de hombro (llevar brazo hacia atrás), rotación interna.
- Tracción vertical (jalón, dominadas): aducción + extensión desde posición elongada → gran estiramiento.
- Tracción horizontal (remos): extensión horizontal + retracción escapular; el agarre cerrado enfatiza extensión de hombro, el abierto enfatiza aducción.
- Variantes: agarre supino aumenta rango de extensión y recluta más bíceps; agarre neutro reduce estrés en muñeca.

DELTOIDES
- Anterior: flexión de hombro, aducción horizontal → press militar, elevaciones frontales. Ya recibe mucho estímulo en presses de pecho.
- Medio (lateral): abducción del húmero en plano frontal → elevaciones laterales. Máxima activación en 60-120° de abducción; las poleas mantienen tensión constante en todo el arco.
- Posterior: extensión horizontal, rotación externa → face pull, pájaros, rear delt en máquina/polea. Importante para equilibrio articular y postura.

TRAPECIO + ROMBOIDES
- Trapecio superior: elevación escapular → encogimientos.
- Trapecio medio + romboides: retracción escapular → remos con pausa y face pulls.
- Trapecio inferior: depresión y rotación ascendente escapular → importante para overhead estable.

GLÚTEO MAYOR
- Funciones principales: extensión de cadera (llevar fémur hacia atrás), rotación externa, abducción (fibras superiores).
- Máxima activación en extensión de cadera contra resistencia, especialmente con cadera flexionada (posición elongada).
- Hip thrust / puente de glúteo: extensión pura de cadera con columna neutra; pico de tensión en acortamiento (lockout).
- Sentadilla profunda / prensa: extensión de cadera + rodilla; el glúteo participa más cuanto mayor es la flexión de cadera (más profundidad).
- Peso muerto rumano: extensión de cadera con rodilla casi extendida; gran estiramiento del glúteo y isquiotibiales.
- Abducción de cadera (máquina / banda): activa fibras superiores del glúteo mayor + glúteo medio.
- Zancada / búlgara: extensión de cadera unilateral con componente de estabilización; mayor rango que sentadilla bilateral.
- Kickback en polea: extensión de cadera aislada; útil como ejercicio de acabado con conexión mente-músculo.
- Para hipertrofia de glúteo: combinar un ejercicio de estiramiento (sentadilla/búlgara/RDL), uno de acortamiento (hip thrust/puente), y uno de abducción.

GLÚTEO MEDIO + MENOR
- Función: abducción de cadera, estabilización pélvica en apoyo unipodal, rotación interna (menor).
- Ejercicios: abducción en máquina, clamshell con banda, sentadilla a una pierna, step-up lateral.
- Fundamental en prevención de valgo de rodilla y estabilidad en carrera/deporte.

CUÁDRICEPS (recto femoral, vasto lateral, vasto medial, vasto intermedio)
- Función: extensión de rodilla. El recto femoral también flexiona cadera (biarticular).
- Extensión de cuádriceps en máquina: aísla extensión de rodilla; en posición elongada (cadera neutra/flexionada) estira más el recto femoral.
- Sentadilla / hack squat / prensa: extensión de rodilla + cadera; el cuádriceps trabaja más con torso vertical y rodillas adelantadas.
- Sentadilla búlgara: unilateral; gran rango de flexión de rodilla y cadera.
- Vasto medial oblicuo (VMO): se activa más en los últimos grados de extensión y con rotación externa de tibia.

ISQUIOTIBIALES (bíceps femoral, semimembranoso, semitendinoso)
- Funciones: flexión de rodilla + extensión de cadera (biarticulares).
- Curl femoral (sentado/tumbado): aísla flexión de rodilla; sentado pone cadera en flexión → más estiramiento del isquio → mayor hipertrofia.
- Peso muerto rumano: extensión de cadera con rodilla casi recta; gran estiramiento excéntrico de isquiotibiales.
- Peso muerto convencional: extensión de cadera + rodilla; participación isquio + glúteo + erectores.
- Para desarrollo completo: combinar un ejercicio de cadera dominante (RDL) + uno de rodilla dominante (curl femoral sentado).

BÍCEPS BRAQUIAL + BRAQUIAL + BRAQUIORRADIAL
- Bíceps: flexión de codo + supinación de antebrazo. Cabeza larga: más activa con hombro en extensión (curl inclinado). Cabeza corta: más activa con hombro en flexión (curl predicador/spider).
- Braquial: flexor puro de codo; se activa más con agarre neutro o pronado (curl martillo).
- Curl inclinado: máximo estiramiento de cabeza larga (hombro en extensión).
- Curl predicador/spider: máxima tensión en acortamiento y énfasis en cabeza corta.
- Bayesian curl (polea desde atrás): estiramiento cabeza larga con tensión constante.

TRÍCEPS (cabeza larga, lateral, medial)
- Función: extensión de codo. Cabeza larga: biarticular (también extiende/aduce hombro); se estira más con el brazo por encima de la cabeza.
- Extensión por encima de la cabeza (press francés, polea overhead): estiramiento máximo de cabeza larga.
- Pushdown en polea: énfasis cabeza lateral y medial (hombro en posición neutra).
- Press cerrado / fondos: compuestos que involucran tríceps + pectoral/deltoides anterior.

GEMELOS (gastrocnemio + sóleo)
- Gastrocnemio: flexión plantar + flexión de rodilla (biarticular); se estira más con rodilla extendida.
- Sóleo: flexión plantar monoarticular; se trabaja con rodilla flexionada.
- Gemelo de pie: énfasis gastrocnemio. Gemelo sentado: énfasis sóleo.

CORE (recto abdominal, oblicuos, transverso, erectores)
- Recto abdominal: flexión de columna → crunch, crunch en polea.
- Oblicuos: rotación y flexión lateral → pallof press, oblicuo en polea.
- Transverso: estabilización/bracing → plancha, dead bug, hollow hold.
- Erectores espinales: extensión de columna → hiperextensiones, good morning.

PRINCIPIOS DE SELECCIÓN BASADA EN EVIDENCIA:
1. Curva longitud-tensión: los músculos generan más fuerza en posición media y producen mayor estímulo hipertrófico cuando se cargan en posición elongada (estiramiento bajo carga).
2. Perfil de resistencia: poleas/cables mantienen tensión constante; peso libre varía con la gravedad (más difícil en el punto medio); máquinas pueden ajustar la curva.
3. Variedad de ángulo: trabajar un músculo desde distintos ángulos/posiciones articulares recluta diferentes porciones y fibras.
4. Estabilidad: máquinas permiten llevar al fallo con menos riesgo técnico; peso libre entrena estabilizadores pero requiere más técnica.
5. Rangos: fuerza 3-6 reps con compuestos pesados; hipertrofia 6-12 reps con control y cercanía al fallo (RIR 0-2); resistencia muscular 12-20+.
6. Volumen semanal: 10-20 series efectivas por grupo muscular/semana es el rango donde la mayoría optimiza hipertrofia. Principiantes responden con menos; avanzados pueden necesitar más.
7. Frecuencia: 2+ veces/semana por grupo muscular suele ser superior a 1 vez para hipertrofia.
""".strip()

# ---------------------------------------------------------------------------
# Orientación conservadora de readaptación para zonas con y sin catálogo
# ---------------------------------------------------------------------------

REHAB_ORIENTATION_KNOWLEDGE = """
CONOCIMIENTO BASE DE READAPTACIÓN (orientación general; NO sustituye fisioterapia ni diagnóstico):

PRINCIPIOS GENERALES DE READAPTACIÓN AL EJERCICIO:
1. Progresión graduada de carga: empezar con cargas bajas/isométricos y progresar a concéntrico/excéntrico según tolerancia. No saltar fases.
2. Criterio de dolor tolerable: durante el ejercicio, dolor ≤3/10 EVA aceptable; si sube de 4/10, reducir carga o rango. Monitorizar respuesta 24h post-sesión.
3. Movilidad antes que carga: recuperar rango articular funcional antes de añadir resistencia significativa.
4. Isométricos como herramienta inicial: reducen dolor (analgesia por inhibición cortical), mantienen fuerza sin movimiento articular amplio. 3-5 series x 20-45s.
5. Excéntricos progresivos: fundamentales en tendinopatías (Alfredson, heavy slow resistance). Carga progresiva, velocidad controlada, 3x15 o 4x8 según protocolo.
6. Señales de alarma (derivar a profesional): dolor nocturno persistente, hinchazón que no remite, bloqueo articular, inestabilidad franca, déficit neurológico (hormigueo/entumecimiento/pérdida de fuerza), deformidad visible, fiebre, dolor irradiado progresivo.
7. Frecuencia: 3-5 sesiones ligeras/semana mejor que 1-2 intensas. Priorizar consistencia y baja dosis.
8. Simetría: comparar con el lado sano; objetivo funcional es >90% de fuerza y rango respecto al contralateral.

ORIENTACIÓN POR ZONAS SIN CATÁLOGO DETALLADO EN LA APP:

CERVICAL:
- Movilidad suave: rotaciones, inclinaciones y flexo-extensión lentas en rango no doloroso.
- Isométricos cervicales multidireccionales: empujar cabeza contra mano sin movimiento (flexión, extensión, laterales). 3x10s cada dirección.
- Retracción cervical (chin tuck): corrige postura anterior; 3x10 con pausa de 5s.
- Fortalecer trapecio medio/inferior y estabilizadores escapulares (face pulls, remos ligeros con retracción) para mejorar postura.
- Evitar: cargas axiales pesadas (sentadilla con barra alta), movimientos balísticos cervicales, overhead pesado si hay radiculopatía.
- Derivar si: dolor irradiado a brazo, hormigueo persistente, debilidad en mano/brazo, vértigo al mover el cuello.

CADERA:
- Movilidad articular: rotación interna/externa en 90° de flexión; flexión activa asistida; abducción controlada.
- Puente de glúteo: extensión de cadera sin carga lumbar; progresión a unipodal.
- Clamshell con banda: abducción/rotación externa en descarga.
- Step-up bajo: carga progresiva de extensores sin impacto.
- Sentadilla parcial / goblet squat con rango tolerado.
- Evitar: sentadilla profunda pesada, aductores en máquina con carga alta, impacto repetitivo (correr) si dolor en ingle/trocánter.
- Derivar si: dolor en ingle al caminar/subir escaleras que no mejora en 2-3 semanas, bloqueo articular, cojera, chasquido doloroso constante.

TORÁCICA (DORSAL):
- Extensiones torácicas en foam roller: 3x10 respiraciones profundas.
- Rotaciones torácicas (open book, thread the needle): 3x8-10 por lado.
- Cat-cow enfatizando la zona dorsal.
- Face pulls y remos con retracción escapular para mejorar extensión.
- Rara vez hay patología aislada grave; suele ser rigidez postural.
- Derivar si: dolor costal con respiración profunda, dolor persistente > 4 semanas, antecedente de trauma.

PAUTA GENERAL PARA CUALQUIER ZONA:
- Semana 1-2: movilidad + isométricos + actividades de la vida diaria sin dolor.
- Semana 3-4: excéntricos/concéntricos ligeros + rango progresivo.
- Semana 5+: carga submáxima progresiva + reintegración al entrenamiento con ajustes.
- Si la molestia no mejora en 2-3 semanas con ajustes conservadores → derivar.
""".strip()
