"""Plantillas de rutina especializadas por grupo muscular con justificación científica."""

from __future__ import annotations

from typing import Any, Optional

from app.ai.training_exercises import MEDICAL_DISCLAIMER_ES

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ex(name: str, sets: int, reps: str, rationale: str) -> dict[str, Any]:
    return {"name": name, "sets": sets, "reps": reps, "rationale_es": rationale}


DISCLAIMER_MUSCLE = (
    "Esta es una propuesta orientativa basada en principios de anatomía funcional y "
    "evidencia científica general. Ajusta cargas, rangos y volumen a tu nivel y "
    "tolerancia. Si tienes lesiones o dudas, consulta con un profesional."
)

# ---------------------------------------------------------------------------
# Plantillas por grupo muscular — hipertrofia (default) y fuerza
# ---------------------------------------------------------------------------

_TEMPLATES: dict[str, dict[str, Any]] = {
    "glutes": {
        "label_es": "Glúteo",
        "hipertrofia": {
            "name": "Rutina de glúteo — hipertrofia",
            "exercises": [
                _ex(
                    "Hip thrust con barra o en máquina",
                    4, "8-12",
                    "Extensión pura de cadera con columna neutra; máxima activación del glúteo mayor "
                    "en acortamiento (lockout). La función principal del glúteo mayor es la extensión "
                    "de cadera, y el hip thrust la aísla sin carga axial relevante en la columna.",
                ),
                _ex(
                    "Sentadilla búlgara con mancuernas",
                    3, "8-12",
                    "Extensión de cadera unilateral con gran rango de flexión. Al bajar, el glúteo "
                    "de la pierna delantera se estira bajo carga (posición elongada), lo que maximiza "
                    "el estímulo hipertrófico según la curva longitud-tensión. También entrena "
                    "estabilidad pélvica y corrige asimetrías.",
                ),
                _ex(
                    "Peso muerto rumano con barra o mancuernas",
                    3, "8-10",
                    "Extensión de cadera con rodilla casi extendida; lleva al glúteo mayor e "
                    "isquiotibiales a posición de máximo estiramiento (cadera flexionada). "
                    "El componente excéntrico es clave para hipertrofia de la cadena posterior.",
                ),
                _ex(
                    "Abducción de cadera en máquina",
                    3, "12-15",
                    "Trabaja la abducción de cadera, función de las fibras superiores del glúteo "
                    "mayor y del glúteo medio. Es un vector de fuerza lateral que complementa "
                    "los ejercicios de extensión (sagitales) y mejora estabilidad pélvica.",
                ),
                _ex(
                    "Kickback en polea baja",
                    3, "12-15",
                    "Extensión de cadera aislada con tensión constante del cable. Permite alta "
                    "conexión mente-músculo y trabaja el glúteo en su función de hiperextensión "
                    "de cadera. Útil como ejercicio de acabado.",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de glúteo — fuerza",
            "exercises": [
                _ex(
                    "Hip thrust con barra (pesado)",
                    4, "4-6",
                    "Extensión de cadera contra carga máxima. El glúteo mayor es el extensor "
                    "de cadera más potente; aquí se entrena su función primaria con cargas "
                    "altas y descansos largos para desarrollo de fuerza.",
                ),
                _ex(
                    "Sentadilla profunda / hack squat",
                    4, "5-8",
                    "Extensión de cadera + rodilla en profundidad. A mayor flexión de cadera, "
                    "mayor participación del glúteo. La sentadilla profunda es el compuesto "
                    "más completo para la cadena extensora inferior.",
                ),
                _ex(
                    "Peso muerto rumano pesado",
                    3, "5-8",
                    "Extensión de cadera con gran carga excéntrica; desarrollo de fuerza en "
                    "la bisagra de cadera para glúteo e isquiotibiales.",
                ),
                _ex(
                    "Zancada con barra o mancuernas pesadas",
                    3, "6-8",
                    "Extensión de cadera unilateral con carga significativa; entrena "
                    "fuerza funcional y estabilidad pélvica bajo carga.",
                ),
            ],
        },
    },
    "chest": {
        "label_es": "Pecho",
        "hipertrofia": {
            "name": "Rutina de pecho — hipertrofia",
            "exercises": [
                _ex(
                    "Press plano con mancuernas o en máquina",
                    3, "6-10",
                    "Aducción horizontal del húmero contra resistencia: la función principal de "
                    "la porción esternal del pectoral mayor. Las mancuernas permiten mayor rango "
                    "de aducción que la barra, estirando más la fibra al bajar.",
                ),
                _ex(
                    "Press inclinado (30-45°) con mancuernas o máquina",
                    3, "8-12",
                    "La inclinación añade un componente de flexión de hombro, que activa más las "
                    "fibras claviculares (pecho superior). Estas fibras corren en ángulo ascendente "
                    "y responden mejor cuando la resistencia se alinea con esa dirección.",
                ),
                _ex(
                    "Aperturas horizontales en máquina (peck deck) o cruce de poleas horizontal",
                    3, "10-12",
                    "Aducción horizontal pura sin extensión de codo; aísla el pectoral en su "
                    "función primaria. El rango de estiramiento con brazos abiertos lleva la fibra "
                    "a máxima longitud, donde el estímulo hipertrófico es mayor (curva longitud-tensión).",
                ),
                _ex(
                    "Cruce de poleas ascendente o press inclinado en polea",
                    3, "10-15",
                    "Trabaja la porción clavicular en flexión de hombro + aducción. Las poleas "
                    "mantienen tensión constante en todo el arco, incluyendo el acortamiento "
                    "donde el peso libre pierde resistencia.",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de pecho — fuerza",
            "exercises": [
                _ex(
                    "Press de banca con barra",
                    4, "3-6",
                    "Compuesto pesado de aducción horizontal; la barra permite la mayor carga "
                    "absoluta en empuje horizontal. Trabaja pectoral + tríceps + deltoides anterior.",
                ),
                _ex(
                    "Press inclinado con barra o mancuernas pesadas",
                    3, "5-8",
                    "Fuerza en empuje con ángulo ascendente; desarrollo de las fibras claviculares "
                    "bajo carga pesada. Importante para transferencia a press militar.",
                ),
                _ex(
                    "Fondos lastrados (dips)",
                    3, "5-8",
                    "Aducción horizontal + extensión de codo con el peso corporal + lastre. "
                    "Gran rango de estiramiento del pectoral en la posición baja.",
                ),
                _ex(
                    "Press plano en máquina o mancuernas",
                    3, "6-10",
                    "Volumen complementario; la máquina permite enfocarse en la contracción "
                    "sin fatiga de estabilizadores tras los compuestos pesados.",
                ),
            ],
        },
    },
    "back": {
        "label_es": "Espalda",
        "hipertrofia": {
            "name": "Rutina de espalda — hipertrofia",
            "exercises": [
                _ex(
                    "Jalón al pecho en polea (agarre medio/ancho)",
                    3, "8-12",
                    "Aducción + extensión de hombro en plano vertical; estira el dorsal ancho "
                    "al máximo en la posición superior (brazos arriba). El dorsal es aductor y "
                    "extensor del húmero; la tracción vertical alinea la resistencia con ambas funciones.",
                ),
                _ex(
                    "Remo en máquina o con apoyo en banco (agarre cerrado)",
                    3, "8-12",
                    "Extensión de hombro predominante; el agarre cerrado lleva el codo más "
                    "atrás del cuerpo, maximizando la contracción del dorsal en acortamiento. "
                    "El apoyo estabiliza el torso y permite aislar la tracción.",
                ),
                _ex(
                    "Remo en polea sentado (agarre abierto)",
                    3, "8-12",
                    "Aducción horizontal + retracción escapular; enfatiza trapecio medio, "
                    "romboides y fibras medias del dorsal. El agarre abierto cambia el vector "
                    "respecto al remo cerrado, cubriendo otra porción del dorsal.",
                ),
                _ex(
                    "Pullover en polea o máquina",
                    3, "10-12",
                    "Extensión de hombro pura sin flexión de codo; aísla el dorsal y redondo "
                    "mayor en su función de extensión de hombro. Estiramiento profundo "
                    "con brazos elevados.",
                ),
                _ex(
                    "Hombro posterior en polea o máquina (face pull / reverse fly)",
                    3, "12-15",
                    "Extensión horizontal + rotación externa; trabaja deltoides posterior, "
                    "trapecio medio y romboides. Equilibra el ratio empuje/tracción horizontal "
                    "y mejora salud del hombro.",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de espalda — fuerza",
            "exercises": [
                _ex(
                    "Dominadas lastradas o jalón pesado",
                    4, "4-6",
                    "Tracción vertical pesada; máxima carga en aducción/extensión de hombro. "
                    "Las dominadas con lastre son el compuesto de tracción vertical más exigente.",
                ),
                _ex(
                    "Remo con barra (pendlay o clásico)",
                    4, "5-8",
                    "Tracción horizontal pesada; gran carga en dorsal, romboides y erectores "
                    "como estabilizadores. Fuerza funcional de tirón.",
                ),
                _ex(
                    "Remo en máquina o T-bar",
                    3, "6-8",
                    "Complementa el remo con barra con soporte que permite cargas altas "
                    "sin fatiga lumbar excesiva.",
                ),
                _ex(
                    "Pullover pesado en máquina",
                    3, "6-10",
                    "Extensión de hombro pesada aislada; desarrollo de fuerza del dorsal "
                    "en un plano diferente a los remos.",
                ),
            ],
        },
    },
    "shoulders": {
        "label_es": "Hombros",
        "hipertrofia": {
            "name": "Rutina de hombros — hipertrofia",
            "exercises": [
                _ex(
                    "Press militar con mancuernas o en máquina",
                    3, "8-12",
                    "Abducción + flexión de hombro contra resistencia vertical. Trabaja deltoides "
                    "anterior y medio; las mancuernas permiten trayectoria natural en plano escapular.",
                ),
                _ex(
                    "Elevaciones laterales en polea o mancuerna",
                    4, "10-15",
                    "Abducción del húmero en plano frontal: función principal del deltoides "
                    "medio. La polea mantiene tensión constante, incluso en la parte baja "
                    "donde la mancuerna pierde carga. Rango óptimo 30-120° de abducción.",
                ),
                _ex(
                    "Elevaciones laterales en máquina",
                    3, "12-15",
                    "Similar a la polea pero con guía mecánica; permite enfocarse en abducción "
                    "pura sin compensaciones. Útil para series de alto RIR o drop sets.",
                ),
                _ex(
                    "Face pull o hombro posterior en polea",
                    3, "12-15",
                    "Extensión horizontal + rotación externa; deltoides posterior + trapecio "
                    "medio. Equilibrio articular y postura. El hombro posterior rara vez se "
                    "estimula suficiente sin trabajo directo.",
                ),
                _ex(
                    "Press Arnold o press con rotación",
                    3, "10-12",
                    "Combina flexión con rotación durante el press; activa deltoides anterior y "
                    "medio en un arco amplio. La rotación añade variedad angular.",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de hombros — fuerza",
            "exercises": [
                _ex(
                    "Press militar con barra de pie",
                    4, "4-6",
                    "Empuje vertical pesado; máximo desarrollo de fuerza overhead. Requiere "
                    "estabilización del core y buena movilidad torácica.",
                ),
                _ex(
                    "Press con mancuernas pesadas sentado",
                    3, "5-8",
                    "Fuerza de empuje vertical con mayor rango que la barra; el banco "
                    "elimina compensación del tren inferior.",
                ),
                _ex(
                    "Elevaciones laterales pesadas con trampa controlada",
                    3, "8-10",
                    "Carga progresiva en abducción con algo de impulso; útil para "
                    "sobrecarga mecánica del deltoides medio.",
                ),
                _ex(
                    "Face pull pesado con polea o banda",
                    3, "10-12",
                    "Fuerza en rotación externa y retracción; salud articular bajo "
                    "cargas de empuje altas.",
                ),
            ],
        },
    },
    "legs": {
        "label_es": "Pierna",
        "hipertrofia": {
            "name": "Rutina de pierna — hipertrofia",
            "exercises": [
                _ex(
                    "Patrón de sentadilla: sentadilla, hack squat o prensa",
                    4, "8-12",
                    "Compuesto principal de extensión de rodilla + cadera. Recluta cuádriceps, "
                    "glúteo e isquios como sinergistas. La hack squat/prensa permite alta carga "
                    "con menor demanda lumbar y máxima dosis sobre los vastos del cuádriceps.",
                ),
                _ex(
                    "Peso muerto rumano con barra o mancuernas",
                    3, "8-10",
                    "Bisagra de cadera con rodilla casi recta; estiramiento excéntrico profundo "
                    "de cadena posterior. Trabaja isquiotibiales y glúteo mayor en su función "
                    "de extensores de cadera (posición elongada → mayor estímulo hipertrófico).",
                ),
                _ex(
                    "Hip thrust con barra o en máquina",
                    3, "8-12",
                    "Extensión pura de cadera con columna neutra; máxima activación del glúteo "
                    "mayor en el lockout sin carga axial. Complementa la sentadilla cubriendo "
                    "el rango acortado de la extensión de cadera.",
                ),
                _ex(
                    "Extensión de cuádriceps en máquina",
                    3, "10-15",
                    "Aislamiento de extensión de rodilla, función única del cuádriceps. Permite "
                    "llevar al fallo sin limitación sistémica. Sentado, el recto femoral se estira "
                    "más por la flexión de cadera simultánea.",
                ),
                _ex(
                    "Curl femoral sentado o tumbado",
                    3, "8-12",
                    "Aislamiento de flexión de rodilla. La variante sentada estira el isquio "
                    "biarticular en ambos extremos (cadera flexionada + rodilla extendida) y, "
                    "según evidencia reciente, produce más hipertrofia que el tumbado.",
                ),
                _ex(
                    "Aductor en máquina o polea",
                    3, "10-15",
                    "Trabaja los aductores (recto interno, aductor mayor, pectíneo), grupo "
                    "muscular de la cara interna del muslo a menudo descuidado. Aporta volumen "
                    "y estabilidad a la cadera.",
                ),
                _ex(
                    "Elevación de gemelos de pie o sentado",
                    3, "10-15",
                    "Flexión plantar; cierra el trabajo de la pierna. De pie enfatiza gastrocnemio "
                    "(biarticular), sentado enfatiza sóleo (~60% de la masa de la pantorrilla).",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de pierna — fuerza",
            "exercises": [
                _ex(
                    "Sentadilla con barra (back squat o front squat)",
                    4, "3-6",
                    "Compuesto pesado de extensión de rodilla + cadera; máxima carga axial. "
                    "Reclutamiento sistémico de cuádriceps, glúteo, isquios y core estabilizador.",
                ),
                _ex(
                    "Peso muerto rumano pesado",
                    4, "4-6",
                    "Bisagra de cadera con carga máxima; desarrollo de fuerza en extensión de "
                    "cadera para isquiotibiales y glúteo.",
                ),
                _ex(
                    "Hip thrust pesado con barra",
                    3, "5-8",
                    "Extensión de cadera contra carga máxima sin componente axial. El glúteo "
                    "mayor es el extensor de cadera más potente; aquí entrena su función primaria.",
                ),
                _ex(
                    "Hack squat o prensa pesada",
                    3, "5-8",
                    "Carga alta en extensión de rodilla con soporte; permite superar la sentadilla "
                    "libre sin limitación de espalda baja.",
                ),
                _ex(
                    "Curl femoral pesado (sentado o tumbado)",
                    3, "6-8",
                    "Fuerza de flexión de rodilla; transferencia a sprint y salto.",
                ),
                _ex(
                    "Elevación de gemelos pesada",
                    3, "6-10",
                    "Carga máxima en flexión plantar; fuerza del tríceps sural.",
                ),
            ],
        },
    },
    "quadriceps": {
        "label_es": "Cuádriceps",
        "hipertrofia": {
            "name": "Rutina de cuádriceps — hipertrofia",
            "exercises": [
                _ex(
                    "Sentadilla, hack squat o prensa",
                    4, "8-12",
                    "Extensión de rodilla + cadera; el cuádriceps trabaja más con torso vertical "
                    "(hack squat/prensa), que limita la participación de glúteo/isquio y aumenta "
                    "la demanda sobre el recto femoral y los vastos.",
                ),
                _ex(
                    "Sentadilla búlgara con pie elevado",
                    3, "8-12",
                    "Gran rango de flexión de rodilla unilateral; el cuádriceps se estira "
                    "completamente bajo carga. Corrige asimetrías y entrena estabilización.",
                ),
                _ex(
                    "Extensión de cuádriceps en máquina",
                    3, "10-15",
                    "Aislamiento de la extensión de rodilla, función única del cuádriceps. "
                    "Permite llevar al fallo sin limitación de otros músculos. En posición "
                    "sentada, el recto femoral se estira más (cadera flexionada + rodilla flexionada).",
                ),
                _ex(
                    "Prensa de piernas (pies bajos y juntos)",
                    3, "10-12",
                    "Variante que enfatiza cuádriceps: pies bajos en la plataforma aumentan "
                    "la flexión de rodilla relativa y reducen la demanda de glúteo/isquio.",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de cuádriceps — fuerza",
            "exercises": [
                _ex(
                    "Sentadilla con barra (front squat o back squat)",
                    4, "3-6",
                    "Compuesto pesado de extensión de rodilla + cadera. La sentadilla frontal "
                    "enfatiza más cuádriceps por el torso erguido obligado.",
                ),
                _ex(
                    "Hack squat o prensa pesada",
                    3, "5-8",
                    "Carga pesada en extensión de rodilla con soporte; permite superar "
                    "la carga de la sentadilla libre sin limitación de espalda.",
                ),
                _ex(
                    "Extensión de cuádriceps (series pesadas)",
                    3, "6-10",
                    "Fuerza aislada de extensión; útil para fortalecer el cuádriceps en "
                    "los grados finales de extensión (relevante para salud de rodilla).",
                ),
            ],
        },
    },
    "hamstrings": {
        "label_es": "Isquiotibiales",
        "hipertrofia": {
            "name": "Rutina de isquiotibiales — hipertrofia",
            "exercises": [
                _ex(
                    "Curl femoral sentado",
                    3, "8-12",
                    "Flexión de rodilla con cadera flexionada (sentado); pone al isquiotibial "
                    "en posición de mayor estiramiento (biarticular estirado en ambos extremos). "
                    "Según evidencia reciente, el curl sentado produce más hipertrofia que el tumbado "
                    "porque la fibra trabaja en posición elongada.",
                ),
                _ex(
                    "Peso muerto rumano con barra o mancuernas",
                    3, "8-10",
                    "Extensión de cadera con rodilla casi recta; estiramiento excéntrico profundo "
                    "de isquiotibiales + glúteo. Trabaja los isquios en su función de extensores "
                    "de cadera (no solo flexores de rodilla).",
                ),
                _ex(
                    "Curl femoral tumbado",
                    3, "10-12",
                    "Flexión de rodilla con cadera extendida (tumbado); el isquio trabaja en "
                    "posición más acortada que en sentado. Complementa el curl sentado para "
                    "cubrir diferente punto de la curva longitud-tensión.",
                ),
                _ex(
                    "Buenos días (good morning) o hiperextensión",
                    3, "10-12",
                    "Bisagra de cadera con carga en la espalda; extensión de cadera desde "
                    "posición flexionada. Los isquiotibiales trabajan como extensores de cadera "
                    "junto con el glúteo y los erectores.",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de isquiotibiales — fuerza",
            "exercises": [
                _ex(
                    "Peso muerto rumano pesado",
                    4, "4-6",
                    "Máxima carga en bisagra de cadera; desarrollo de fuerza en extensión "
                    "de cadera para isquiotibiales y glúteo.",
                ),
                _ex(
                    "Curl femoral sentado pesado",
                    3, "6-8",
                    "Fuerza de flexión de rodilla en posición elongada; transferencia a "
                    "sprint y salto.",
                ),
                _ex(
                    "Buenos días con barra (pesado)",
                    3, "5-8",
                    "Fuerza de bisagra con carga axial; desarrollo de cadena posterior "
                    "completa.",
                ),
            ],
        },
    },
    "biceps": {
        "label_es": "Bíceps",
        "hipertrofia": {
            "name": "Rutina de bíceps — hipertrofia",
            "exercises": [
                _ex(
                    "Curl inclinado con mancuernas (banco 45-60°)",
                    3, "8-12",
                    "El hombro queda en extensión, lo que estira la cabeza larga del bíceps "
                    "al máximo. El estiramiento bajo carga es el principal driver de hipertrofia. "
                    "El bíceps tiene como función la flexión de codo + supinación; aquí trabaja "
                    "en su mayor longitud.",
                ),
                _ex(
                    "Curl predicador o spider curl",
                    3, "8-12",
                    "El hombro queda en flexión, lo que acorta la cabeza larga y enfatiza la "
                    "cabeza corta. La máxima tensión ocurre en acortamiento. Complementa "
                    "el curl inclinado al cubrir otro punto de la curva longitud-tensión.",
                ),
                _ex(
                    "Bayesian curl en polea (cable desde atrás)",
                    3, "10-12",
                    "Hombro en extensión + tensión constante del cable: máximo estiramiento de "
                    "cabeza larga con perfil de resistencia uniforme. Combina las ventajas "
                    "del curl inclinado (estiramiento) con la tensión continua de la polea.",
                ),
                _ex(
                    "Curl martillo con mancuernas o en polea",
                    3, "10-12",
                    "Agarre neutro (sin supinación); enfatiza el braquial y braquiorradial "
                    "además del bíceps. El braquial es el flexor primario del codo y aporta "
                    "anchura al brazo visto de frente.",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de bíceps — fuerza",
            "exercises": [
                _ex(
                    "Curl con barra recta de pie (pesado)",
                    4, "4-6",
                    "Máxima carga en flexión de codo; la barra permite carga bilateral alta.",
                ),
                _ex(
                    "Curl martillo pesado",
                    3, "5-8",
                    "Fuerza de flexión con agarre neutro; recluta braquial, que es puro "
                    "flexor de codo y genera la mayor fuerza en esa acción.",
                ),
                _ex(
                    "Curl predicador pesado",
                    3, "6-8",
                    "Fuerza en flexión con apoyo; elimina impulso y enfoca la carga en los flexores.",
                ),
            ],
        },
    },
    "triceps": {
        "label_es": "Tríceps",
        "hipertrofia": {
            "name": "Rutina de tríceps — hipertrofia",
            "exercises": [
                _ex(
                    "Extensión por encima de la cabeza en polea o press francés",
                    3, "8-12",
                    "El brazo elevado estira la cabeza larga del tríceps (biarticular: cruza "
                    "el hombro). La cabeza larga es la porción más grande del tríceps y responde "
                    "mejor cuando se entrena en posición elongada. La polea mantiene tensión "
                    "constante en todo el rango.",
                ),
                _ex(
                    "Pushdown en polea (agarre recto o cuerda)",
                    3, "10-12",
                    "Extensión de codo con hombro en posición neutra; enfatiza cabeza lateral y "
                    "medial del tríceps. Son las porciones más visibles lateralmente y responden "
                    "a cargas moderadas con buena conexión mente-músculo.",
                ),
                _ex(
                    "Extensión con mancuerna a una mano por encima de la cabeza",
                    3, "10-12",
                    "Estiramiento unilateral de cabeza larga; permite corregir asimetrías y "
                    "concentrarse en la contracción de un solo brazo.",
                ),
                _ex(
                    "Fondos en paralelas o en máquina",
                    3, "8-12",
                    "Compuesto de extensión de codo + aducción horizontal; trabaja tríceps + "
                    "pectoral inferior. Gran rango de estiramiento en la posición baja.",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de tríceps — fuerza",
            "exercises": [
                _ex(
                    "Press banca agarre cerrado",
                    4, "4-6",
                    "Máxima carga en extensión de codo; compuesto pesado que permite "
                    "la mayor sobrecarga para el tríceps.",
                ),
                _ex(
                    "Press francés con barra EZ (pesado)",
                    3, "6-8",
                    "Fuerza en extensión con brazo elevado; desarrollo de cabeza larga "
                    "bajo carga alta.",
                ),
                _ex(
                    "Fondos lastrados",
                    3, "5-8",
                    "Fuerza funcional de empuje vertical con lastre; alta carga mecánica "
                    "en tríceps + pectoral.",
                ),
            ],
        },
    },
    "calves": {
        "label_es": "Gemelos",
        "hipertrofia": {
            "name": "Rutina de gemelos — hipertrofia",
            "exercises": [
                _ex(
                    "Elevación de gemelos de pie (máquina o smith)",
                    4, "10-15",
                    "Flexión plantar con rodilla extendida; enfatiza el gastrocnemio "
                    "(biarticular, cruza la rodilla). Pausa de 2s en el estiramiento "
                    "inferior maximiza rango y estímulo.",
                ),
                _ex(
                    "Elevación de gemelos sentado",
                    3, "12-20",
                    "Flexión plantar con rodilla flexionada; el gastrocnemio queda acortado "
                    "y pierde eficiencia, así que el sóleo (monoarticular) asume la carga. "
                    "El sóleo es ~60% de la masa de la pantorrilla.",
                ),
                _ex(
                    "Elevación de gemelos en prensa (piernas rectas)",
                    3, "12-15",
                    "Variante de pie en prensa; permite carga alta con rango completo. "
                    "Alterna con la máquina de pie para variedad.",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de gemelos — fuerza",
            "exercises": [
                _ex(
                    "Elevación de gemelos de pie pesada",
                    4, "6-10",
                    "Carga máxima en flexión plantar; desarrollo de fuerza del gastrocnemio.",
                ),
                _ex(
                    "Elevación de gemelos sentado pesada",
                    3, "8-12",
                    "Fuerza del sóleo bajo carga; fundamental para rendimiento en "
                    "carrera y salto.",
                ),
            ],
        },
    },
    "core": {
        "label_es": "Core / Abdominales",
        "hipertrofia": {
            "name": "Rutina de core — hipertrofia",
            "exercises": [
                _ex(
                    "Crunch en polea o máquina",
                    3, "10-15",
                    "Flexión de columna contra resistencia; función del recto abdominal. "
                    "La polea/máquina permite progresión de carga, que es clave para "
                    "hipertrofia abdominal (no solo series de 50 sin peso).",
                ),
                _ex(
                    "Pallof press o rotación antirotación en polea",
                    3, "10-12 por lado",
                    "Antirotación: los oblicuos y el transverso frenan la rotación del tronco. "
                    "Trabaja estabilización bajo carga lateral, función real del core en "
                    "la mayoría de movimientos deportivos.",
                ),
                _ex(
                    "Plancha o hollow hold",
                    3, "30-45s",
                    "Antiextensión: el transverso y recto abdominal estabilizan la columna "
                    "contra la gravedad. Base de control lumbopélvico para todos los compuestos.",
                ),
                _ex(
                    "Elevación de piernas colgado o en banco",
                    3, "10-15",
                    "Flexión de cadera con estabilización abdominal; el recto abdominal "
                    "trabaja fijando la pelvis. Trabaja la porción inferior de forma más "
                    "intensa que el crunch clásico.",
                ),
            ],
        },
        "fuerza": {
            "name": "Rutina de core — fuerza",
            "exercises": [
                _ex(
                    "Crunch en polea pesado",
                    4, "6-10",
                    "Fuerza de flexión de columna; relevante para deportes que requieren "
                    "potencia rotacional y protección lumbar.",
                ),
                _ex(
                    "Pallof press pesado",
                    3, "8-10 por lado",
                    "Fuerza antirotacional; transferencia a deportes de raqueta, combate y lanzamiento.",
                ),
                _ex(
                    "Plancha lastrada",
                    3, "30-60s",
                    "Fuerza isométrica de antiextensión; base para cargas axiales pesadas "
                    "en sentadilla y peso muerto.",
                ),
            ],
        },
    },
}


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------

def get_muscle_group_routine(
    muscle_group: str,
    focus: str = "hipertrofia",
    experience_level: str = "intermedio",
) -> dict[str, Any]:
    """Devuelve rutina estructurada por grupo muscular con justificación científica."""
    mg = muscle_group.strip().lower()
    focus_key = "fuerza" if focus.strip().lower() == "fuerza" else "hipertrofia"

    if mg not in _TEMPLATES:
        available = [f"{k} ({v['label_es']})" for k, v in _TEMPLATES.items()]
        return {
            "error": "unsupported_muscle_group",
            "muscle_group": mg,
            "available_groups": available,
            "coach_instructions_es": (
                f"No hay plantilla para '{mg}'. Muestra al usuario los grupos disponibles: "
                + ", ".join(v["label_es"] for v in _TEMPLATES.values())
                + ". Pregunta cuál quiere."
            ),
        }

    template = _TEMPLATES[mg][focus_key]
    label_es = _TEMPLATES[mg]["label_es"]

    structured_days = [
        {
            "name": template["name"],
            "exercises": [
                {"name": ex["name"], "sets": ex["sets"], "reps": ex["reps"]}
                for ex in template["exercises"]
            ],
        }
    ]
    plain_days = [
        {
            "name": template["name"],
            "exercises": [
                f'{ex["name"]}: {ex["sets"]}x{ex["reps"]}'
                for ex in template["exercises"]
            ],
        }
    ]

    science_rationale = [
        {"exercise": ex["name"], "rationale_es": ex["rationale_es"]}
        for ex in template["exercises"]
    ]

    exp = experience_level.strip().lower()
    exp_note = ""
    if exp == "principiante":
        exp_note = (
            "Nivel principiante: empieza con cargas ligeras para aprender la técnica. "
            "Reduce 1 serie por ejercicio las primeras 3-4 semanas. Prioriza control y rango "
            "completo sobre peso. 2 sesiones/semana de este grupo muscular es suficiente."
        )
    elif exp == "avanzado":
        exp_note = (
            "Nivel avanzado: puedes añadir 1-2 series extra por ejercicio o incluir técnicas "
            "de intensidad (drop sets, rest-pause, myo-reps) en los ejercicios de aislamiento. "
            "Considera 15-25 series semanales para este grupo."
        )

    focus_note_es = (
        f"Rutina de {label_es.lower()} enfocada en {'fuerza máxima' if focus_key == 'fuerza' else 'hipertrofia'}. "
        f"{'Prioriza cargas altas (RPE 8-9) con descansos de 3-5 min entre series de compuestos.' if focus_key == 'fuerza' else 'Prioriza cercanía al fallo (RIR 0-2) con control excéntrico de 2-3 s y descansos de 2-3 min.'}"
    )
    if exp_note:
        focus_note_es = f"{focus_note_es} {exp_note}"

    return {
        "kind": "muscle_group_routine",
        "muscle_group": mg,
        "label_es": label_es,
        "name": template["name"],
        "split": f"grupo_muscular_{mg}",
        "days": plain_days,
        "structured_days": structured_days,
        "science_rationale": science_rationale,
        "focus_note": focus_note_es,
        "disclaimer": DISCLAIMER_MUSCLE,
        "coach_instructions_es": (
            "Responde MUY breve (1-2 frases). NO listes ejercicios, series ni reps en tu texto: "
            "la app muestra la rutina en una tarjeta separada con la explicación científica. "
            "Ejemplo: 'Aquí tienes tu rutina de [grupo]. Recuerda calentar y ajustar cargas.' "
            "Nada más. La tarjeta ya contiene todo."
        ),
    }
