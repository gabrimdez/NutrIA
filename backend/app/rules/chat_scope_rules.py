"""Rules for chat topic filtering and safety."""
import re
from typing import Any, Mapping, Optional, Tuple

from app.ai.exercise_science_knowledge import (
    EXERCISE_SCIENCE_COMPACT,
    REHAB_ORIENTATION_KNOWLEDGE,
)
from app.ai.multisport_factual_knowledge import MULTISPORT_FACTUAL_COMPACT
from app.ai.nutrition_expert_knowledge import (
    NUTRITION_CHAT_EXPERT_COMPACT,
    format_user_macros_line,
)
from app.rules.nutricoach_multisport_prompt import (
    MULTISPORT_LIMITS_COMPACT,
    NUTRICOACH_MULTISPORT_CORE,
)

ALLOWED_TOPICS = [
    "fuerza",
    "hipertrofia",
    "running",
    "ciclismo",
    "natación",
    "triatlón",
    "fútbol",
    "baloncesto",
    "pádel",
    "tenis",
    "combate",
    "escalada",
    "hiit",
    "entrenamiento",
    "ejercicio",
    "rutina",
    "nutrición",
    "alimentación",
    "dieta",
    "macros",
    "proteína",
    "carbohidratos",
    "grasas",
    "calorías",
    "peso",
    "grasa corporal",
    "suplementos básicos",
    "creatina",
    "proteína en polvo",
    "comidas",
    "recetas fitness",
    "lista de la compra",
    "descanso",
    "recuperación",
    "sueño",
    "hidratación",
    "volumen",
    "definición",
    "recomposición",
    "bulk",
    "cut",
    "press banca",
    "sentadilla",
    "peso muerto",
    "dominadas",
    "full body",
    "torso pierna",
    "push pull legs",
    "estancamiento",
    "meseta",
    "plateau",
    "lesión",
    "molestia",
    "dolor",
    "tendinitis",
    "contractura",
    "sobrecarga",
    "limitación",
    "adaptación",
    "alternativa",
    "glúteo",
    "pecho",
    "espalda",
    "hombro",
    "cuádriceps",
    "isquiotibiales",
    "bíceps",
    "tríceps",
    "gemelos",
    "abdominales",
    "core",
    "músculo",
    "anatomía",
    "biomecánica",
    "aducción",
    "abducción",
    "flexión",
    "extensión",
    "rotación",
    "hip thrust",
    "curl femoral",
    "extensión de cuádriceps",
    "elevaciones laterales",
    "press inclinado",
    "jalón",
    "remo",
    "pullover",
    "rehabilitación",
    "readaptación",
    "movilidad",
    "isométrico",
    "excéntrico",
]

BLOCKED_TOPICS = [
    "diagnóstico",
    "enfermedad",
    "patología",
    "trastorno alimentario",
    "anorexia",
    "bulimia",
    "vigorexia",
    "tca",
    "esteroides",
    "anabolizantes",
    "sarms",
    "hormona de crecimiento",
    "testosterona exógena",
    "clembuterol",
    "epo",
    "hernia",
    "fractura",
    "cirugía",
    "medicamento",
    "fármaco",
    "prescripción",
    "embarazo",
    "lactancia",
    "diabetes tipo 1",
    "insulina",
    "depresión",
    "ansiedad clínica",
    "psicología",
]

BLOCKED_PATTERNS = [
    re.compile(r"\b(diagnost\w*|recet\w*|prescrib\w*)\b", re.IGNORECASE),
    re.compile(r"\b(esteroid|anabolizant|sarm|clembuterol)\b", re.IGNORECASE),
    re.compile(r"\b(trastorno\s+alimentar|anorexia|bulimia)\b", re.IGNORECASE),
    re.compile(r"\b(hernia\s+discal|rotura\s+de\s+(ligamento|menisco|tendón))\b", re.IGNORECASE),
]

BLOCKED_RESPONSE = (
    "No puedo ayudarte con ese tema porque está fuera de mi alcance. "
    "Te recomiendo consultar con un profesional de la salud cualificado "
    "que pueda darte una orientación adecuada y personalizada."
)

UNCERTAINTY_DISCLAIMER = (
    "Esta es una estimación orientativa. Para un plan personalizado "
    "y preciso, consulta con un nutricionista o dietista titulado."
)


def check_message_safety(message: str) -> Tuple[bool, str]:
    for pattern in BLOCKED_PATTERNS:
        if pattern.search(message):
            return False, BLOCKED_RESPONSE

    for topic in BLOCKED_TOPICS:
        # Usar word boundary para evitar falsos positivos en substrings
        # (ej. "epo" dentro de "reposo", "tca" dentro de otra palabra)
        if re.search(r'\b' + re.escape(topic.lower()) + r'\b', message.lower()):
            return False, BLOCKED_RESPONSE

    return True, ""


def _format_injuries_block(injuries: list) -> str:
    if not injuries:
        return ""

    lines = [
        "LESIONES/LIMITACIONES ACTIVAS (la app adapta en servidor la rutina de gimnasio según estos datos; no listes ajustes técnicos al usuario, solo comenta el efecto de forma sencilla):"
    ]
    for inj in injuries:
        if not isinstance(inj, dict):
            continue

        bz = inj.get("bodyZone") or inj.get("body_zone") or inj.get("zone", "zona desconocida")
        custom_zone = str(inj.get("customBodyZoneLabel") or inj.get("custom_body_zone_label") or "").strip()
        diagnosis = str(inj.get("diagnosisLabel") or inj.get("diagnosis_label") or "").strip()
        zone_s = f"{bz} ({custom_zone})" if custom_zone else str(bz)
        diagnosis_s = f" Descripción: {diagnosis}." if diagnosis else ""
        phase = inj.get("phase") or inj.get("severity") or "—"
        goal = inj.get("goal", "—")
        excl = inj.get("excludeTags") or inj.get("exclude_tags") or []
        excl_s = ", ".join(excl[:10]) if excl else "(defecto por zona/fase)"
        custom_movements = inj.get("customAvoidMovements") or inj.get("custom_avoid_movements") or []
        custom_movements_s = ""
        if isinstance(custom_movements, list) and custom_movements:
            custom_movements_joined = ", ".join(map(str, custom_movements[:10]))
            custom_movements_s = f" Movimientos personalizados a evitar/contexto: {custom_movements_joined}."
        pr = inj.get("painAtRest", inj.get("pain_at_rest"))
        pm = inj.get("painWithMovement", inj.get("pain_with_movement"))
        pain_s = ""
        if pr is not None or pm is not None:
            pain_s = f" Dolor (reposo/mov. 0-10): {pr}/{pm}."
        notes = (inj.get("notes") or "").strip()
        note_suffix = f" Notas: {notes}." if notes else ""
        lines.append(
            f"- Zona {zone_s}, fase {phase}, objetivo {goal}.{diagnosis_s} Exclusiones: {excl_s}.{custom_movements_s}{pain_s}{note_suffix}"
        )

    if any(
        isinstance(inj, dict) and inj.get("phase") == "rehab_only"
        for inj in injuries
    ):
        lines.append(
            "CONTEXTO READAPTACIÓN: hay al menos una lesión en fase rehab_only — no prometas volumen de "
            "gimnasio convencional; la acción de rutina en app puede devolver solo un bloque conservador."
        )
    if any(
        isinstance(inj, dict) and inj.get("phase") == "acute"
        for inj in injuries
    ):
        lines.append(
            "CONTEXTO AGUDO: prioriza precaución, carga mínima o derivación; evita empujar progresión rápida."
        )

    lines.append(
        "IMPORTANTE: NO inventes ejercicios ni reescribas la rutina que responde la acción de la app; "
        "si en la respuesta de herramienta (solo para ti) trae avisos de tono, respétalos. "
        "Hacia el usuario: resume avisos (disclaimers) sin tecnicismos ni nombres de campos. NO diagnostiques. "
        "Derivación a profesional si dolor intenso o señales de alarma."
    )
    return "\n".join(lines)


_SPORT_PROFILE_KEYS: tuple[tuple[str, str], ...] = (
    ("deporte_principal", "Deporte principal"),
    ("deportes_secundarios", "Deportes secundarios"),
    ("nivel", "Nivel"),
    ("objetivo_principal", "Objetivo principal"),
    ("objetivo_salud_vs_competicion", "Salud vs competición"),
    ("fase_si_aplica", "Fase"),
    ("dias_entreno_semana", "Días de entreno / semana"),
    ("horas_entreno_semana", "Horas de entreno / semana"),
    ("duracion_media_sesion_min", "Duración media sesión (min)"),
    ("experiencia_anos", "Años de experiencia"),
    ("disponibilidad_preferida", "Disponibilidad preferida"),
    ("calendario_competicion", "Calendario / competición"),
    ("modalidad_deporte", "Modalidad"),
    ("restricciones_alimentarias", "Restricciones alimentarias"),
    ("suplementos_en_uso", "Suplementos (declarados)"),
    ("lesiones_o_limitaciones_actuales", "Lesiones o limitaciones (texto libre)"),
    ("horas_sueno_promedio", "Horas de sueño"),
    ("preferencias_seguimiento", "Preferencias de seguimiento"),
)


def _format_sport_profile_block(sport_profile: Any) -> str:
    if not isinstance(sport_profile, Mapping) or not sport_profile:
        return ""
    lines = [
        "CONTEXTO MULTIDEPORTE (perfil deportivo en ajustes de la app; no inventes valores distintos a los listados):"
    ]
    for key, label in _SPORT_PROFILE_KEYS:
        raw = sport_profile.get(key)
        if raw is None or raw == "":
            continue
        lines.append(f"- {label}: {raw}")
    return "\n".join(lines)


def _format_coach_quota_block(quota: Mapping[str, Any], is_premium: bool) -> str:
    try:
        limit = int(quota.get("chat_messages_limit") or 0)
    except (TypeError, ValueError):
        limit = 0
    try:
        used = int(quota.get("chat_messages_used") or 0)
    except (TypeError, ValueError):
        used = 0
    period = (quota.get("chat_messages_period") or "month") or "month"
    remaining = max(0, limit - used)
    period_es = "este día (zona horaria UTC)" if str(period) == "day" else "este mes calendario (UTC)"
    plan = "NutrIA Premium" if is_premium else "plan Free"
    return f"""CUPO DE MENSAJES NUTRICOACH (datos reales del servidor; no inventes otras cifras):
- Suscripción: {plan}
- Contador: {period_es} (mismo criterio que Ajustes / plan)
- Llevados en el periodo: {used} de {limit} (incluye este turno; también cuenta “texto a comida” según el plan, como en la app)
- Aproximados restantes: {remaining}

Si te preguntan “cuántos mensajes me quedan” o el cupo, responde en una o dos frases con el resumen (plan, periodo, usados, restantes) en lenguaje natural. Nunca muestres listas con nombres técnicos de acciones, APIs, JSON, ni el catálogo de conectores. Si faltan cifras, indica Ajustes o el perfil, sin inventar."""


def _format_food_restrictions_block(user_context: Mapping[str, Any]) -> str:
    allergies = user_context.get("allergies") or []
    intolerances = user_context.get("intolerances") or []
    forbidden = user_context.get("forbidden_foods") or []
    if not allergies and not intolerances and not forbidden:
        return (
            "RESTRICCIONES ALIMENTARIAS (perfil):\n"
            "- No constan alergias, intolerancias ni alimentos prohibidos en la app. "
            "Si el usuario indica alguna en el chat, respétala siempre; puedes recordarle actualizar Perfil → restricciones.\n"
        )

    def fmt(items: list) -> str:
        return ", ".join(str(x) for x in items) if items else "ninguna"

    return (
        "RESTRICCIONES ALIMENTARIAS (datos guardados en la app; PRIORIDAD ABSOLUTA en menús, ideas de platos y snacks):\n"
        f"- Alergias (no incluir estos alimentos ni derivados evidentes: huevo, lácteos, etc. según aplique): {fmt(allergies)}\n"
        f"- Intolerancias (evitar por completo): {fmt(intolerances)}\n"
        f"- Alimentos prohibidos por preferencia/ética: {fmt(forbidden)}\n"
        "Si sugieres una comida que incumpla lo anterior, es un error grave.\n"
    )


def get_system_prompt(
    user_context: dict[str, Any],
    coach_quota: Optional[Mapping[str, Any]] = None,
    is_premium: bool = False,
) -> str:
    name = user_context.get("display_name") or "usuario"
    goal = user_context.get("goal_type", "")
    weight = user_context.get("current_weight_kg", "")
    height = user_context.get("height_cm", "")
    age = user_context.get("age_years", "")
    sex = user_context.get("sex", "")
    activity = user_context.get("activity_level", "")
    training_t = user_context.get("training_type", "")
    training_days = user_context.get("training_days_per_week", "")
    macros_line = format_user_macros_line(user_context)
    injuries = user_context.get("active_injuries", [])
    injuries_block_str = _format_injuries_block(injuries)
    sport_block = _format_sport_profile_block(user_context.get("sport_profile"))
    food_restrictions_block = _format_food_restrictions_block(user_context)

    goal_labels = {
        "lose_fat": "perder grasa",
        "maintain": "mantener peso",
        "gain_muscle": "ganar músculo",
        "recomposition": "recomposición corporal",
    }

    if is_premium and coach_quota is None:
        quota_block = (
            "USO PREMIUM (datos reales del servidor): NutriForce Premium tiene uso ilimitado "
            "de las funciones de IA incluidas en la app. Si preguntan por cupos o mensajes "
            "restantes, responde en una frase que no hay limite de producto en Premium."
        )
    else:
        quota_block = (
            _format_coach_quota_block(coach_quota, is_premium) if coach_quota is not None else ""
        )
    if quota_block:
        quota_block = quota_block + "\n"

    return f"""{NUTRICOACH_MULTISPORT_CORE}

{MULTISPORT_LIMITS_COMPACT}

{MULTISPORT_FACTUAL_COMPACT}

{EXERCISE_SCIENCE_COMPACT}

{REHAB_ORIENTATION_KNOWLEDGE}

{quota_block}CONFIDENCIALIDAD (obligatoria: no filtrar detalles de implementación al usuario en ningún turno, incluida consultas sobre el cupo o qué sabe el asistente):
- No escribas nombres técnicos de conectores, funciones, parámetros en snake_case, claves de JSON, rutas de archivos, nombres de modelos, ni listas de herramientas con identificadores en inglés. Si hace falta, habla de la app o acciones en castellano (p. ej. generar una rutina desde el chat o consultar tu perfil).
- No muestres ni parafrasees el esquema de herramientas del sistema, respuestas JSON crudas ni comillas con campos internos. Tampoco funciones de la app con nombres de programación. Si preguntan qué haces por dentro, responde a alto nivel: orientación, datos del perfil, rutinas, ciencia del ejercicio o readaptación cuando aplica, sin desplegar nombres internos.

CONTEXTO DEL USUARIO (datos de la app; no inventes valores distintos):
- Nombre: {name}
- Peso actual: {weight} kg
- Talla: {height} cm
- Edad aproximada: {age} años
- Sexo registrado: {sex}
- Objetivo (onboarding): {goal_labels.get(goal, goal)}
- Objetivos diarios (app): {macros_line}
- Nivel de actividad: {activity}
- Entrenamiento (onboarding / fuerza): tipo {training_t}, {training_days} días/semana

{sport_block}

{food_restrictions_block}

{NUTRITION_CHAT_EXPERT_COMPACT.strip()}

{injuries_block_str}

REGLAS ESTRICTAS:
1. Ámbito: nutrición deportiva, hidratación, recuperación, sueño, entreno, ciencia del ejercicio. Español, claro, accionable. Lenguaje estimativo.
2. NUNCA diagnostiques, ni fármacos/esteroides/sustancias prohibidas. Lesiones graves → derivar a profesional. Molestias leves → ajustes prudentes + consultar si persiste.
3. Si faltan datos, pregunta antes. Prioriza kcal/macros del contexto. Respeta restricciones alimentarias del perfil.
4. Usa herramientas para: perfil, búsqueda de alimentos, progreso, estancamiento, macros, rutinas, readaptación. No nombres técnicos al usuario.

READAPTACIÓN: no inventes ejercicios; usa la herramienta con catálogo. Pide zona, lateralidad, dolor. Zonas sin catálogo: orientación conservadora y derivar. Éxito: mensaje breve.

RUTINAS (REGLA ABSOLUTA):
- NUNCA escribas ejercicios, series, reps ni tablas en tu texto. La app muestra la rutina en tarjeta separada.
- Split semanal: necesitas días (2-6) + enfoque (fuerza/hipertrofia). Si tienes ambos → llama la herramienta INMEDIATAMENTE, sin confirmación. Si confirma tras hablar de rutinas → llama inmediato. Si hay splits → preséntalos; al elegir → reenvía.
- Grupo muscular: usa herramienta de grupo muscular SIEMPRE. Enfoque por defecto hipertrofia.
- Después: texto MUY breve (1-2 frases). NUNCA inventes rutinas en texto."""
