"""
Base de conocimiento nutricional para planes y chat (orientación general, no prescripción clínica).

Referencia principal de fases y macros: ``docs/guide-plan.md`` (definición, mantenimiento, volumen;
balance calórico, reparto P/C/G, prioridades y errores comunes). Complementa patrones saludables (OMS, AESAN, mediterráneo).
"""

from __future__ import annotations

GUIDE_PLAN_PROMPT_INLINE = """MARCO docs/guide-plan.md — Tres fases (cambia sobre todo kcal totales, reparto de macros y nivel de control; no “limpio vs sucio”):
· Definición (perder grasa): déficit calórico; P ref. 1.6–2.2 g/kg, G ref. 0.6–1.0 g/kg, C el resto ajustado al gasto; saciedad (verdura, fruta, legumbres, prote magra, yogur); precisión en cantidades; error típico: déficit extremo + poca P + mucho cardio mental.
· Mantenimiento: kcal ~ gasto; P ref. 1.2–1.8 g/kg, G ref. 0.8–1.2 g/kg, C según actividad; flexibilidad y constancia; error típico: confundir con “comer sin control”.
· Volumen (ganar músculo): superávit moderado; P ref. 1.6–2.2 g/kg, G ref. 0.8–1.0 g/kg, C altos (arroz, pasta, avena, pan, patata, fruta, lácteos); preferir volumen limpio/controlado; error típico: “comer todo lo posible”.
Base común a las tres: poco procesado, suficiente proteína, verdura/fruta, grasas saludables, carbos de calidad, constancia; fuerza, sueño y adherencia como marco de estilo de vida. Los g/kg son guía; mandan los gramos P/C/G/kcal que pase el usuario.
Calidad culinaria obligatoria: porciones humanas, reparto lógico de energía entre comidas, fibra visible a lo largo del día y sodio moderado (no abusar de embutidos, bacon, quesos curados ni salsas saladas)."""

# Guía densa para generación de planes (equilibrio calidad/tokens).
GUIDE_PLAN_INLINE_PLAN_GEN = (
    "Criterio profesional: los gramos P/C/G/kcal del usuario son la ancla (±10% al cerrar el día). "
    "Los carbohidratos son la principal fuente de glucógeno y energía para fuerza y día activo: no dejes el día "
    "con carbos muy por debajo del objetivo sustituyendo por grasas (aceite, frutos secos, aguacate) o solo ensalada. "
    "Definición=déficit con P repartida y grasas medidas; volumen=carbos de calidad y P en principales; "
    "mantenimiento=equilibrio según cifras. "
    "Comida y cena: plato completo—proteína explícita (no solo 'pollo' genérico sin contexto) + hidrato cocido "
    "salvo criterio nutricional claro (ensalada completa con leguminosa/patata/pan, etc.) + verdura o fruta acorde. "
    "Desayuno típico ES: NO pollo/ternera/pescado a la plancha; sí huevo, lácteos, fiambre magro, tostada con tomate/AOVE, avena+café o similar. "
    "Varía fuentes proteicas en la semana (ave, ternera/cerdo magro, pescado, huevo, legumbres). "
    "No cumplas macros con aceitunas, frutos secos o aceite en exceso; nombres de alimentos concretos (no 'verduras' vago). "
    "Manzana/plátano/naranja: en el nombre usa piezas ('1 manzana mediana') y gramos de 1–2 frutas (~120–200 g manzana, ~100–130 g plátano); combina con yogur o queso fresco ~125–200 g, no 350–450 g de fruta. "
    "Tomate fresco como guarnición o ensalada ~80–180 g, no 300–400 g."
)

# Mensaje system para modelar tono y estándar de dietista-nutricionista (educación alimentaria; no clínica).
PLAN_NUTRITIONIST_SYSTEM_PROMPT = """Eres un dietista-nutricionista con experiencia en nutrición deportiva y dietética en España. Generas planes prácticos y realistas.

Debes:
- Tratar los objetivos calóricos y de macronutrientes del usuario como referencia principal; ajusta porciones para acercarte (±10%) con coherencia 4P+4C+9G por alimento. Los carbohidratos del día deben acercarse al objetivo (no solo las kcal): son la base de energía y rendimiento; no compenses carbos bajos subiendo solo grasas.
- Proponer platos que una persona pueda cocinar o comprar en un supermercado español; títulos de comida descriptivos y alimentos nombrados con precisión (evita términos vagos como solo "verduras" o "cereales"). Para manzana, plátano, pera u otras frutas enteras, indica piezas en el nombre y gramos plausibles (1–2 frutas); combina con lácteo en tomas pequeñas si hace falta volumen. Tomate fresco en cantidades de guarnición, no raciones enormes en gramos.
- Priorizar alimentos poco procesados, patrón mediterráneo, fibra repartida en el día y sodio moderado; respetar alergias y exclusiones al 100%.
- En comidas principales, asegurar lógica nutricional: proteína + fuente de hidrato cuando corresponda + vegetales/fruta razonables; desayunos al estilo España (sin “comida” disfrazada); lechuga u hojas como guarnición, no 300–500 g sustituyendo hidrato.

No debes:
- Diagnosticar enfermedades, prescribir fármacos ni sustitutos médicos.
- Recomendar dietas extremas, eliminación total de macronutrientes o cantidades absurdas para "forzar" macros.
- Inventar datos del usuario que no aparecen en el contexto."""

from datetime import date
from typing import Any, Mapping, Optional

_ACTIVITY_LABEL_ES: dict[str, str] = {
    "sedentary": "sedentario",
    "light": "ligero",
    "moderate": "moderado",
    "active": "activo",
    "very_active": "muy activo",
}

_TRAINING_LABEL_ES: dict[str, str] = {
    "strength": "fuerza",
    "hypertrophy": "hipertrofia",
    "mixed": "mixto",
}

NUTRITION_PLAN_EXPERT_CORE = """
MARCO PROFESIONAL (NutriCoach / planificación dietética deportiva recreativa; alineado con docs/guide-plan.md):
- Los números del usuario (kcal y macros) ya están calculados por la app: respétalos como ancla diaria (±10% como margen máximo por día).
- Idea central del documento: en definición, mantenimiento y volumen la base alimentaria puede ser parecida; lo que marca la fase es el balance calórico, el reparto de macros y la estrategia (control en definición, flexibilidad en mantenimiento, densidad energética prudente en volumen).
- Prioriza alimentos poco procesados, variedad de colores (verdura/fruta), fuentes de proteína de calidad y grasas insaturadas (AOVE, frutos secos, pescado azul).
- Incluye fibra a lo largo del día: verdura en comidas principales, fruta entera, avena, integrales y legumbres 2–4 veces/semana si no hay contraindicación.
- Hidratación: agua como bebida principal; evita sugerir azúcares añadidos habituales salvo preferencia explícita del usuario.
- Reparto práctico de proteína: repartir en varias tomas (desayuno, comida, cena, snack) favorece saciedad y síntesis proteica.
- Grasas: no eliminar; usa cantidades realistas (aceite en cucharadas pequeñas, aguacate, frutos secos en porción ~25–30 g).
- Carbohidratos: prioriza integrales y legumbres cuando encajen; son clave para energía diaria y rendimiento en gimnasio (glucógeno). Reparte hidrato cocido en comida/cena y, si aplica, desayuno con avena/pan/fruta según objetivos; no uses solo verdura o grasa para “rellenar” kcal si faltan carbos del usuario.
- Micronutrientes: alterna fuentes de hierro (carnes magras, legumbres + vitamina C), calcio (lácteos o enriquecidos si vegano), vitamina D vía pescado/huevo/exposición solar.
- Sodio: cocina con poco sodio; hierbas y especias para sabor. Evita construir el día sobre bacon, embutidos, quesos muy curados o salsas muy saladas.
- Seguridad: respeta alergias y exclusiones al 100%. Si el usuario es vegetariano/vegano, sustituye proteína animal por combinaciones adecuadas.
- Realismo culinario español: tortilla, gazpacho/salmorejo, menestras, pescado a la plancha, potajes, ensaladas completas, bocadillos decentes, arroces/cosas de cuchara en moderación según kcal.
- Evita "alimentos milagro", dietas extremas, ayunos agresivos no solicitados o eliminar macronutrientes enteros sin indicación del usuario.
"""

MEAL_LOGIC_AND_QUALITY = """
LÓGICA DE COMIDAS Y PLAUSIBILIDAD:
- El desayuno debe parecer un desayuno real, no una comida principal disfrazada: evita meter 700–900 kcal solo con pan, avena, huevos o crema de frutos secos salvo casos muy concretos y justificados por el número de comidas.
- La comida/lunch suele concentrar la mayor parte del día, seguida de la cena; los snacks deben ser tomas más pequeñas y funcionales.
- En desayunos y snacks, combina de forma lógica: proteína/lácteo + fruta o carbohidrato; evita juntar varias fuentes densas enormes a la vez.
- En comida y cena, prioriza estructura de plato: proteína principal + verdura/fibra visible + acompañamiento de carbohidrato si encaja.
- Evita porciones absurdas de pan, huevos, avena, aceite, frutos secos, salsas y quesos. Usa rangos humanos.
- No intentes cuadrar macros con un solo alimento gigante. Reparte la energía de forma sostenible y apetecible.
- Aporta fibra todos los días: fruta, verdura, legumbre, avena, integrales, semillas. No bases el día en alimentos bajos en fibra.
"""

SPANISH_MEAL_AUTHENTICITY = """
PATRONES ESPAÑOLES (plausibilidad obligatoria):
- Desayuno: nunca carnes o pescados de comida principal (pollo/pechuga/ternera/merluza a la plancha); sí fiambre magro en lonchas, huevo, lácteos, avena, tostada con tomate/AOVE. Si hay pan o tostada, que parezca desayuno típico; yogur o queso encajan mejor con avena/cereales integrales o fruta.
- Comidas principales (lunch/dinner): alterna a lo largo de la semana pollo, carne roja magra (ternera/solomillo), cerdo magro, pescado (blanco o azul), huevos o legumbres; no centres toda la semana solo en pollo.
- Plato fuerte = proteína + hidrato cocido explícito (arroz, pasta, patata, legumbre o pan razonable de guarnición) + verdura; no sustituyas el hidrato principal por montones de zanahoria u otra verdura (>~200 g de zanahoria cruda/cocida como único volumen es raro); verdura de guarnición suele ir ~80–200 g por comida salvo ensalada mixta equilibrada.
"""

GOAL_SPECIFIC_PLAN_GUIDANCE: dict[str, str] = {
    "lose_fat": """
OBJETIVO DEFINICIÓN (docs/guide-plan.md; déficit ya en kcal del usuario):
- Regla principal: menos kcal que gasto; déficit razonable, no extremo (adherencia y conservar músculo).
- Prioridades del documento: (1) déficit sano (2) proteína suficiente (3) fuerza en la vida del usuario (4) sueño/hábitos sin dietas agresivas.
- P ref. 1.6–2.2 g/kg/día y G ref. 0.6–1.0 g/kg/día como orientación; C = resto de kcal bien repartido; respeta los gramos exactos de la app.
- Cómo debe verse el menú: P alta repartida, G moderadas medidas, C de calidad ajustados al target, alimentos saciantes y ricos en fibra.
- Error común del guía a evitar: bajar demasiado calorías “en el plato”, poca proteína, poca fibra y sensación de privación extrema.
""",
    "maintain": """
OBJETIVO MANTENIMIENTO (docs/guide-plan.md; kcal ~ gasto del usuario):
- Regla principal: consumir aproximadamente lo que se gasta; estabilidad y hábitos sostenibles.
- Prioridades: hábitos estables; cubrir necesidades; energía para entrenar; evitar picoteo excesivo y restricciones innecesarias.
- P ref. 1.2–1.8 g/kg/día, G ref. 0.8–1.2 g/kg/día, C moderados o altos según actividad y según targets numéricos.
- Cómo debe verse el menú: equilibrio P/C/G según cifras, flexibilidad con alimentos poco procesados y buena calidad culinaria.
- Error común del guía a evitar: confundir mantenimiento con ausencia de estructura o con ultraprocesados calóricos constantes.
""",
    "gain_muscle": """
OBJETIVO VOLUMEN (docs/guide-plan.md; superávit ya en kcal del usuario):
- Regla principal: más kcal que gasto; minimizar grasa ganada con progresión controlada (volumen limpio preferible al agresivo).
- Prioridades: superávit moderado; fuerza con progresión; recuperación; subida de peso gradual en el tiempo.
- P ref. 1.6–2.2 g/kg/día, G ref. 0.8–1.0 g/kg/día, C altos (resto de kcal) para rendir y recuperar.
- Cómo debe verse el menú: comidas energéticas sanas (arroz, pasta, avena, pan, patata, fruta, lácteos, frutos secos en porción), P en comidas principales y fibra suficiente.
- Error común del guía a evitar: “comer todo lo posible”, fritos y bollería como única forma de subir kcal.
""",
    "recomposition": """
OBJETIVO RECOMPOSICIÓN (docs/guide-plan.md + lógica pérdida de grasa con conservación de masa):
- Equivale a buscar déficit leve o mantenimiento según kcal objetivo, con énfasis en proteína y entreno de fuerza.
- Cruce entre definición y mantenimiento: P prioritaria (cercana a enfoque definición si las kcal son restrictivas), C y G sin recortes extremos.
- Carbohidratos ajustados al entreno y al target; grasas saludables medidas; nunca eliminar un macronutriente sin indicación del usuario.
""",
}

TRAINING_LINK_PLAN = """
VÍNCULO CON ENTRENAMIENTO (si aplica en el perfil):
- Fuerza/hipertrofia: proteína repartida + hidratos en el día; no es obligatorio el "anabolic window" pero conviene no entrenar en ayunas largas si el usuario no lo prefiere.
- Días con mucho volumen de entreno: puede aumentar ligeramente carbos en una comida cercana al entreno (sin obsesión horaria).
- Días de descanso: misma proteína; carbohidratos pueden ajustarse ligeramente hacia abajo si mantiene saciedad (sin romper el objetivo diario de macros).
"""

SPANISH_STAPLE_REFERENCE = """
ALIMENTOS DE REFERENCIA (nombres en español que puedes usar con naturalidad):
- Proteínas: pechuga/pollo, ternera magra, cerdo magro, pavo, huevos, claras, bacalao, merluza, lenguado, atún en lata al natural, sardinas, mejillones, requesón/skyr/yogur griego, queso fresco batido, tofu, tempeh, seitán, proteína de guisante en polvo.
- Carbohidratos: arroz (blanco/integral), pasta (normal/integral), pan, avena, quinoa, cuscús, patata/boniato, legumbres cocidas, fruta entera.
- Verduras: brócoli, espinaca, judías verdes, calabacín, berenjena, pimientos, tomate, lechuga, endivias, zanahoria, cebolla, ajo, champiñones, alcachofa, coles de Bruselas.
- Grasas: AOVE, aguacate, almendras/nueces/pipas (porción), aceitunas, tahini.
- Condimentos: limón, vinagre, mostaza, especias, hierbas frescas.
"""

PORTION_AND_COOKING = """
COCINA Y PORCIONES (realismo):
- Especifica forma cuando afecte a kcal: "pechuga de pollo a la plancha", "arroz basmati cocido", "pasta cocida", "avena en copos cruda (peso seco)".
- Fruta entera: refiérete en unidades en el nombre del ítem ("1 manzana mediana", "1 plátano") y pon gramos de esas piezas (no 400 g de manzana); en desayuno/snack suele encajar 1 pieza + yogur natural o queso fresco ~125–200 g.
- Tomate fresco en ensalada o guarnición: porciones habituales ~80–180 g; pan con tomate rallado ~80–120 g de tomate.
- Evita duplicar hidratos gigantes en una sola comida salvo que el día cuadre en macros y siga siendo realista.
- Postre: fruta, yogur, o opciones ligeras; no obligatorio en cada comida.
- Porciones típicas a respetar: pan ~25–110 g, huevos 1–4 unidades, avena ~20–100 g, frutos secos ~8–40 g, aceite ~3–18 g.
"""

RATIONALE_FOR_PLAN = """
LISTA DE LA COMPRA Y RATIONALE:
- shopping_list: agrega alimentos reutilizables en la semana con cantidades orientativas en texto.
- rationale_short: 2–4 frases explicando el enfoque (objetivo + reparto de macros + variedad).
- caveats: menciona que son estimaciones, ajuste según hambre/actividad y consulta con dietista si hay patología.
"""

MICRONUTRIENTS_AND_DIVERSITY = """
MICRONUTRIENTES Y DIVERSIDAD (sin suplementar a ciegas):
- Hierro: carnes/pescado (heme) o legumbres + fuente de vitamina C (pimiento, cítricos, kiwi).
- Calcio: lácteos; si sin lacteo: bebidas enriquecidas, tofu precipitado con calcio, semillas de sésamo, algunos pescados con espinas comestibles en conserva.
- Omega-3: pescado azul 2–3 veces/semana si omnívoro; si vegano, semillas de lino/chía + consideración de alimentos enriquecidos.
- Fruta: 2–3 piezas/día típicas según kcal; prioriza entera frente a zumo.
- Verdura: mínimo 2–3 raciones visibles al día en el plan (ensalada, guarnición, pisto, menestra).
- Fibra: busca presencia diaria de avena, fruta, integrales, legumbre y verduras; que el menú no quede "limpio" pero pobre en fibra.
"""

SPECIAL_DIETS = """
PREFERENCIAS ESPECIALES (si el usuario las indicó en el prompt):
- Vegetariano: huevo/lácteos + legumbres; atención a B12 solo informativamente.
- Vegano: legumbres+cereales en la jornada, tofu/tempeh, frutos secos, semillas, leches vegetales enriquecidas.
- Sin gluten: arroz, maíz, quinoa, patata, legumbres naturales; ojo con salsas/industriales.
- Sin lactosa: lácteos sin lactosa o alternativas enriquecidas; calcio vía otras fuentes.
- Halal/kosher: respeta exclusiones explícitas del usuario sin asumir.
"""

SNACK_AND_MEAL_TIMING = """
SNACKS Y CRONONUTRICIÓN PRÁCTICA:
- 3–6 tomas según meals_per_day; no es obligatorio comer cada 3 h.
- Pre-entreno: algo ligero con carbos + poca grasa/fibra si el usuario nota molestias (plátano + yogur, tostada fina, etc.).
- Post-entreno: comida completa con proteína + carbos; no hace falta producto específico "anabólico".
- Los snacks deben seguir siendo snacks: pequeños, funcionales y lógicos.
"""

ANTI_PATTERNS = """
EVITAR EN LOS PLANES (coherente con docs/guide-plan.md):
- Menús idénticos 7 días seguidos.
- Solo ensaladas para déficit extremo sin proteína suficiente.
- Eliminar grasas o carbohidratos por completo.
- Mantenimiento presentado como “libre albedrío” sin respetar los macros objetivo.
- Volumen presentado como comer ultraprocesados o cantidades absurdas en lugar de densidad sana.
- Cifras de macros por alimento incoherentes.
- Desayunos gigantes basados en 200 g de pan, 300 g de huevo, cantidades absurdas de aceite o frutos secos.
- Días enteros pobres en fibra o cargados de embutidos, bacon, quesos curados y salsas saladas.
"""


def build_expert_block_for_plan(
    goal_type: str,
    *,
    sex: Optional[str] = None,
    birth_year: Optional[int] = None,
    height_cm: Optional[float] = None,
    weight_kg: Optional[float] = None,
    activity_level: Optional[str] = None,
    training_type: Optional[str] = None,
    training_days_per_week: Optional[int] = None,
) -> str:
    goal_key = (goal_type or "maintain").lower().replace(" ", "_")
    if goal_key not in GOAL_SPECIFIC_PLAN_GUIDANCE:
        goal_key = "maintain"

    lines = [
        "=== GUÍA DE EXPERTO PARA ESTE PLAN ===",
        NUTRITION_PLAN_EXPERT_CORE.strip(),
        MEAL_LOGIC_AND_QUALITY.strip(),
        GOAL_SPECIFIC_PLAN_GUIDANCE[goal_key].strip(),
        TRAINING_LINK_PLAN.strip(),
        SPANISH_STAPLE_REFERENCE.strip(),
        PORTION_AND_COOKING.strip(),
        MICRONUTRIENTS_AND_DIVERSITY.strip(),
        SPECIAL_DIETS.strip(),
        SNACK_AND_MEAL_TIMING.strip(),
        ANTI_PATTERNS.strip(),
        RATIONALE_FOR_PLAN.strip(),
        "=== PERFIL RESUMIDO (usa solo si es coherente; no inventes datos faltantes) ===",
    ]
    if weight_kg is not None:
        lines.append(f"- Peso aproximado: {weight_kg} kg")
    if height_cm is not None:
        lines.append(f"- Talla: {height_cm} cm")
    if sex:
        lines.append(f"- Sexo registrado: {sex}")
    age = _age_years(birth_year)
    if age is not None:
        lines.append(f"- Edad aproximada: {age} años")
    if activity_level:
        lines.append(f"- Nivel de actividad: {activity_level}")
    if training_type:
        lines.append(f"- Tipo de entrenamiento declarado: {training_type}")
    if training_days_per_week is not None:
        lines.append(f"- Días de entreno/semana: {training_days_per_week}")
    lines.append(
        "=== FIN GUÍA ===\n"
        "Recuerda: el usuario puede tener preferencias y alergias listadas arriba; son prioritarias."
    )
    return "\n".join(lines)


def _age_years(birth_year: Optional[int]) -> Optional[int]:
    if not birth_year:
        return None
    try:
        y = int(birth_year)
    except (TypeError, ValueError):
        return None
    return max(0, date.today().year - y)


NUTRITION_CHAT_EXPERT_COMPACT = """
Conocimiento base (nutrición deportiva recreativa, español; fases según docs/guide-plan.md):
- Usa siempre lenguaje estimativo. No diagnostiques. No prescribas fármacos ni sustancias prohibidas.
- Tres marcos: DEFINICIÓN (déficit, P alta ref. 1.6–2.2 g/kg, G moderadas ref. 0.6–1.0 g/kg, C ajustados), MANTENIMIENTO (kcal ~ gasto, P ref. 1.2–1.8, G ref. 0.8–1.2, C según actividad), VOLUMEN (superávit moderado, P ref. 1.6–2.2, G ref. 0.8–1.0, C altos). Los g/kg son orientativos si ya hay targets en contexto, esos mandan.
- Respeta el objetivo del usuario coherente con sus kcal y macros en contexto.
- Proteína repartida en el día; fibra e hidratación; alimentos poco procesados; grasas insaturadas medidas.
- Patrón mediterráneo español como referencia práctica.
- Perder grasa: densidad nutricional alta, saciedad, sin déficit extremo ni poca proteína.
- Ganar músculo: superávit controlado, carbos suficientes, proteína en comidas principales; no “comer sin límite”.
- Calidad culinaria: porciones humanas, platos lógicos y sodio moderado.
- Si faltan datos, pregunta antes de afirmar cantidades personalizadas.
"""

SINGLE_DAY_EXPERT_BASE = """
CRITERIO NUTRICIONAL (un día de un plan semanal; alineado con docs/guide-plan.md):
- Respeta las kcal y macros del día (±10%). Coherencia: kcal ≈ 4P+4C+9G por alimento.
- El menú debe “parecer” la fase del usuario, sin contradecir los números.
- Proteína repartida; verdura en comidas principales; AOVE y frutos secos en porción.
- Alimentos reales en España; nombres en español; cocción explícita si afecta.
- Varía respecto a un menú genérico repetitivo; 2–5 alimentos por comida salvo snack simple.
- Comidas plausibles: desayuno realista, lunch/dinner completos, snack pequeño; fibra visible y sodio moderado.
"""

def build_expert_block_single_day(goal_type: str) -> str:
    goal_key = (goal_type or "maintain").lower().replace(" ", "_")
    if goal_key not in GOAL_SPECIFIC_PLAN_GUIDANCE:
        goal_key = "maintain"
    return "\n".join(
        [
            SINGLE_DAY_EXPERT_BASE.strip(),
            GOAL_SPECIFIC_PLAN_GUIDANCE[goal_key].strip(),
            MEAL_LOGIC_AND_QUALITY.strip(),
            ANTI_PATTERNS.strip(),
        ]
    )


_SINGLE_DAY_GOAL_ONE_LINERS: dict[str, str] = {
    "lose_fat": (
        "Definición: déficit ya en las kcal del usuario—maximiza saciedad con proteína repartida, verdura/legumbres y grasas medidas; "
        "carbos de calidad al gramo objetivo sin miedo a arroz/pasta/patata en ración normal. Evita platos pobres en proteína o fibra."
    ),
    "maintain": (
        "Mantenimiento: equilibrio según P/C/G objetivo; energía estable para día a día y entreno; "
        "comidas variadas, porciones humanas, sin caer en todo ultraprocesado ni en restricción absurda."
    ),
    "gain_muscle": (
        "Volumen: superávit moderado ya en kcal—prioriza carbos limpios (arroz, pasta, avena, patata, fruta) y P en cada comida principal; "
        "grasas suficientes pero no sustituyas hidrato con solo frutos secos o aceite."
    ),
    "recomposition": (
        "Recomposición: P prioritaria; kcal según objetivo (déficit leve o mantenimiento); "
        "sin recortar carbos o grasas de forma extrema; fuerza en comidas principales con hidrato razonable."
    ),
}


def build_guide_plan_compact(
    goal_type: str, plan_profile: Optional[Mapping[str, Any]] = None
) -> str:
    gk = (goal_type or "maintain").lower().replace(" ", "_")
    if gk not in ("lose_fat", "maintain", "gain_muscle", "recomposition"):
        gk = "maintain"

    w_note = ""
    if plan_profile:
        w = plan_profile.get("weight_kg")
        if w is not None:
            try:
                wf = float(w)
                if wf > 20:
                    w_note = f" Peso ref. ~{wf:.0f} kg: rangos g/kg del documento son orientativos; prevalecen siempre los gramos P/C/G del enunciado."
            except (TypeError, ValueError):
                pass

    blocks = {
        "lose_fat": (
            "Fase DEFINICIÓN: el balance calórico es déficit. Distribuye el día para que la suma de alimentos respete P/C/G: proteína repartida y saciante, "
            "grasas en cantidades moderadas, carbohidratos de calidad ajustados al gramo objetivo, mucho volumen de verdura/legumbres. "
            "Evita menús de solo ensalada sin proteína, desayunos enormes por panes/huevos o platos hipercalóricos fuera de objetivo."
        ),
        "maintain": (
            "Fase MANTENIMIENTO: kcal similares al gasto. Equilibrio P/C/G según cifras: hábitos sostenibles, proteína en desayuno, carbos según actividad, "
            "grasas equilibradas. No es ‘comer sin control’: respeta los macros numéricos con flexibilidad, fibra suficiente y porciones humanas."
        ),
        "gain_muscle": (
            "Fase VOLUMEN: superávit moderado. Carbohidratos predominantes de calidad (arroz, pasta, avena, patata, pan, fruta) junto a proteína en cada comida principal; "
            "grasas moderadas medidas. Evita recomendar exceso de fritos/bollería o cantidades absurdas de un solo alimento."
        ),
        "recomposition": (
            "Fase RECOMPOSICIÓN: déficit leve o mantenimiento según kcal objetivo; proteína prioritaria; "
            "carbos y grasas sin eliminaciones extremas; enfoque conservar músculo con reparto lógico y sostenible de las comidas."
        ),
    }
    return blocks[gk] + w_note


def build_expert_block_single_day_compact(
    goal_type: str, plan_profile: Optional[Mapping[str, Any]] = None
) -> str:
    gk = (goal_type or "maintain").lower().replace(" ", "_")
    line = _SINGLE_DAY_GOAL_ONE_LINERS.get(gk, _SINGLE_DAY_GOAL_ONE_LINERS["maintain"])
    span = (
        "Calidad menú: desayuno típico ES; lunch/dinner con proteína nombrada + hidrato cocido (arroz/pasta/patata/legumbre) "
        "salvo plato único muy completo (ej. lentejas estofadas); verdura guarnición realista (~100–250 g o ensalada mixta); "
        "alterna pollo/pavo/ternera/cerdo magro/pescado/huevo/legumbres. "
        "Prohibido rellenar grasas con cantidades ridículas de aceitunas o frutos secos. "
        "Macros creíbles por ítem; título de cada comida = plato reconocible."
    )
    base = f"Jornada nutricional (±10% vs objetivos). kcal≈4P+4C+9G por alimento. {line} {span}"
    prof = format_plan_profile_compact(plan_profile)
    return f"{base} {prof}" if prof else base


def build_expert_block_for_plan_compact(
    goal_type: str, plan_profile: Optional[Mapping[str, Any]] = None
) -> str:
    gk = (goal_type or "maintain").lower().replace(" ", "_")
    line = _SINGLE_DAY_GOAL_ONE_LINERS.get(gk, _SINGLE_DAY_GOAL_ONE_LINERS["maintain"])
    span = (
        "Plan 7 días: cada día ±10% P/C/G/kcal; siete menús distintos; patrón mediterráneo español; "
        "principales siempre profesionales (proteína + hidrato + fibra); microrotación de proteínas y carbos; "
        "sin atajos grasos (exceso aceitunas/FS/aceite). shopping_list y rationale coherentes con el menú."
    )
    base = f"Plan semanal. Objetivos numéricos del usuario son ley. {line} {span}"
    prof = format_plan_profile_compact(plan_profile)
    return f"{base} {prof}" if prof else base


def format_plan_profile_compact(plan_profile: Optional[Mapping[str, Any]]) -> str:
    if not plan_profile:
        return ""
    parts: list[str] = []
    age = _age_years(plan_profile.get("birth_year"))  # type: ignore[arg-type]
    if age is not None:
        parts.append(f"~{age} años")
    w = plan_profile.get("weight_kg")
    h = plan_profile.get("height_cm")
    if w is not None:
        try:
            parts.append(f"~{float(w):.0f} kg")
        except (TypeError, ValueError):
            pass
    if h is not None:
        try:
            parts.append(f"~{float(h):.0f} cm")
        except (TypeError, ValueError):
            pass
    sex = plan_profile.get("sex")
    if sex in ("male", "female"):
        parts.append("hombre" if sex == "male" else "mujer")
    al = plan_profile.get("activity_level")
    if al:
        key = str(al).lower().strip()
        parts.append(f"actividad {_ACTIVITY_LABEL_ES.get(key, key)}")
    tt = plan_profile.get("training_type")
    td = plan_profile.get("training_days_per_week")
    if tt or td is not None:
        tkey = str(tt).lower().strip() if tt else ""
        tlabel = _TRAINING_LABEL_ES.get(tkey, tkey or "entreno")
        try:
            n = int(td) if td is not None else None
        except (TypeError, ValueError):
            n = None
        if n is not None and n > 0:
            parts.append(f"entreno {tlabel} ~{n} días/sem")
        elif tt:
            parts.append(f"entreno {tlabel}")
    if not parts:
        return ""
    return "PERFIL_USUARIO: " + "; ".join(parts) + "."


def format_user_macros_line(ctx: dict[str, Any]) -> str:
    parts = []
    if ctx.get("target_kcal"):
        parts.append(f"{ctx['target_kcal']} kcal/día")
    if ctx.get("target_protein_g"):
        parts.append(f"P {ctx['target_protein_g']} g")
    if ctx.get("target_carbs_g"):
        parts.append(f"C {ctx['target_carbs_g']} g")
    if ctx.get("target_fat_g"):
        parts.append(f"G {ctx['target_fat_g']} g")
    return " | ".join(parts) if parts else "macros no disponibles"
