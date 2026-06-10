"""Generate personalized diet plans using AI with structured output."""
import asyncio
import logging
import re
from typing import Any, List, Optional

from pydantic import BaseModel, Field, model_validator

from app.ai.groq_client import structured_output
from app.ai.diet_generator_lexicon import (
    DAY_LABELS_ES,
    GOAL_TYPE_LABEL_ES,
    contains_any as _contains_any,
    food_groups as _food_groups,
    food_name_lower as _food_name,
)
from app.core.config import get_settings
from app.services.plan_meal_normalize import sanitize_food_display_name
from app.ai.nutrition_expert_knowledge import (
    GUIDE_PLAN_INLINE_PLAN_GEN,
    PLAN_NUTRITIONIST_SYSTEM_PROMPT,
    build_expert_block_for_plan_compact,
    build_expert_block_single_day_compact,
)

logger = logging.getLogger(__name__)

# Una sola generación semanal a la vez (evita dos POST que se comen el TPM a la vez).
_WEEKLY_PLAN_GENERATION_LOCK = asyncio.Lock()
GROQ_PLAN_STRUCTURED_RETRIES = 4


async def _plan_groq_cooldown() -> None:
    sec = float(getattr(get_settings(), "groq_plan_throttle_after_call_seconds", 12.0) or 0.0)
    if sec > 0:
        await asyncio.sleep(sec)


_STARCH_DENSE_WORDS = (
    "pan",
    "arroz",
    "pasta",
    "avena",
    "copos",
    "granola",
    "muesli",
    "cereal",
    "patata",
    "boniato",
    "batata",
    "quinoa",
    "cuscús",
    "cuscus",
    "wrap",
    "tortilla de trigo",
)
_LEGUME_DISH_WORDS = (
    "lenteja",
    "lentejas",
    "garbanzo",
    "garbanzos",
    "judía",
    "judia",
    "alubia",
    "alubias",
    "haba",
    "habas",
    "legumbre",
    "potaje",
    "cocido",
    "fabada",
    "pisto",
)
# Carnes/pescados de "plato principal" poco típicos en desayuno español (salvo fiambre/lonchas).
_BREAKFAST_DISCOURAGED_PLATE_PROTEIN = (
    "pollo",
    "pechuga",
    "muslo",
    "contramuslo",
    "ternera",
    "solomillo",
    "chuleta",
    "carne picada",
    "hamburguesa",
    "costilla",
    "costillas",
    "conejo",
    "cordero",
    "rabo",
    "rabo de",
    "merluza",
    "bacalao",
    "salmón",
    "salmon",
    "dorada",
    "lubina",
    "sepia",
    "calamar",
    "pulpo",
    "cerdo",
    "lomo de cerdo",
    "filete de cerdo",
)


def _breakfast_plate_protein_exception(name: str) -> bool:
    """Fiambre/lonchas o atún de lata: aceptables en desayuno; plato de pollo/pescado fresco, no."""
    n = _food_name(name)
    if any(
        x in n
        for x in (
            "fiambre",
            "loncha",
            "lonchas",
            "jamón york",
            "jamon york",
            "jamón cocido",
            "jamon cocido",
        )
    ):
        return True
    if ("atún" in n or "atun" in n) and any(
        x in n for x in ("lata", "escurr", "al natural")
    ):
        return True
    return False


def _breakfast_has_discouraged_plate_protein(foods: list) -> bool:
    for f in foods:
        n = _food_name(f.name)
        if _breakfast_plate_protein_exception(n):
            continue
        if any(w in n for w in _BREAKFAST_DISCOURAGED_PLATE_PROTEIN):
            return True
    return False


def _as_float(v: Any) -> float:
    try:
        if v is None or v == "":
            return 0.0
        return float(v)
    except (TypeError, ValueError):
        return 0.0


_TOMATE_PROCESSED_MARKERS = (
    "frito",
    "triturado",
    "passata",
    "concentrado",
    "salsa de tomate",
    "salsa tomate",
    "lata",
    "brick",
    "conserva",
    "pelado",
)


def _is_fresh_tomate_item(name: str) -> bool:
    n = _food_name(name)
    if "tomate" not in n:
        return False
    return not any(m in n for m in _TOMATE_PROCESSED_MARKERS)


def _is_countable_whole_fruit_item(name: str) -> bool:
    """Fruta que en casa se cuenta en piezas (no zumo ni batido)."""
    n = _food_name(name)
    if any(x in n for x in ("zumo", "batido", "licuado", "smoothie", "compota")):
        return False
    return any(
        w in n
        for w in (
            "manzana",
            "pera",
            "plátano",
            "platano",
            "banana",
            "naranja",
            "mandarina",
            "kiwi",
        )
    )


def _food_portion_bounds(name: str, meal_type: str) -> tuple[float, float]:
    n = _food_name(name)
    mt = (meal_type or "").lower().strip()

    if any(w in n for w in ("aceite", "aove")):
        return 3.0, 18.0
    if any(w in n for w in ("almendra", "nuez", "avellana", "cacahuete", "semillas", "pipas", "tahini")):
        return 8.0, 40.0
    if any(w in n for w in ("crema de cacahuete", "mantequilla de cacahuete")):
        return 10.0, 35.0
    if any(w in n for w in ("huevo", "huevos", "yema", "yemas")):
        return 55.0, 240.0
    if any(w in n for w in ("clara", "claras")):
        return 80.0, 320.0
    if any(w in n for w in ("pan", "tostada", "tostadas")):
        return 25.0, 110.0 if mt == "breakfast" else 140.0
    if "avena" in n and any(
        w in n for w in ("cocida", "cocido", "gacha", "porridge", "preparada", "bowl")
    ):
        return 120.0, 400.0
    if any(w in n for w in ("avena", "granola", "muesli", "copos", "cereal", "cereales")):
        return 20.0, 100.0
    if any(w in n for w in ("yogur", "yogurt", "skyr", "leche", "kéfir", "kefir", "queso batido", "queso fresco", "requesón", "requeson")):
        lo_d, hi_d = 100.0, 350.0
        if mt == "snack":
            hi_d = 240.0
        return lo_d, hi_d
    if "tomate" in n:
        if any(x in n for x in _TOMATE_PROCESSED_MARKERS):
            return 20.0, 120.0
        return 35.0, 180.0 if mt in ("lunch", "dinner") else 130.0
    if any(w in n for w in ("manzana", "pera")):
        return 120.0, 160.0
    if any(w in n for w in ("plátano", "platano", "banana")):
        return 90.0, 125.0
    if any(w in n for w in ("naranja", "mandarina")):
        return 130.0, 190.0
    if "kiwi" in n:
        return 75.0, 110.0
    if "frutos rojos" in n or "arándano" in n or "arandano" in n:
        return 40.0, 150.0
    if "piña" in n or "pina" in n:
        return 80.0, 180.0
    if "fruta" in n and not any(x in n for x in ("pasas", "secas", "cand")):
        return 80.0, 180.0
    if any(w in n for w in ("arroz", "pasta", "quinoa", "cuscús", "cuscus", "patata", "patatas", "boniato", "batata", "maíz", "maiz", "wrap", "tortilla de trigo")):
        return 60.0, 320.0 if mt in ("lunch", "dinner") else 220.0
    if any(w in n for w in ("lentejas", "garbanzos", "judías", "judias", "alubias", "legumbres", "edamame")):
        return 60.0, 280.0
    if any(w in n for w in ("pollo", "pavo", "ternera", "cerdo", "merluza", "bacalao", "salmón", "salmon", "atún", "atun", "sardina", "caballa", "tofu", "tempeh", "seitán", "seitan")):
        return 80.0, 260.0 if mt in ("lunch", "dinner") else 180.0
    if any(
        w in n
        for w in (
            "lechuga",
            "mezclum",
            "rúcula",
            "rucula",
            "endivia",
            "endibias",
            "escarola",
            "canónigos",
            "canonigos",
        )
    ):
        return 25.0, 120.0 if mt == "breakfast" else 160.0
    if any(w in n for w in ("pepino", "zanahoria", "pimiento", "brócoli", "brocoli", "coliflor", "espinaca", "espinacas", "judías verdes", "judias verdes", "calabacín", "calabacin", "berenjena", "menestra", "champiñón", "champiñones", "setas", "calabaza", "alcachofa")):
        return 40.0, 200.0 if mt in ("lunch", "dinner") else 150.0
    if any(w in n for w in ("ensalada", "verdura", "verduras")):
        return 40.0, 320.0 if mt in ("lunch", "dinner") else 200.0
    if any(w in n for w in ("queso curado", "queso azul", "jamón serrano", "jamon serrano", "jamón curado", "jamon curado", "fiambre", "bacon", "beicon")):
        return 10.0, 70.0
    return 15.0, 350.0 if mt in ("lunch", "dinner") else 240.0


def _meal_kcal_share_bounds(meal_type: str, meals_per_day: int) -> tuple[float, float]:
    n = max(3, min(6, int(meals_per_day or 4)))
    profiles = {
        3: {
            "breakfast": (0.16, 0.32),
            "lunch": (0.30, 0.46),
            "dinner": (0.24, 0.40),
            "snack": (0.06, 0.16),
        },
        4: {
            "breakfast": (0.16, 0.30),
            "lunch": (0.26, 0.40),
            "dinner": (0.22, 0.34),
            "snack": (0.08, 0.18),
        },
        5: {
            "breakfast": (0.14, 0.26),
            "lunch": (0.24, 0.38),
            "dinner": (0.20, 0.32),
            "snack": (0.06, 0.14),
        },
        6: {
            "breakfast": (0.14, 0.24),
            "lunch": (0.22, 0.36),
            "dinner": (0.18, 0.30),
            "snack": (0.05, 0.12),
        },
    }
    mt = (meal_type or "").lower().strip()
    return profiles[n].get(mt, (0.08, 0.35))


def _meal_titles_es() -> dict[str, str]:
    return {"breakfast": "Desayuno", "lunch": "Comida", "dinner": "Cena", "snack": "Snack"}


class DietFoodItem(BaseModel):
    name: str
    grams: float
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float

    @model_validator(mode="before")
    @classmethod
    def _normalize_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "grams" not in d or d.get("grams") in (None, ""):
            for alt in ("quantity", "amount_g", "weight_g", "portion_grams", "gramos"):
                if alt in d and d[alt] not in (None, ""):
                    d["grams"] = d[alt]
                    break
        if "protein_g" not in d or d.get("protein_g") in (None, ""):
            if "protein" in d and d["protein"] is not None:
                d["protein_g"] = d["protein"]
        if "carbs_g" not in d or d.get("carbs_g") in (None, ""):
            for alt in ("carbs", "carbohydrates_g", "carbohydrates"):
                if alt in d and d[alt] is not None:
                    d["carbs_g"] = d[alt]
                    break
        if "fat_g" not in d or d.get("fat_g") in (None, ""):
            for alt in ("fat", "fats_g"):
                if alt in d and d[alt] is not None:
                    d["fat_g"] = d[alt]
                    break
        if d.get("kcal") in (None, "", 0) and d.get("calories") not in (None, ""):
            d["kcal"] = d["calories"]
        p, c, f = _as_float(d.get("protein_g")), _as_float(d.get("carbs_g")), _as_float(d.get("fat_g"))
        if d.get("kcal") in (None, "", 0):
            d["kcal"] = round(4 * p + 4 * c + 9 * f, 1)
        if _as_float(d.get("grams")) <= 0:
            k = _as_float(d.get("kcal"))
            if k <= 0:
                k = max(0.0, 4 * p + 4 * c + 9 * f)
            if k > 0:
                d["grams"] = max(25.0, min(500.0, round(k / 1.55, 1)))
            else:
                d["grams"] = 100.0
        name_lower = str(d.get("name", "")).lower()
        g_egg = _as_float(d.get("grams"))
        if g_egg > 0 and g_egg <= 12 and any(
            w in name_lower for w in ("huevo", "huevos", "clara", "claras", "yema", "yemas")
        ):
            d["grams"] = round(min(360.0, max(55.0, g_egg * 58.0)), 1)
        return d


class DietMealPlan(BaseModel):
    meal_type: str
    title: str = ""
    foods: List[DietFoodItem]
    total_kcal: float = 0
    total_protein_g: float = 0
    total_carbs_g: float = 0
    total_fat_g: float = 0

    @model_validator(mode="after")
    def _title_and_totals_from_foods(self) -> "DietMealPlan":
        mt = (self.meal_type or "").lower().strip()
        title = (self.title or "").strip() or _meal_titles_es().get(mt, "Comida")
        if not self.foods:
            return self.model_copy(update={"title": title[:200]})
        tk = round(sum(f.kcal for f in self.foods), 1)
        tp = round(sum(f.protein_g for f in self.foods), 1)
        tc = round(sum(f.carbs_g for f in self.foods), 1)
        tf = round(sum(f.fat_g for f in self.foods), 1)
        return self.model_copy(
            update={
                "title": title[:200],
                "total_kcal": tk,
                "total_protein_g": tp,
                "total_carbs_g": tc,
                "total_fat_g": tf,
            }
        )


class DietDayPlan(BaseModel):
    day_number: int
    day_label: str
    meals: List[DietMealPlan]


class DietMealsChunk(BaseModel):
    """Solo comidas (generación en 2 pasos para cupo Groq bajo)."""

    meals: List[DietMealPlan]


class GeneratedDietPlan(BaseModel):
    target_kcal: float
    target_protein_g: float
    target_carbs_g: float
    target_fat_g: float
    days: List[DietDayPlan]
    shopping_list: List[dict] = Field(default_factory=list)
    rationale_short: str = ""
    caveats: List[str] = Field(default_factory=list)


DIET_DAY_JSON_INSTRUCTION = """
Responde ÚNICAMENTE con un único objeto JSON válido (sin ``` ni texto fuera).

Estructura exacta:
{
  "day_number": <int>,
  "day_label": "<str, máx. 20 caracteres>",
  "meals": [
    {
      "meal_type": "breakfast" | "lunch" | "dinner" | "snack",
      "title": "<nombre del plato en español>",
      "foods": [
        {
          "name": "<alimento concreto en español>",
          "grams": <float, siempre GRAMOS de porción; huevos: ~55g por unidad (ej. 2 huevos → 110)>,
          "kcal": <float>,
          "protein_g": <float>,
          "carbs_g": <float>,
          "fat_g": <float>
        }
      ],
      "total_kcal": <float>,
      "total_protein_g": <float>,
      "total_carbs_g": <float>,
      "total_fat_g": <float>
    }
  ]
}

Obligatorio:
- Incluye tantas comidas como indique el enunciado (meal_type en minúsculas en inglés).
- Desayuno, comida y cena: mínimo 2 alimentos distintos en "foods". Snack: 1–2 alimentos con sentido.
- Cada "name" debe ser un ingrediente atómico real (supermercado/cocina española). PROHIBIDO usar: plantilla, sustituye, ejemplo, rellena, TBD, alimento X.
- PROHIBIDO usar nombres ambiguos/no comprables: "ensalada mixta", "verduras", "fruta", "fruta variada", "plato combinado", "cereales".
- PROHIBIDO usar unidades en el name: "1 manzana", "2 huevos", "1 taza", "1 tostada", "1 cucharada". El nombre va sin unidades; toda cantidad va solo en "grams".
- PROHIBIDO anteponer gramos al name (ej. "150g pollo"); la cantidad va solo en "grams".
- total_* de cada comida = suma de los foods (tolerancia ±10% en kcal y macros).
- kcal por alimento coherente con macros: aprox. kcal ≈ 4×protein_g + 4×carbs_g + 9×fat_g por ítem (±10%).
- La suma del día debe encajar con los objetivos P/C/G/kcal del enunciado (±10% cada macro y kcal); reequilibra porciones si hiciera falta.
- Las comidas deben ser plausibles y humanas, no solo correctas en macros.
- Evita concentrar demasiadas kcal en una sola comida salvo que el usuario tenga muy pocas comidas al día.
- Usa porciones culinarias realistas:
  · pan habitual por ración: ~25–110 g
  · huevos habituales por ración: 1–4 unidades (~55 g por unidad)
  · avena habitual: ~20–100 g
  · frutos secos/semillas: ~8–40 g
  · aceite: ~3–18 g por comida
  · arroz/pasta/patata cocidos: ~60–320 g
  · carne/pescado/tofu: ~80–260 g
  · fruta entera = 1 pieza (manzana ~130–155 g, plátano ~100–120 g, naranja ~150–180 g, kiwi ~80–105 g, pera ~140–155 g); sin unidades en name; NUNCA superar el peso de 1 pieza
  · tomate fresco (guarnición, ensalada, rallado en pan): ~80–180 g en comida/cena, ~80–130 g en desayuno; no 300–400 g de tomate solo
  · verdura individual (zanahoria, brócoli, pimiento, calabacín, etc.): máximo ~200 g por comida en comida/cena, ~150 g en desayuno/snack; no 300–400 g de una sola verdura
- kcal coherentes con el alimento y los gramos: patata ~77 kcal/100g, arroz cocido ~130 kcal/100g, pollo ~165 kcal/100g, tomate ~18 kcal/100g, zanahoria ~41 kcal/100g; no pongas kcal irreales
- El desayuno debe parecer un desayuno real; la comida y la cena deben parecer platos principales reales; el snack una toma pequeña/coherente.
- Evita menús con solo dos alimentos gigantes para cumplir macros.
- Cada día debe incluir varias fuentes de fibra (fruta, verdura, legumbre, avena, integrales, semillas) y moderar el sodio; no abuses de embutidos, bacon, quesos curados o salsas saladas.
- Desayuno con pan: evita pan+yogur+miel como combo por defecto; prioriza tomate/AOVE, embutido magro moderado o queso fresco, o mermelada sin azúcar con lácteo coherente.
- Lunch/dinner: incluye hidrato cocido (arroz/pasta/patata/legumbre) cuando sea un plato principal; no uses solo 300–400 g de zanahoria u otra verdura como sustituto del carbohidrato principal.
- A lo largo de la semana alterna proteínas animales (pollo, ternera magra, cerdo magro, pescado) y algunas legumbres/huevo según encaje.
"""

# Instrucción JSON: calidad tipo dietista (misma estructura que el schema Pydantic).
DIET_DAY_JSON_COMPACT = """
JSON único sin markdown ni ```.
Raíz: {"day_number":int,"day_label":"≤20","meals":[{"meal_type":"breakfast"|"lunch"|"dinner"|"snack","title":"str","foods":[{"name":"str ES real","grams":n,"kcal":n,"protein_g":n,"carbs_g":n,"fat_g":n}],"total_kcal":n,"total_protein_g":n,"total_carbs_g":n,"total_fat_g":n}]}
Reglas: tantas meals como el enunciado; breakfast/lunch/dinner ≥2 foods; snack 1–2; total_*=suma foods ±10%; kcal ítem≈4P+4C+9G; día suma ±10% vs objetivos.
"title" = nombre de plato reconocible (ej. "Merluza al horno con patata y ensalada"), no genéricos vacíos.
Cada "name" = ingrediente atómico concreto de compra/cocina (no "verduras" sin tipo, no "ensalada mixta", no "fruta variada", no plantilla/ejemplo/TBD). NO unidades en name ("1 manzana", "2 huevos", "1 taza", "1 tostada"). NO anteponer gramos (prohibido "150g pollo"); el peso va SOLO en grams.
Porciones humanas: pan≤110g, huevo~55g/u, arroz/pasta/patata cocidos 60–320g, carne/pescado 80–260g, AOVE 5–15g típico.
Fruta entera: name sin unidades y gramos ~120–200 (manzana) / ~100–130 (plátano); snack/desayuno mejor combinar fruta + yogur/queso fresco ~125–200g. Tomate fresco guarnición/ensalada ~80–180g.
Lunch/dinner: proteína explícita + hidrato cocido salvo plato único completo (p. ej. potaje de legumbres) + verdura/fruta acorde. Desayuno ES plausible. No inflar grasas solo con aceitunas/frutos secos. Suma del día: carbos del usuario casi tan obligatorios como kcal (no dejar carbos muy bajos).
"""

DIET_MEALS_CHUNK_JSON = """JSON único: {"meals":[{"meal_type":"breakfast"|"lunch"|"dinner"|"snack","title":"str plato reconocible","foods":[{"name":"str concreto ES","grams":n,"kcal":n,"protein_g":n,"carbs_g":n,"fat_g":n}],"total_kcal":n,"total_protein_g":n,"total_carbs_g":n,"total_fat_g":n}]}
Mismo orden y n que comidas pedidas. ≥2 foods en breakfast/lunch/dinner. total_*=suma foods. En foods: name atómico, SIN prefijo "150g"/"200 g", SIN unidades ("1 manzana", "2 huevos", "1 taza", "1 tostada") y SIN ambiguos ("ensalada mixta", "verduras", "fruta variada"); grams es la única cantidad.
Estándar dietista: principales con proteína+hidrato+verdura cuando toque; nombres específicos; bloque ~±10% fracción del día.
Fruta sin piezas en el nombre y gramos coherentes; tomate fresco racional (~80–180g en guarnición). Snack: fruta + lácteo ~125–200g, no 300+g de manzana/plátano."""

DIET_FULL_PLAN_JSON_INSTRUCTION = """
JSON único sin markdown. Raíz: target_kcal,target_protein_g,target_carbs_g,target_fat_g (floats del usuario), days[7] (Lunes→Domingo), shopping_list[{name,food_name,quantity,category:null}], rationale_short, caveats[].
Cada día: day_number 1-7, day_label, meals (meal_type breakfast|lunch|dinner|snack, title=plato reconocible, ≥2 foods en principales con ingredientes atómicos concretos, snack razonable, total_*=suma foods, kcal≈4P+4C+9G).
Cada día ±10% kcal y P/C/G vs objetivos. Estándar dietista: principales con proteína+hidrato cocido o legumbres; desayunos ES plausibles; 7 días variados; sin "verduras" vago.
Prohibido en names: unidades ("1 manzana", "2 huevos", "1 taza", "1 tostada") y términos ambiguos ("ensalada mixta", "fruta variada", "plato combinado"). Fruta entera sin piezas en name y con gramos realistas; tomate fresco ~80–180 g en guarnición.
"""


_FORBIDDEN_FOOD_NAME_SUBSTR = (
    "plantilla",
    "sustituye",
    "alimento real",
    "alimento x",
    "ejemplo:",
    "ejemplo ",
    "rellena",
    "tbd",
    "xxxx",
    "lorem",
    "sustitut",
)
_FORBIDDEN_AMBIGUOUS_FOOD_SUBSTR = (
    "ensalada mixta",
    "verduras",
    "fruta variada",
    "plato combinado",
    "cereales",
)
_FOOD_NAME_NON_GRAM_UNITS_RE = re.compile(
    r"\b(?:\d+[.,]?\d*\s*(?:x\s*)?)?(?:u(?:nidad(?:es)?)?|ud(?:s)?|pieza(?:s)?|"
    r"taza(?:s)?|cup(?:s)?|cucharada(?:s)?|cucharadita(?:s)?|rebanada(?:s)?)\b"
)


def _is_placeholder_food_name(name: str) -> bool:
    n = (name or "").strip().lower()
    if len(n) < 4:
        return True
    return any(s in n for s in _FORBIDDEN_FOOD_NAME_SUBSTR)


def _is_ambiguous_food_name(name: str) -> bool:
    n = (name or "").strip().lower()
    return any(s in n for s in _FORBIDDEN_AMBIGUOUS_FOOD_SUBSTR)


def _has_non_gram_units_in_food_name(name: str) -> bool:
    n = (name or "").strip().lower()
    if not n:
        return False
    return bool(_FOOD_NAME_NON_GRAM_UNITS_RE.search(n))


def _meal_has_real_foods(meal: DietMealPlan) -> bool:
    mt = (meal.meal_type or "").lower().strip()
    foods = meal.foods or []
    if not foods:
        return False
    if mt == "snack":
        if len(foods) == 1:
            return not _is_placeholder_food_name(foods[0].name)
        if len(foods) >= 2:
            return all(not _is_placeholder_food_name(f.name) for f in foods[:2])
        return False
    if len(foods) < 2:
        return False
    return all(not _is_placeholder_food_name(f.name) for f in foods)


def _describe_meal_logic_errors(
    meal: DietMealPlan,
    target_kcal: float,
    meals_per_day: int,
    day_total_kcal: float = 0.0,
) -> list[str]:
    errors: list[str] = []
    mt = (meal.meal_type or "").lower().strip()
    foods = meal.foods or []
    if not foods:
        return [f"{mt}: sin alimentos"]

    if not _meal_has_real_foods(meal):
        errors.append(f"{mt}: alimentos genéricos o insuficientes")

    # Reparto diario: usar el total kcal del día devuelto por el modelo (suma de comidas).
    # Si se compara contra target_kcal del usuario y el modelo subestima el día, todas
    # las comidas parecen "demasiado pequeñas" aunque el reparto relativo sea razonable;
    # luego plan_meal_normalize escala a objetivos.
    if target_kcal > 0 and meal.total_kcal > 0:
        denom = day_total_kcal if day_total_kcal > 50.0 else max(target_kcal, 1.0)
        share = meal.total_kcal / max(denom, 1.0)
        _, max_share = _meal_kcal_share_bounds(mt, meals_per_day)
        # Suelo bajo solo para detectar comidas casi vacías; el modelo suele poner 17–22 %
        # en comida/cena y antes chocaba con min_share teórico (~26 %).
        min_floor = 0.055 if mt != "snack" else 0.02
        if share < min_floor:
            errors.append(f"{mt}: demasiado pequeña para el reparto diario")
        if share > max_share + 0.08:
            errors.append(f"{mt}: demasiadas kcal concentradas")

    dense_count = 0
    salty_count = 0
    protein_hits = 0
    carb_hits = 0
    fiber_hits = 0
    produce_hits = 0

    for food in foods:
        name = food.name
        grams = float(food.grams or 0)
        if _is_ambiguous_food_name(name):
            errors.append(
                f'{mt}: nombre ambiguo no permitido en "{name}" (usa ingrediente atómico)'
            )
        if _has_non_gram_units_in_food_name(name):
            errors.append(
                f'{mt}: unidad no permitida en "{name}" (usa solo gramos en el campo grams)'
            )
        lo, hi = _food_portion_bounds(name, mt)
        if grams < max(5.0, lo * 0.45) or grams > hi:
            errors.append(f'{mt}: porción poco realista en "{name}" ({grams:.0f} g)')
        if grams > hi and _is_fresh_tomate_item(name):
            errors.append(
                f'{mt}: tomate fresco desproporcionado en "{name}" ({grams:.0f} g); guarnición o ensalada suele ir ~80–180 g, pan con tomate ~80–120 g rallado'
            )
        elif grams > hi and _is_countable_whole_fruit_item(name):
            errors.append(
                f'{mt}: fruta entera poco adherente en "{name}" ({grams:.0f} g); usa nombre sin piezas y gramos ~120–200, o fruta + yogur/queso fresco ~125–200 g'
            )
        groups = _food_groups(name)
        if "protein" in groups:
            protein_hits += 1
        if "carb" in groups:
            carb_hits += 1
        if "fiber" in groups:
            fiber_hits += 1
        if "veg" in groups or "fruit" in groups:
            produce_hits += 1
        if "salty" in groups:
            salty_count += 1
        if _contains_any(_food_name(name), _STARCH_DENSE_WORDS):
            dense_count += 1

    if mt == "breakfast":
        if _breakfast_has_discouraged_plate_protein(foods):
            errors.append(
                "breakfast: evita carnes o pescados de plato principal (pollo/ternera/pescado a la plancha); prioriza huevo, lácteos, fiambre magro, tostada con tomate/AOVE o avena con yogur/fruta"
            )
        if protein_hits < 1 and not any("dairy" in _food_groups(f.name) for f in foods):
            errors.append("breakfast: falta fuente proteica clara")
        if carb_hits < 1 and not any("fruit" in _food_groups(f.name) for f in foods):
            errors.append("breakfast: falta base energética lógica (carbohidrato o fruta)")
        if dense_count > 2:
            errors.append("breakfast: demasiados alimentos densos juntos")
        if salty_count > 1:
            errors.append("breakfast: demasiados alimentos salados/procesados")
        piece_g = sum(
            float(f.grams or 0) for f in foods if _is_countable_whole_fruit_item(f.name)
        )
        if piece_g > 245.0:
            errors.append(
                f"breakfast: demasiada fruta en piezas en el mismo desayuno ({piece_g:.0f} g); prioriza 1 pieza + yogur o queso fresco ~125–200 g"
            )
    elif mt in ("lunch", "dinner"):
        if protein_hits < 1:
            errors.append(f"{mt}: falta proteína principal")
        if produce_hits < 1 and fiber_hits < 1:
            errors.append(f"{mt}: falta verdura/fruta/fibra visible")
        has_starch_or_legume = any(
            _contains_any(_food_name(f.name), _STARCH_DENSE_WORDS)
            or _contains_any(_food_name(f.name), _LEGUME_DISH_WORDS)
            for f in foods
        )
        if protein_hits >= 1 and not has_starch_or_legume:
            errors.append(
                f"{mt}: falta hidrato de referencia (arroz, pasta, patata, pan, cuscús o legumbre/plato de cuchara)"
            )
        if dense_count > 2:
            errors.append(f"{mt}: demasiados carbohidratos densos en la misma comida")
        for food in foods:
            gn = _food_name(food.name)
            g = float(food.grams or 0)
            if g <= 0:
                continue
            if any(
                w in gn
                for w in (
                    "lechuga",
                    "mezclum",
                    "rúcula",
                    "rucula",
                    "endivia",
                    "escarola",
                    "canónigos",
                    "canonigos",
                )
            ) and g > 170.0:
                errors.append(
                    f"{mt}: exceso de hoja cruda ({g:.0f} g); en plato principal combina menos lechuga con verdura cocida o ensalada mixta equilibrada"
                )
    elif mt == "snack":
        if len(foods) > 3:
            errors.append("snack: demasiados alimentos para una toma pequeña")
        if protein_hits < 1 and not any(g & {"fruit", "dairy"} for g in (_food_groups(f.name) for f in foods)):
            errors.append("snack: poco lógico, falta fruta/lácteo/proteína")
        if meal.total_kcal > max(420.0, target_kcal * 0.18):
            errors.append("snack: demasiadas kcal para una toma pequeña")
        piece_g = sum(
            float(f.grams or 0) for f in foods if _is_countable_whole_fruit_item(f.name)
        )
        if piece_g > 230.0:
            errors.append(
                f"snack: demasiada fruta en piezas ({piece_g:.0f} g); una pieza mediana o pieza + yogur/queso fresco ~125–200 g"
            )

    return errors


_SOFT_QUALITY_MARKERS = (
    "demasiado pequeña para el reparto diario",
    "demasiadas kcal concentradas",
    "porción poco realista",
    "día con poca fibra visible",
    "día con exceso de alimentos salados",
    "demasiados alimentos densos",
    "demasiados carbohidratos densos",
    "demasiadas kcal para una toma pequeña",
    "demasiados alimentos para una toma pequeña",
    "snack: poco lógico",
    # El guardado escala porciones a objetivos (plan_meal_normalize); no re-rechazar aquí.
    "balance del día: carbohidratos muy por debajo del objetivo de la app",
    "balance del día: grasas por encima del objetivo con carbos bajos",
)


def _quality_errors_are_only_soft(errors: list[str]) -> bool:
    """True si los fallos son solo de estilo/reparto; el pipeline escala a objetivos."""
    if not errors:
        return False
    for e in errors:
        if not any(m in e for m in _SOFT_QUALITY_MARKERS):
            return False
    return True


def _day_macro_sums(day: DietDayPlan) -> tuple[float, float, float]:
    tp = tc = tf = 0.0
    for m in day.meals or []:
        tp += float(m.total_protein_g or 0)
        tc += float(m.total_carbs_g or 0)
        tf += float(m.total_fat_g or 0)
    return tp, tc, tf


def _describe_day_quality_errors(
    day: DietDayPlan,
    meals_per_day: int,
    target_kcal: float,
    target_protein_g: float = 0.0,
    target_carbs_g: float = 0.0,
    target_fat_g: float = 0.0,
) -> list[str]:
    errors: list[str] = []
    meals = day.meals or []
    if len(meals) < meals_per_day:
        errors.append("faltan comidas en el día")

    fiber_meal_hits = 0
    salty_hits = 0
    day_kcal_sum = sum(float(m.total_kcal or 0) for m in meals)
    for meal in meals:
        errors.extend(
            _describe_meal_logic_errors(meal, target_kcal, meals_per_day, day_kcal_sum)
        )
        if any(("fiber" in _food_groups(f.name) or "veg" in _food_groups(f.name) or "fruit" in _food_groups(f.name)) for f in meal.foods):
            fiber_meal_hits += 1
        salty_hits += sum(1 for f in meal.foods if "salty" in _food_groups(f.name))

    min_fiber_hits = 2 if meals_per_day <= 3 else 3
    if fiber_meal_hits < min_fiber_hits:
        errors.append("día con poca fibra visible")
    if salty_hits > 2:
        errors.append("día con exceso de alimentos salados/procesados")

    _, tc_sum, tf_sum = _day_macro_sums(day)
    tc_tgt = float(target_carbs_g or 0)
    tf_tgt = float(target_fat_g or 0)
    if tc_tgt >= 40.0 and tc_sum < tc_tgt * 0.88:
        errors.append(
            "balance del día: carbohidratos muy por debajo del objetivo de la app (energía y gimnasio); "
            "sube arroz, pasta, patata, pan, avena o fruta en comidas principales sin compensar solo con aceite o frutos secos"
        )
    if tf_tgt >= 15.0 and tf_sum > tf_tgt * 1.12 and tc_tgt >= 40.0 and tc_sum < tc_tgt * 0.92:
        errors.append(
            "balance del día: grasas por encima del objetivo con carbos bajos; reduce AOVE/aguacate/frutos secos/quesos grasos "
            "y prioriza hidrato cocido para acercarte al objetivo de carbohidratos"
        )

    return errors


def _day_plan_quality_ok(
    day: DietDayPlan,
    meals_per_day: int,
    target_kcal: float,
    target_protein_g: float = 0.0,
    target_carbs_g: float = 0.0,
    target_fat_g: float = 0.0,
) -> bool:
    errs = _describe_day_quality_errors(
        day,
        meals_per_day,
        target_kcal,
        target_protein_g,
        target_carbs_g,
        target_fat_g,
    )
    if not errs:
        return True
    return _quality_errors_are_only_soft(errs)


def _day_minimally_valid(day: DietDayPlan, slots_n: int) -> bool:
    """Estructura mínima para persistir (evita 500 si la heurística de calidad es demasiado estricta)."""
    meals = day.meals or []
    if len(meals) != slots_n:
        return False
    for m in meals:
        fs = m.foods or []
        if not fs:
            return False
        for f in fs:
            if not str(getattr(f, "name", None) or "").strip():
                return False
    return True


def _full_plan_quality_ok(plan: GeneratedDietPlan, meals_per_day: int) -> bool:
    days = plan.days or []
    if len(days) < 7:
        return False
    tk = float(plan.target_kcal or 0)
    tp = float(plan.target_protein_g or 0)
    tc = float(plan.target_carbs_g or 0)
    tf = float(plan.target_fat_g or 0)
    for d in days:
        if not _day_plan_quality_ok(d, meals_per_day, tk, tp, tc, tf):
            return False
    return True


DIET_GENERATION_PROMPT = """Genera un plan de alimentación semanal (7 días) personalizado como nutricionista deportivo práctico (españa, estilo de vida real).

{expert_context}

{guide_inline}

DATOS DEL USUARIO (cifras calculadas por la app; son la referencia numérica obligatoria):
- Objetivo calórico: {target_kcal} kcal/día
- Proteína objetivo: {target_protein_g}g/día
- Carbohidratos objetivo: {target_carbs_g}g/día
- Grasas objetivo: {target_fat_g}g/día
- Objetivo: {goal_type}
- Comidas por día: {meals_per_day}
- Preferencias: {preferences}
- Alimentos que no le gustan: {disliked}
- Alergias e intolerancias (PROHIBIDO incluir estos alimentos o derivados): {allergies}
{additional}

REGLAS DE CALIDAD:
1. Prioridad: alergias, intolerancias y alimentos prohibidos > alimentos que no gustan > preferencias dietéticas > ajuste a kcal/macros. NUNCA incluyas un alimento de la lista de alergias/intolerancias/prohibidos ni sus derivados.
2. Cada día debe acercarse a los objetivos de macros (±10% en P, C y G) y a las kcal (±10%); prioriza acertar carbohidratos en días activos (no sustituir hidrato por aceite/frutos secos en exceso).
3. Coherencia nutricional: kcal de cada alimento ≈ 4×proteína + 4×carbos + 9×grasas; totales de comida = suma de ítems.
4. Usa alimentos reales y accesibles en España; nombres en español.
5. Varía proteínas, carbos y verduras entre días; evita repetir el mismo almuerzo o cena los 7 días.
6. Si el contexto indica actividad o entrenamiento, distribuye hidratos y proteína de forma práctica.
7. Gramos realistas (múltiplos de 5–10 g); indica cocción cuando cambie densidad (ej. pasta/arroz cocidos).
8. Incluye lista de la compra agregada para la semana en shopping_list.
9. rationale_short: explica en 2–4 frases el enfoque según objetivo y perfil.
10. caveats: estimaciones, ajuste por hambre/actividad; consulta profesional si hay patología.
11. Respeta alergias y exclusiones al 100%.
12. meal_type EXACTAMENTE uno de: breakfast, lunch, dinner, snack (minúsculas, inglés).
13. Cada comida debe ser culinariamente plausible: desayuno realista; lunch/dinner como platos principales; snack pequeño/coherente.
14. No concentres gran parte de las kcal en pan, huevos, aceite, frutos secos o un solo alimento.
15. Asegura fibra diaria visible (fruta, verdura, legumbre, avena, integrales) y modera el sodio; limita embutidos, bacon, quesos curados y salsas saladas.

Genera el plan completo con macros calculados para cada alimento."""


def _variety_hint_line(day_number: int) -> str:
    return (
        f"Semana día {day_number}/7: alterna proteínas (pollo, pavo, ternera/cerdo magro, pescado blanco/azul, huevo, legumbres) "
        f"y fuentes de hidrato (arroz, pasta, patata, pan integral, legumbre). Evita copiar el mismo almuerzo/cena que días anteriores."
    )


SINGLE_DAY_PROMPT = """{day_label} ({day_number}/7) slots:{meal_slots_line}.
{expert_context}
{guide_inline}
{variety_hint}
Objetivos del día (±10% al sumar todas las comidas): {target_kcal} kcal, P{target_protein_g} g, C{target_carbs_g} g, G{target_fat_g} g.
Objetivo fase: {goal_type}. Preferencias: {preferences}. No gusta: {disliked}. Alergias: {allergies}. {additional}
Entrega un día digno de revisión profesional: títulos de plato claros, alimentos nombrados con precisión, reparto lógico de P/C/G y cocina española creíble.
Orden meal_type = orden de slots; 2+ foods en breakfast/lunch/dinner.
day_number={day_number} day_label="{day_label}"."""


def _meal_slots_for_count(n: int) -> List[str]:
    if n <= 1:
        return ["breakfast"]
    if n == 2:
        return ["breakfast", "dinner"]
    if n == 3:
        return ["breakfast", "lunch", "dinner"]
    if n == 4:
        return ["breakfast", "lunch", "dinner", "snack"]
    if n == 5:
        return ["breakfast", "snack", "lunch", "snack", "dinner"]
    return ["breakfast", "snack", "lunch", "snack", "dinner", "snack"]


def _meal_slots_line(slots: List[str]) -> str:
    es = {"breakfast": "desayuno", "lunch": "comida", "dinner": "cena", "snack": "snack"}
    return ", ".join(f"{s}={es.get(s, s)}" for s in slots)


def _scale_day_macros(
    kcal: float, p: float, c: float, f: float, part: int, whole: int
) -> tuple[float, float, float, float]:
    if whole <= 0:
        return kcal, p, c, f
    r = part / whole
    return (
        round(kcal * r, 1),
        round(p * r, 1),
        round(c * r, 1),
        round(f * r, 1),
    )


CHUNK_MEALS_PROMPT = """{day_label} ({day_number}/7) bloque:{order_line}.
{expert_context}
{guide_inline}
{variety_hint}
Bloque (≈±10% de la fracción del día que corresponde): {target_kcal} kcal, P{target_protein_g} C{target_carbs_g} G{target_fat_g} g. Fase: {goal_type}. Pref:{preferences}. No:{disliked}. Aler:{allergies}. {additional}
Prioridad: alergias > no gustan > preferencias. Genera {n_meals} comidas con meal_type en este orden exacto: {types_csv}.
Criterio experto: platos completos donde toque, nombres de alimento concretos, sin atajos grasos absurdos."""


def _shopping_list_from_days(days: List[DietDayPlan]) -> List[dict]:
    """Agrega gramos por nombre de alimento a partir del plan."""
    agg: dict[str, float] = {}
    for d in days:
        for meal in d.meals:
            for f in meal.foods:
                name = (f.name or "").strip()
                if not name:
                    continue
                low = name.lower()
                if "plantilla" in low or "sustituye" in low or "alimento real" in low:
                    continue
                agg[name] = agg.get(name, 0) + float(f.grams or 0)
    return [
        {
            "name": n,
            "food_name": n,
            "quantity": f"~{int(round(grams))} g total en la semana",
            "category": None,
        }
        for n, grams in sorted(agg.items(), key=lambda x: (-x[1], x[0]))
    ]


async def _call_meals_subchunk(
    *,
    day_label: str,
    day_number: int,
    slot_part: List[str],
    total_slots: int,
    target_kcal: float,
    target_protein_g: float,
    target_carbs_g: float,
    target_fat_g: float,
    goal_label_es: str,
    preferences: str,
    disliked: str,
    allergies: str,
    additional: str,
    expert_context: str,
    guide_inline: str,
    plan_model: str,
    max_tokens: int,
) -> Optional[List[DietMealPlan]]:
    tk, tp, tc, tf = _scale_day_macros(
        target_kcal, target_protein_g, target_carbs_g, target_fat_g, len(slot_part), total_slots
    )
    prompt = CHUNK_MEALS_PROMPT.format(
        day_label=day_label,
        day_number=day_number,
        order_line=_meal_slots_line(slot_part),
        expert_context=expert_context,
        guide_inline=guide_inline,
        variety_hint=_variety_hint_line(day_number),
        target_kcal=tk,
        target_protein_g=tp,
        target_carbs_g=tc,
        target_fat_g=tf,
        goal_type=goal_label_es,
        preferences=preferences,
        disliked=disliked,
        allergies=allergies,
        additional=additional or "",
        n_meals=len(slot_part),
        types_csv=",".join(slot_part),
    )
    try:
        chunk = await structured_output(
            messages=[{"role": "user", "content": prompt}],
            response_model=DietMealsChunk,
            model=plan_model,
            temperature=0.34,
            max_tokens=max_tokens,
            json_instruction=DIET_MEALS_CHUNK_JSON,
            max_retries=GROQ_PLAN_STRUCTURED_RETRIES,
            system_prompt=PLAN_NUTRITIONIST_SYSTEM_PROMPT,
        )
        await _plan_groq_cooldown()
    except Exception as e:
        logger.warning("Subchunk día %s falló: %s", day_number, e)
        await _plan_groq_cooldown()
        return None
    meals = chunk.meals or []
    if len(meals) < len(slot_part):
        return None

    fixed: List[DietMealPlan] = []
    for i, mt in enumerate(slot_part):
        if i >= len(meals):
            break
        m = meals[i]
        fixed.append(m.model_copy(update={"meal_type": mt}))
    return fixed if len(fixed) == len(slot_part) else None


async def _generate_one_day_split(
    day_number: int,
    day_label: str,
    slots: List[str],
    target_kcal: float,
    target_protein_g: float,
    target_carbs_g: float,
    target_fat_g: float,
    goal_type_key: str,
    goal_label_es: str,
    preferences: str,
    disliked: str,
    allergies: str,
    additional: str,
    plan_model: str,
    max_tokens: int,
    plan_profile: Optional[dict] = None,
) -> Optional[DietDayPlan]:
    if len(slots) < 2:
        return None
    mid = max(1, len(slots) // 2)
    part1, part2 = slots[:mid], slots[mid:]
    expert = build_expert_block_single_day_compact(goal_type_key, plan_profile)
    m1 = await _call_meals_subchunk(
        day_label=day_label,
        day_number=day_number,
        slot_part=part1,
        total_slots=len(slots),
        target_kcal=target_kcal,
        target_protein_g=target_protein_g,
        target_carbs_g=target_carbs_g,
        target_fat_g=target_fat_g,
        goal_label_es=goal_label_es,
        preferences=preferences,
        disliked=disliked,
        allergies=allergies,
        additional=additional,
        expert_context=expert,
        guide_inline=GUIDE_PLAN_INLINE_PLAN_GEN,
        plan_model=plan_model,
        max_tokens=max_tokens,
    )
    await _plan_groq_cooldown()
    m2 = await _call_meals_subchunk(
        day_label=day_label,
        day_number=day_number,
        slot_part=part2,
        total_slots=len(slots),
        target_kcal=target_kcal,
        target_protein_g=target_protein_g,
        target_carbs_g=target_carbs_g,
        target_fat_g=target_fat_g,
        goal_label_es=goal_label_es,
        preferences=preferences,
        disliked=disliked,
        allergies=allergies,
        additional=additional,
        expert_context=expert,
        guide_inline=GUIDE_PLAN_INLINE_PLAN_GEN,
        plan_model=plan_model,
        max_tokens=max_tokens,
    )
    if not m1 or not m2:
        return None
    merged = m1 + m2
    day = DietDayPlan(
        day_number=day_number,
        day_label=day_label[:20],
        meals=merged,
    )
    if not _day_minimally_valid(day, len(slots)):
        return None
    if _day_plan_quality_ok(
        day,
        len(slots),
        target_kcal,
        target_protein_g,
        target_carbs_g,
        target_fat_g,
    ):
        return day
    logger.warning(
        "Día %s (%s) modo split: estructura OK; calidad no ideal → se acepta (normalización en BD)",
        day_number,
        day_label,
    )
    return day


_KCAL_DENSITY_TABLE: list[tuple[tuple[str, ...], float, float, float, float]] = [
    # (keywords, kcal_per_g, protein_per_g, carbs_per_g, fat_per_g)
    (("patata", "patatas", "boniato", "batata"), 0.77, 0.020, 0.170, 0.001),
    (("arroz",), 1.30, 0.027, 0.280, 0.003),
    (("pasta",), 1.31, 0.050, 0.250, 0.011),
    (("pollo",), 1.65, 0.310, 0.000, 0.036),
    (("pavo",), 1.35, 0.290, 0.000, 0.010),
    (("ternera",), 1.50, 0.260, 0.000, 0.050),
    (("cerdo",), 1.43, 0.270, 0.000, 0.035),
    (("merluza", "bacalao"), 0.82, 0.170, 0.000, 0.007),
    (("salmón", "salmon"), 2.08, 0.200, 0.000, 0.130),
    (("atún", "atun"), 1.32, 0.290, 0.000, 0.010),
    (("huevo",), 1.55, 0.130, 0.011, 0.110),
    (("tomate",), 0.18, 0.009, 0.039, 0.002),
    (("zanahoria",), 0.41, 0.009, 0.096, 0.002),
    (("brócoli", "brocoli"), 0.34, 0.028, 0.070, 0.004),
    (("manzana",), 0.52, 0.003, 0.138, 0.002),
    (("plátano", "platano", "banana"), 0.89, 0.011, 0.228, 0.003),
    (("pan", "tostada"), 2.65, 0.090, 0.490, 0.033),
    (("avena",), 3.89, 0.169, 0.660, 0.069),
    (("yogur", "yogurt", "skyr"), 0.59, 0.035, 0.046, 0.032),
    (("leche",), 0.42, 0.033, 0.047, 0.010),
    (("lentejas", "garbanzos"), 1.16, 0.090, 0.200, 0.006),
    (("quinoa",), 1.20, 0.044, 0.214, 0.019),
    (("pepino",), 0.16, 0.007, 0.036, 0.001),
    (("pimiento",), 0.31, 0.010, 0.064, 0.003),
    (("espinaca", "espinacas"), 0.23, 0.029, 0.036, 0.004),
    (("calabacín", "calabacin"), 0.17, 0.012, 0.031, 0.003),
    (("aceite", "aove"), 8.84, 0.000, 0.000, 1.000),
]


def _fix_food_kcal_density(food: "DietFoodItem") -> None:
    """Corrige kcal y macros si la densidad calórica es irreal vs tabla conocida."""
    n = _food_name(food.name)
    grams = float(food.grams or 0)
    if grams <= 0:
        return
    for keywords, ref_kcal_g, ref_p_g, ref_c_g, ref_f_g in _KCAL_DENSITY_TABLE:
        if not any(k in n for k in keywords):
            continue
        expected_kcal = grams * ref_kcal_g
        actual_kcal = float(food.kcal or 0)
        if expected_kcal < 5:
            break
        ratio = actual_kcal / expected_kcal if expected_kcal > 0 else 0
        if ratio < 0.45 or ratio > 2.2:
            food.kcal = round(grams * ref_kcal_g, 1)
            food.protein_g = round(grams * ref_p_g, 1)
            food.carbs_g = round(grams * ref_c_g, 1)
            food.fat_g = round(grams * ref_f_g, 1)
        break


def _autofix_day_foods(day: DietDayPlan) -> DietDayPlan:
    """Limpia nombres y corrige kcal/macros irreal antes de evaluar calidad."""
    for meal in (day.meals or []):
        for food in (meal.foods or []):
            clean = sanitize_food_display_name(food.name)
            if clean and clean != food.name:
                food.name = clean
            _fix_food_kcal_density(food)
        if meal.foods:
            meal.total_kcal = round(sum(f.kcal for f in meal.foods), 1)
            meal.total_protein_g = round(sum(f.protein_g for f in meal.foods), 1)
            meal.total_carbs_g = round(sum(f.carbs_g for f in meal.foods), 1)
            meal.total_fat_g = round(sum(f.fat_g for f in meal.foods), 1)
    return day


async def _generate_one_day_chunked(
    day_number: int,
    day_label: str,
    target_kcal: float,
    target_protein_g: float,
    target_carbs_g: float,
    target_fat_g: float,
    goal_type_key: str,
    goal_label_es: str,
    meals_per_day: int,
    preferences: str,
    disliked: str,
    allergies: str,
    additional: str,
    plan_profile: Optional[dict] = None,
) -> Optional[DietDayPlan]:
    expert_context = build_expert_block_single_day_compact(goal_type_key, plan_profile)
    slots = _meal_slots_for_count(meals_per_day)
    meal_slots_line = _meal_slots_line(slots)
    prompt = SINGLE_DAY_PROMPT.format(
        expert_context=expert_context,
        guide_inline=GUIDE_PLAN_INLINE_PLAN_GEN,
        variety_hint=_variety_hint_line(day_number),
        day_label=day_label,
        day_number=day_number,
        target_kcal=target_kcal,
        target_protein_g=target_protein_g,
        target_carbs_g=target_carbs_g,
        target_fat_g=target_fat_g,
        goal_type=goal_label_es,
        meal_slots_line=meal_slots_line,
        preferences=preferences,
        disliked=disliked,
        allergies=allergies,
        additional=additional or "",
    )
    settings = get_settings()
    plan_model = (settings.groq_plan_model or "").strip() or settings.groq_chat_model
    out_cap = int(getattr(settings, "groq_plan_max_output_tokens", 1536) or 1536)
    cap = max(640, min(3072, out_cap))
    pause = float(getattr(settings, "groq_plan_delay_between_days_seconds", 6.0) or 6.0)
    attempts: list[tuple[float, int]] = [
        (0.28, cap),
        (0.22, min(cap + 320, 4096)),
    ]
    feedback = ""
    fallback_day: Optional[DietDayPlan] = None
    for attempt, (temp, max_tok) in enumerate(attempts, start=1):
        try:
            prompt_with_feedback = prompt
            if feedback:
                prompt_with_feedback += (
                    "\nCORRECCIÓN: " + feedback + ". Mantén objetivos diarios."
                )
            day = await structured_output(
                messages=[{"role": "user", "content": prompt_with_feedback}],
                response_model=DietDayPlan,
                model=plan_model,
                temperature=temp,
                max_tokens=max_tok,
                json_instruction=DIET_DAY_JSON_COMPACT,
                max_retries=GROQ_PLAN_STRUCTURED_RETRIES,
                system_prompt=PLAN_NUTRITIONIST_SYSTEM_PROMPT,
            )
            await _plan_groq_cooldown()
            day = day.model_copy(
                update={
                    "day_number": day_number,
                    "day_label": (day.day_label or day_label)[:20],
                }
            )
            day = _autofix_day_foods(day)
            errors = _describe_day_quality_errors(
                day,
                meals_per_day,
                target_kcal,
                target_protein_g,
                target_carbs_g,
                target_fat_g,
            )
            if not errors:
                return day
            if _quality_errors_are_only_soft(errors):
                logger.info(
                    "Día %s intento %s: aceptado (solo avisos de reparto/porción; se normalizará a objetivos)",
                    day_number,
                    attempt,
                )
                return day
            if _day_minimally_valid(day, len(slots)):
                fallback_day = day
            feedback = "; ".join(errors[:2])
            logger.warning(
                "Día %s intento %s: JSON válido pero poco plausible (%s); reintentando",
                day_number,
                attempt,
                feedback,
            )
            if pause > 0:
                await asyncio.sleep(max(4.0, pause))
        except Exception as e:
            logger.warning("Día %s intento %s falló: %s", day_number, attempt, e)
            await _plan_groq_cooldown()
            if "413" in str(e) or "too large" in str(e).lower() or "rate_limit" in str(e).lower():
                await asyncio.sleep(max(8.0, pause))

    logger.info("Día %s: probando generación en 2 bloques (cupos Groq bajos)", day_number)
    split = await _generate_one_day_split(
        day_number,
        day_label,
        slots,
        target_kcal,
        target_protein_g,
        target_carbs_g,
        target_fat_g,
        goal_type_key,
        goal_label_es,
        preferences,
        disliked,
        allergies,
        additional,
        plan_model,
        cap,
        plan_profile,
    )
    if split is not None:
        return split
    if fallback_day is not None:
        logger.warning(
            "Día %s (%s): usando último JSON con estructura válida (fallback; se normalizará en BD)",
            day_number,
            day_label,
        )
        return fallback_day
    return None


async def _generate_diet_plan_by_day(
    target_kcal: float,
    target_protein_g: float,
    target_carbs_g: float,
    target_fat_g: float,
    goal_type: str,
    meals_per_day: int = 4,
    preferences: Optional[List[str]] = None,
    disliked_foods: Optional[List[str]] = None,
    allergies: Optional[List[str]] = None,
    additional_preferences: Optional[str] = None,
    plan_profile: Optional[dict] = None,
) -> Optional[GeneratedDietPlan]:
    pref_s = ", ".join(preferences or []) or "Sin preferencias específicas"
    dis_s = ", ".join(disliked_foods or []) or "Ninguno"
    al_s = ", ".join(allergies or []) or "Ninguna"
    add_s = (
        f"- Preferencias adicionales: {additional_preferences}" if additional_preferences else ""
    )

    goal_key = (goal_type or "maintain").lower().replace(" ", "_")
    if goal_key not in GOAL_TYPE_LABEL_ES:
        goal_key = "maintain"
    goal_label_es = GOAL_TYPE_LABEL_ES.get(goal_key, goal_type)

    settings = get_settings()
    before = float(getattr(settings, "groq_plan_delay_before_days_seconds", 15.0) or 15.0)
    between = float(getattr(settings, "groq_plan_delay_between_days_seconds", 5.0) or 5.0)
    if before > 0:
        await asyncio.sleep(before)

    days: List[DietDayPlan] = []
    for i in range(7):
        n = i + 1
        label = DAY_LABELS_ES[i]
        day = await _generate_one_day_chunked(
            n,
            label,
            target_kcal,
            target_protein_g,
            target_carbs_g,
            target_fat_g,
            goal_key,
            goal_label_es,
            meals_per_day,
            pref_s,
            dis_s,
            al_s,
            add_s,
            plan_profile,
        )
        if day is None:
            logger.error(
                "No se pudo generar el día %s (%s) con alimentos reales y plausibles; abortando plan semanal.",
                n,
                label,
            )
            return None
        day = day.model_copy(
            update={
                "day_number": n,
                "day_label": (day.day_label or label)[:20],
            }
        )
        days.append(day)
        if i < 6 and between > 0:
            await asyncio.sleep(max(2.0, between))

    shopping = _shopping_list_from_days(days)
    caveats = [
        "Generado día a día con controles extra de plausibilidad culinaria.",
        "Lista de la compra agregada a partir de los alimentos del plan (cantidades orientativas).",
        "Revisa cantidades y ajusta a tu hambre, entrenamiento y tolerancia digestiva.",
    ]

    return GeneratedDietPlan(
        target_kcal=target_kcal,
        target_protein_g=target_protein_g,
        target_carbs_g=target_carbs_g,
        target_fat_g=target_fat_g,
        days=days,
        shopping_list=shopping,
        rationale_short="Plan semanal generado día a día con criterios de nutrición deportiva práctica, reparto más humano de comidas y control adicional de coherencia culinaria.",
        caveats=caveats,
    )


async def _generate_diet_plan_impl(
    target_kcal: float,
    target_protein_g: float,
    target_carbs_g: float,
    target_fat_g: float,
    goal_type: str,
    meals_per_day: int = 4,
    preferences: List[str] = None,
    disliked_foods: List[str] = None,
    allergies: List[str] = None,
    additional_preferences: Optional[str] = None,
    plan_profile: Optional[dict] = None,
) -> Optional[GeneratedDietPlan]:
    goal_labels = {
        "lose_fat": "perder grasa",
        "maintain": "mantener peso",
        "gain_muscle": "ganar músculo",
        "recomposition": "recomposición corporal",
    }
    goal_es = goal_labels.get(goal_type, goal_type)

    expert_full = build_expert_block_for_plan_compact(
        (goal_type or "maintain").lower().replace(" ", "_"),
        plan_profile,
    )

    prompt = DIET_GENERATION_PROMPT.format(
        expert_context=expert_full,
        guide_inline=GUIDE_PLAN_INLINE_PLAN_GEN,
        target_kcal=target_kcal,
        target_protein_g=target_protein_g,
        target_carbs_g=target_carbs_g,
        target_fat_g=target_fat_g,
        goal_type=goal_es,
        meals_per_day=meals_per_day,
        preferences=", ".join(preferences or []) or "Sin preferencias específicas",
        disliked=", ".join(disliked_foods or []) or "Ninguno",
        allergies=", ".join(allergies or []) or "Ninguna",
        additional=f"- Preferencias adicionales: {additional_preferences}"
        if additional_preferences
        else "",
    )

    settings = get_settings()
    plan_model = (settings.groq_plan_model or "").strip() or settings.groq_chat_model
    week_cap = max(1024, min(4096, int(getattr(settings, "groq_plan_max_output_tokens", 2048) or 2048) * 2))
    if settings.groq_plan_try_single_week_call:
        try:
            result = await structured_output(
                messages=[{"role": "user", "content": prompt}],
                response_model=GeneratedDietPlan,
                model=plan_model,
                temperature=0.28,
                max_tokens=week_cap,
                json_instruction=DIET_FULL_PLAN_JSON_INSTRUCTION,
                max_retries=GROQ_PLAN_STRUCTURED_RETRIES,
                system_prompt=PLAN_NUTRITIONIST_SYSTEM_PROMPT,
            )
            await _plan_groq_cooldown()
            if _full_plan_quality_ok(result, meals_per_day):
                logger.info("Plan semanal Groq (1 llamada): %s días", len(result.days))
                return result
            logger.warning(
                "Plan en 1 llamada: JSON válido pero poco plausible o incompleto; pasando a modo por días."
            )
        except Exception as e:
            logger.warning("Plan completo en una llamada no disponible, modo por días: %s", e)
    else:
        logger.info("Plan semanal: omitiendo 1 llamada (GROQ_PLAN_TRY_SINGLE_WEEK_CALL=false); modo por días")

    logger.info("Generando plan: modo 7 peticiones (un día cada una)")
    try:
        return await _generate_diet_plan_by_day(
            target_kcal=target_kcal,
            target_protein_g=target_protein_g,
            target_carbs_g=target_carbs_g,
            target_fat_g=target_fat_g,
            goal_type=goal_type,
            meals_per_day=meals_per_day,
            preferences=preferences,
            disliked_foods=disliked_foods,
            allergies=allergies,
            additional_preferences=additional_preferences,
            plan_profile=plan_profile,
        )
    except Exception as e:
        logger.exception("Plan por días falló por completo: %s", e)
        return None


async def generate_diet_plan(
    target_kcal: float,
    target_protein_g: float,
    target_carbs_g: float,
    target_fat_g: float,
    goal_type: str,
    meals_per_day: int = 4,
    preferences: List[str] = None,
    disliked_foods: List[str] = None,
    allergies: List[str] = None,
    additional_preferences: Optional[str] = None,
    plan_profile: Optional[dict] = None,
) -> Optional[GeneratedDietPlan]:
    async with _WEEKLY_PLAN_GENERATION_LOCK:
        logger.info("Generación de plan semanal: bloqueo adquirido (cola si había otra petición)")
        return await _generate_diet_plan_impl(
            target_kcal=target_kcal,
            target_protein_g=target_protein_g,
            target_carbs_g=target_carbs_g,
            target_fat_g=target_fat_g,
            goal_type=goal_type,
            meals_per_day=meals_per_day,
            preferences=preferences,
            disliked_foods=disliked_foods,
            allergies=allergies,
            additional_preferences=additional_preferences,
            plan_profile=plan_profile,
        )


SUBSTITUTE_FOOD_JSON = (
    'JSON: {"name":"str","grams":n,"kcal":n,"protein_g":n,"carbs_g":n,"fat_g":n}. '
    "Un ingrediente atómico en español; sin unidades en name y sin ambiguos (no ensalada mixta/verduras/fruta variada); kcal coherente con macros (±10%) y porción realista."
)

REGENERATE_SINGLE_MEAL_JSON = """
JSON único sin markdown: una sola comida
{"meal_type":"breakfast"|"lunch"|"dinner"|"snack","title":"str plato ES","foods":[{"name":"str atómico sin gramos ni unidades en name","grams":n,"kcal":n,"protein_g":n,"carbs_g":n,"fat_g":n}], "total_kcal":n, "total_protein_g":n, "total_carbs_g":n, "total_fat_g":n}
Los total_* deben ser suma de foods; kcal≈4P+4C+9G por ítem. Respeta meal_type del enunciado exactamente.
"""


async def regenerate_single_plan_meal_with_ai(
    *,
    meal_type: str,
    reference_title: str,
    target_kcal: float,
    target_protein_g: float,
    target_carbs_g: float,
    target_fat_g: float,
    min_foods: int,
    day_label: str,
    other_meals_same_day_summary: str,
    plan_daily_summary: str,
    disliked: str,
    allergies: str,
    user_note: Optional[str] = None,
) -> Optional[DietMealPlan]:
    """
    Regenera solo una comida (lista de alimentos + título) acercándose a los macros objetivo de esa toma,
    con contexto del resto del día para variedad y coherencia.
    """
    mt = (meal_type or "lunch").lower().strip()
    note = (user_note or "").strip()
    extra = f" Preferencia del usuario: {note}." if note else ""
    prompt = (
        f"Regenera SOLO esta comida del día ({day_label}), tipo {mt}. "
        f"Referencia del plato actual (puedes variarlo): «{reference_title}». "
        f"Objetivo aproximado de esta comida: ~{target_kcal:.0f} kcal, P~{target_protein_g:.0f} g, "
        f"C~{target_carbs_g:.0f} g, G~{target_fat_g:.0f} g (±12% aceptable en el total de la comida). "
        f"Mínimo {min_foods} alimentos distintos en foods (ingredientes concretos, España). "
        f"Objetivos diarios del plan (referencia): {plan_daily_summary}. "
        f"Otras comidas ya fijadas ese mismo día (no las cambies; evita repetir el mismo plato principal): {other_meals_same_day_summary}. "
        f"No usar / alergias: {disliked} / {allergies}.{extra}"
    )
    settings = get_settings()
    model = (settings.groq_plan_model or "").strip() or settings.groq_chat_model
    cap = max(512, min(2048, int(getattr(settings, "groq_plan_max_output_tokens", 1536) or 1536)))
    try:
        out = await structured_output(
            messages=[{"role": "user", "content": prompt}],
            response_model=DietMealPlan,
            model=model,
            temperature=0.32,
            max_tokens=cap,
            json_instruction=REGENERATE_SINGLE_MEAL_JSON,
            max_retries=GROQ_PLAN_STRUCTURED_RETRIES,
            system_prompt=PLAN_NUTRITIONIST_SYSTEM_PROMPT,
        )
        await _plan_groq_cooldown()
        out = out.model_copy(update={"meal_type": mt})
        if len(out.foods or []) < min_foods:
            return None
        return out
    except Exception as e:
        logger.warning("regenerate_single_plan_meal_with_ai: %s", e)
        return None


async def suggest_equivalent_plan_food(
    *,
    meal_title: str,
    meal_type: str,
    original_name: str,
    original_grams: float,
    original_kcal: float,
    original_p: float,
    original_c: float,
    original_f: float,
    disliked: str,
    allergies: str,
    user_note: Optional[str] = None,
    other_foods_in_meal: str = "",
) -> Optional[DietFoodItem]:
    note = (user_note or "equivalente nutricional similar").strip()
    ctx = ""
    if (other_foods_in_meal or "").strip():
        ctx = (
            f" En la MISMA comida siguen estos otros alimentos (no los dupliques ni sustituyas; "
            f"elige algo que encaje culinariamente con ellos): {other_foods_in_meal.strip()}."
        )
    prompt = (
        f'Plato "{meal_title}" ({meal_type}). Cambiar SOLO "{original_name}" (~{original_grams} g, '
        f"{original_kcal} kcal, P{original_p} C{original_c} G{original_f} g). "
        f"Petición: {note}. Alergias: {allergies}. No usar: {disliked}.{ctx} "
        "Un único alimento real (supermercado España). Gramos y macros realistas; "
        "prioriza coherencia con el plato y con los compañeros de comida."
    )
    settings = get_settings()
    model = (settings.groq_plan_model or "").strip() or settings.groq_chat_model
    cap = max(256, min(768, int(getattr(settings, "groq_plan_max_output_tokens", 2048) or 2048) // 3))
    try:
        return await structured_output(
            messages=[{"role": "user", "content": prompt}],
            response_model=DietFoodItem,
            model=model,
            temperature=0.34,
            max_tokens=cap,
            json_instruction=SUBSTITUTE_FOOD_JSON,
            max_retries=GROQ_PLAN_STRUCTURED_RETRIES,
            system_prompt=PLAN_NUTRITIONIST_SYSTEM_PROMPT,
        )
    except Exception as e:
        logger.warning("suggest_equivalent_plan_food: %s", e)
        return None

