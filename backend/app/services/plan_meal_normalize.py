"""Normaliza comidas del plan antes de persistir (IA suele variar texto y longitudes)."""
from __future__ import annotations

import copy
import re
import unicodedata
from typing import Any

# Evita "150g ternera" en name cuando grams ya va en su campo (y puede escalarse a 260 g).
_GRAM_NAME_PREFIX_RE = re.compile(
    r"^\s*(?:~|≈)?\s*"
    r"\d+[.,]?\d*\s*"
    r"(?:g|gr\.?|gramos?)\b\.?\s*"
    r"(?:de\s+)?",
    re.IGNORECASE,
)
_COOKED_MARKERS_RE = re.compile(
    r"\b(?:cocid[oa]s?|hervid[oa]s?|asad[oa]s?|frit[oa]s?|hornead[oa]s?|"
    r"saltead[oa]s?|estofad[oa]s?|guisad[oa]s?|a la plancha|plancha|al vapor)\b",
    re.IGNORECASE,
)
_COOKABLE_BASIS_WORDS = (
    "arroz",
    "pasta",
    "quinoa",
    "cuscus",
    "cuscús",
    "avena",
    "patata",
    "boniato",
    "batata",
    "lenteja",
    "garbanzo",
    "judia",
    "judía",
    "alubia",
    "pollo",
    "pavo",
    "ternera",
    "cerdo",
    "salmon",
    "salmón",
    "atun",
    "atún",
    "merluza",
    "bacalao",
    "huevo",
    "huevos",
)

PLAN_DAY_MAX_REL_ERR = 0.10
_MAX_SCALE_ITERATIONS = 10

from app.models.models import MealType

_MEAL_ALIASES: dict[str, str] = {
    "breakfast": "breakfast",
    "desayuno": "breakfast",
    "brunch": "breakfast",
    "lunch": "lunch",
    "almuerzo": "lunch",
    "comida": "lunch",
    "dinner": "dinner",
    "cena": "dinner",
    "snack": "snack",
    "merienda": "snack",
    "tentempie": "snack",
    "colación": "snack",
    "colacion": "snack",
}

_HIGH_ADJUST_WORDS = (
    "pan",
    "tostada",
    "tostadas",
    "arroz",
    "pasta",
    "avena",
    "granola",
    "muesli",
    "copos",
    "cereal",
    "quinoa",
    "cuscús",
    "cuscus",
    "patata",
    "patatas",
    "boniato",
    "batata",
    "fruta",
    "plátano",
    "platano",
    "banana",
    "manzana",
    "pera",
    "kiwi",
    "naranja",
    "mandarina",
    "aceite",
    "aove",
    "almendra",
    "almendras",
    "nuez",
    "nueces",
    "avellana",
    "avellanas",
    "cacahuete",
    "cacahuetes",
    "semillas",
    "pipas",
    "crema de cacahuete",
    "mantequilla de cacahuete",
)
_MEDIUM_ADJUST_WORDS = (
    "pollo",
    "pavo",
    "ternera",
    "cerdo",
    "merluza",
    "bacalao",
    "salmón",
    "salmon",
    "atún",
    "atun",
    "sardina",
    "caballa",
    "tofu",
    "tempeh",
    "seitán",
    "seitan",
    "lentejas",
    "garbanzos",
    "judías",
    "judias",
    "alubias",
    "edamame",
    "verdura",
    "verduras",
    "ensalada",
    "lechuga",
    "tomate",
    "pepino",
    "zanahoria",
    "pimiento",
    "brócoli",
    "brocoli",
    "espinaca",
    "espinacas",
    "judías verdes",
    "judias verdes",
    "calabacín",
    "calabacin",
    "berenjena",
)
_LOW_ADJUST_WORDS = (
    "huevo",
    "huevos",
    "clara",
    "claras",
    "yogur",
    "yogurt",
    "skyr",
    "leche",
    "queso",
    "requesón",
    "requeson",
    "queso fresco",
    "queso batido",
    "kéfir",
    "kefir",
)


def _contains_any(text: str, words: tuple[str, ...]) -> bool:
    return any(w in text for w in words)


def _food_name(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_meal_type(raw: Any) -> str:
    if raw is None:
        return MealType.LUNCH.value
    s = str(raw).lower().strip()
    if s in _MEAL_ALIASES:
        return _MEAL_ALIASES[s]
    for key, val in _MEAL_ALIASES.items():
        if key in s:
            return val
    try:
        return MealType(s).value
    except ValueError:
        return MealType.LUNCH.value


def clamp_str(s: Any, max_len: int) -> str:
    if s is None:
        return ""
    t = str(s).strip()
    return t[:max_len] if len(t) > max_len else t


def sanitize_food_display_name(raw: Any) -> str:
    """Quita prefijos tipo «150g », «200 g de » del nombre; los gramos van solo en el campo grams."""
    s = str(raw or "").strip()
    if not s:
        return "Alimento"
    prev = None
    while prev != s:
        prev = s
        s = _GRAM_NAME_PREFIX_RE.sub("", s).strip()
    low_fold = "".join(
        ch for ch in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(ch) != "Mn"
    )
    if _COOKED_MARKERS_RE.search(low_fold):
        s = _COOKED_MARKERS_RE.sub("", s).strip(" ,.-")
        if any(w in low_fold for w in _COOKABLE_BASIS_WORDS) and "crudo" not in low_fold:
            s = f"{s} (crudo)".strip()
    if not s:
        return "Alimento"
    return s[:200] if len(s) > 200 else s


def normalize_plan_meals_for_db(meals: list[dict]) -> list[dict]:
    out = []
    for m in meals:
        mm = dict(m)
        mm["meal_type"] = normalize_meal_type(mm.get("meal_type"))
        mm["title"] = clamp_str(mm.get("title"), 200) or "Comida"
        foods = mm.get("foods") or []
        norm_foods = []
        for f in foods:
            if not isinstance(f, dict):
                continue
            norm_foods.append(
                {
                    "name": sanitize_food_display_name(clamp_str(f.get("name"), 220)),
                    "grams": float(f.get("grams") or 0),
                    "kcal": float(f.get("kcal") or 0),
                    "protein_g": float(f.get("protein_g") or 0),
                    "carbs_g": float(f.get("carbs_g") or 0),
                    "fat_g": float(f.get("fat_g") or 0),
                }
            )
        mm["foods"] = norm_foods
        mm["total_kcal"] = float(mm.get("total_kcal") or 0)
        mm["total_protein_g"] = float(mm.get("total_protein_g") or 0)
        mm["total_carbs_g"] = float(mm.get("total_carbs_g") or 0)
        mm["total_fat_g"] = float(mm.get("total_fat_g") or 0)
        out.append(mm)
    return out


def _sum_day_macros_from_meals(meals: list[dict]) -> tuple[float, float, float, float]:
    tk = tp = tc = tf = 0.0
    for m in meals:
        for f in m.get("foods") or []:
            if not isinstance(f, dict):
                continue
            tk += float(f.get("kcal") or 0)
            tp += float(f.get("protein_g") or 0)
            tc += float(f.get("carbs_g") or 0)
            tf += float(f.get("fat_g") or 0)
    return tk, tp, tc, tf


def _day_max_relative_error(
    sk: float,
    sp: float,
    sc: float,
    sf: float,
    target_kcal: float,
    target_protein_g: float,
    target_carbs_g: float,
    target_fat_g: float,
) -> float:
    def rel(actual: float, target: float, floor: float) -> float:
        if target <= 0:
            return 0.0
        if actual <= floor:
            return 1.0
        return abs(actual - target) / target

    parts: list[float] = []
    if target_kcal > 0:
        parts.append(rel(sk, target_kcal, 50.0))
    if target_protein_g > 0:
        parts.append(rel(sp, target_protein_g, 1.0))
    if target_carbs_g > 0:
        parts.append(rel(sc, target_carbs_g, 2.0))
    if target_fat_g > 0:
        parts.append(rel(sf, target_fat_g, 0.5))
    return max(parts) if parts else 0.0


def _meal_share_profile(meal_type: str, total_meals: int) -> tuple[float, float, float]:
    n = max(3, min(6, int(total_meals or 4)))
    profiles = {
        3: {
            "breakfast": (0.25, 0.16, 0.32),
            "lunch": (0.39, 0.30, 0.46),
            "dinner": (0.32, 0.24, 0.40),
            "snack": (0.10, 0.06, 0.16),
        },
        4: {
            "breakfast": (0.24, 0.16, 0.30),
            "lunch": (0.34, 0.26, 0.40),
            "dinner": (0.28, 0.22, 0.34),
            "snack": (0.12, 0.08, 0.18),
        },
        5: {
            "breakfast": (0.20, 0.14, 0.26),
            "lunch": (0.30, 0.24, 0.38),
            "dinner": (0.26, 0.20, 0.32),
            "snack": (0.12, 0.06, 0.14),
        },
        6: {
            "breakfast": (0.18, 0.14, 0.24),
            "lunch": (0.28, 0.22, 0.36),
            "dinner": (0.24, 0.18, 0.30),
            "snack": (0.10, 0.05, 0.12),
        },
    }
    return profiles[n].get((meal_type or "").lower().strip(), (0.12, 0.06, 0.30))


def _desired_meal_kcal_targets(meals: list[dict], target_kcal: float) -> list[float]:
    if not meals or target_kcal <= 0:
        return [0.0 for _ in meals]
    ideals = [_meal_share_profile(m.get("meal_type"), len(meals))[0] for m in meals]
    total = sum(ideals) or 1.0
    return [target_kcal * (x / total) for x in ideals]


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
        return 20.0, 110.0 if mt == "breakfast" else 140.0
    if any(w in n for w in ("avena", "granola", "muesli", "copos", "cereal", "cereales")):
        return 20.0, 100.0
    if any(w in n for w in ("yogur", "yogurt", "skyr", "leche", "kéfir", "kefir", "queso batido", "queso fresco", "requesón", "requeson")):
        return 100.0, 350.0
    if any(w in n for w in ("plátano", "platano", "banana")):
        return 90.0, 125.0
    if any(w in n for w in ("manzana", "pera")):
        return 120.0, 160.0
    if any(w in n for w in ("naranja", "mandarina")):
        return 130.0, 190.0
    if "kiwi" in n:
        return 75.0, 110.0
    if any(w in n for w in ("fruta", "frutos rojos", "piña", "pina")):
        return 80.0, 180.0
    if any(w in n for w in ("arroz", "pasta", "quinoa", "cuscús", "cuscus", "patata", "patatas", "boniato", "batata", "maíz", "maiz", "wrap", "tortilla de trigo")):
        return 60.0, 320.0 if mt in ("lunch", "dinner") else 220.0
    if any(w in n for w in ("lentejas", "garbanzos", "judías", "judias", "alubias", "legumbres", "edamame")):
        return 60.0, 280.0
    if any(w in n for w in ("pollo", "pavo", "ternera", "cerdo", "merluza", "bacalao", "salmón", "salmon", "atún", "atun", "sardina", "caballa", "tofu", "tempeh", "seitán", "seitan")):
        return 80.0, 260.0 if mt in ("lunch", "dinner") else 180.0
    if "tomate" in n:
        return 35.0, 200.0 if mt in ("lunch", "dinner") else 130.0
    if any(w in n for w in ("pepino", "zanahoria", "pimiento", "brócoli", "brocoli", "espinaca", "espinacas", "judías verdes", "judias verdes", "calabacín", "calabacin", "berenjena")):
        return 40.0, 220.0 if mt in ("lunch", "dinner") else 150.0
    if any(w in n for w in ("verdura", "verduras", "ensalada", "lechuga")):
        return 40.0, 300.0 if mt in ("lunch", "dinner") else 180.0
    return 10.0, 350.0 if mt in ("lunch", "dinner") else 240.0


def _food_adjustment_weight(name: str) -> float:
    n = _food_name(name)
    if _contains_any(n, _HIGH_ADJUST_WORDS):
        return 0.95
    if _contains_any(n, _MEDIUM_ADJUST_WORDS):
        return 0.65
    if _contains_any(n, _LOW_ADJUST_WORDS):
        return 0.30
    return 0.55


def _recompute_meal_totals(meal: dict) -> dict:
    foods = meal.get("foods") or []
    meal["total_kcal"] = round(sum(float(x.get("kcal") or 0) for x in foods), 1)
    meal["total_protein_g"] = round(sum(float(x.get("protein_g") or 0) for x in foods), 1)
    meal["total_carbs_g"] = round(sum(float(x.get("carbs_g") or 0) for x in foods), 1)
    meal["total_fat_g"] = round(sum(float(x.get("fat_g") or 0) for x in foods), 1)
    return meal


def _scale_food_weighted(food: dict, factor: float, meal_type: str) -> dict:
    d = dict(food)
    grams = max(1.0, float(d.get("grams") or 0.0))
    weight = _food_adjustment_weight(d.get("name"))
    local_factor = 1.0 + (factor - 1.0) * weight
    proposed = grams * local_factor
    lo, hi = _food_portion_bounds(str(d.get("name") or ""), meal_type)

    if proposed > hi:
        new_grams = hi
    elif local_factor < 1.0:
        new_grams = max(max(6.0, grams * 0.55), proposed)
    else:
        new_grams = max(min(lo, grams), proposed)

    applied = new_grams / grams if grams > 0 else 1.0
    d["grams"] = round(new_grams, 2)
    for key in ("kcal", "protein_g", "carbs_g", "fat_g"):
        d[key] = round(float(d.get(key) or 0.0) * applied, 2)
    return d


def _scale_single_meal(meal: dict, factor: float) -> dict:
    mm = dict(meal)
    mt = normalize_meal_type(mm.get("meal_type"))
    mm["foods"] = [_scale_food_weighted(fd, factor, mt) for fd in (mm.get("foods") or []) if isinstance(fd, dict)]
    return _recompute_meal_totals(mm)


def align_meal_totals_to_target_kcal(meal: dict, target_kcal: float) -> dict:
    """Escala porciones de una sola comida para acercar kcal totales a un objetivo (p. ej. tras regenerar con IA)."""
    mm = _recompute_meal_totals(dict(meal))
    sk = float(mm.get("total_kcal") or 0.0)
    if sk < 40.0 or target_kcal < 40.0:
        return mm
    factor = max(0.72, min(1.28, float(target_kcal) / sk))
    if abs(factor - 1.0) < 0.03:
        return mm
    mt = normalize_meal_type(mm.get("meal_type"))
    mm["meal_type"] = mt
    return _scale_single_meal(mm, factor)


def _meal_distribution_ok(meals: list[dict], target_kcal: float) -> bool:
    if not meals or target_kcal <= 0:
        return True
    for meal in meals:
        share = float(meal.get("total_kcal") or 0.0) / target_kcal
        _, min_share, max_share = _meal_share_profile(meal.get("meal_type"), len(meals))
        if share < max(0.04, min_share - 0.04):
            return False
        if share > max_share + 0.05:
            return False
    return True


def scale_plan_day_meals_to_targets(
    meals: list[dict],
    target_kcal: float,
    target_protein_g: float,
    target_carbs_g: float,
    target_fat_g: float,
) -> list[dict]:
    """
    Escala porciones del día para acercar kcal y macros a los objetivos del usuario,
    pero evitando destrozar la lógica culinaria:
    - ajusta primero por comida según reparto esperado del día
    - usa pesos distintos por alimento (más ajustables: arroz/pan/avena/aceite/fruta;
      menos ajustables: huevo, yogur, quesos, piezas “unitarias”)
    - evita que un desayuno o snack acaben desproporcionados
    """
    work = copy.deepcopy(meals)
    sk, sp, sc, sf = _sum_day_macros_from_meals(work)
    if sk < 80.0:
        return work

    for _ in range(_MAX_SCALE_ITERATIONS):
        desired_meal_kcal = _desired_meal_kcal_targets(work, target_kcal)

        for idx, meal in enumerate(work):
            current_kcal = max(1.0, float(meal.get("total_kcal") or 0.0))
            desired_kcal = desired_meal_kcal[idx] if idx < len(desired_meal_kcal) else current_kcal
            ratio = desired_kcal / current_kcal
            ratio = max(0.82, min(1.22, ratio))
            if abs(ratio - 1.0) > 0.035:
                work[idx] = _scale_single_meal(meal, ratio)

        sk, sp, sc, sf = _sum_day_macros_from_meals(work)
        if _day_max_relative_error(sk, sp, sc, sf, target_kcal, target_protein_g, target_carbs_g, target_fat_g) <= PLAN_DAY_MAX_REL_ERR and _meal_distribution_ok(work, target_kcal):
            return work

        ratios: list[float] = []
        if target_kcal > 0 and sk > 0:
            ratios.append(float(target_kcal) / sk)
        if target_protein_g > 0 and sp > 0:
            ratios.append(float(target_protein_g) / sp)
        if target_carbs_g > 0 and sc > 0:
            ratios.append(float(target_carbs_g) / sc)
        if target_fat_g > 0 and sf > 0:
            ratios.append(float(target_fat_g) / sf)

        if not ratios:
            return work

        global_factor = sum(ratios) / len(ratios)
        global_factor = max(0.93, min(1.07, global_factor))
        if abs(global_factor - 1.0) < 0.004:
            return work

        for idx, meal in enumerate(work):
            share = (float(meal.get("total_kcal") or 0.0) / target_kcal) if target_kcal > 0 else 0.0
            _, min_share, max_share = _meal_share_profile(meal.get("meal_type"), len(work))

            if global_factor > 1.0 and share > max_share + 0.03:
                continue
            if global_factor < 1.0 and share < max(0.05, min_share - 0.02):
                continue

            damped = 1.0 + (global_factor - 1.0) * 0.65
            work[idx] = _scale_single_meal(meal, damped)

        sk, sp, sc, sf = _sum_day_macros_from_meals(work)
        if _day_max_relative_error(sk, sp, sc, sf, target_kcal, target_protein_g, target_carbs_g, target_fat_g) <= PLAN_DAY_MAX_REL_ERR and _meal_distribution_ok(work, target_kcal):
            return work

    return work
