from __future__ import annotations

import re
import unicodedata
from typing import Any, List, Optional

from app.services.plan_meal_normalize import clamp_str, sanitize_food_display_name

_COOKED_MARKERS = (
    "cocido",
    "cocida",
    "hervido",
    "hervida",
    "asado",
    "asada",
    "frito",
    "frita",
    "horneado",
    "horneada",
    "salteado",
    "salteada",
    "estofado",
    "estofada",
    "plancha",
    "al vapor",
)
_PREP_TERMS_RE = re.compile(
    r"\b(?:cocid[oa]s?|hervid[oa]s?|asad[oa]s?|frit[oa]s?|hornead[oa]s?|"
    r"saltead[oa]s?|estofad[oa]s?|guisad[oa]s?|a la plancha|plancha|al vapor)\b",
    re.IGNORECASE,
)
_SHOPPING_NOISE_TERMS_RE = re.compile(
    r"\b(?:fresc[oa]s?|congelad[oa]s?|natural(?:es)?|en conserva|filetes?|lomos?|trocead[oa]s?)\b",
    re.IGNORECASE,
)
_SERVING_NOISE_TERMS_RE = re.compile(
    r"\b(?:taza(?:s)?|cup(?:s)?|unidad(?:es)?|ud(?:s)?|pieza(?:s)?|"
    r"median[oa]s?|pequen[oa]s?|grande(?:s)?|rebanada(?:s)?|tostada(?:s)?)\b",
    re.IGNORECASE,
)
_LEADING_COUNT_RE = re.compile(
    r"^\s*(?:~|≈)?\s*\d+[.,]?\d*\s*(?:x|uds?|unidades?|piezas?|tazas?|cups?)?\s*(?:de\s+)?",
    re.IGNORECASE,
)
_HARD_BLOCKED_AMBIGUOUS_TERMS = (
    "ensalada mixta",
    "verduras",
    "fruta variada",
    "plato combinado",
    "cereales",
)
_HARD_NON_GRAM_UNIT_RE = re.compile(
    r"\b\d+[.,]?\d*\s*(?:x\s*)?(?:u(?:nidad(?:es)?)?|ud(?:s)?|pieza(?:s)?|huevo(?:s)?|"
    r"taza(?:s)?|cup(?:s)?|cucharada(?:s)?|cucharadita(?:s)?|rebanada(?:s)?|tostada(?:s)?)\b|"
    r"\b(?:taza(?:s)?|cup(?:s)?|cucharada(?:s)?|cucharadita(?:s)?)\b",
    re.IGNORECASE,
)


def _fold_text(s: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", (s or "").lower()) if unicodedata.category(ch) != "Mn"
    )


def _compact_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip(" ,.-")


def _should_skip_from_shopping(cleaned_folded: str) -> bool:
    return any(k in cleaned_folded for k in ("aceite", "aove", "almendra", "almendras"))


def validate_atomic_food_item(food: dict[str, Any], context: str) -> None:
    name = sanitize_food_display_name(food.get("name"))
    folded = _fold_text(name)
    if not name:
        raise ValueError(f"{context}: nombre de alimento vacio")
    if any(t in folded for t in _HARD_BLOCKED_AMBIGUOUS_TERMS):
        raise ValueError(f'{context}: "{name}" no permitido; usa ingrediente atomico en gramos')
    if _LEADING_COUNT_RE.match(folded):
        raise ValueError(f'{context}: "{name}" no permitido; quita unidades/piezas y deja solo ingrediente')
    if _HARD_NON_GRAM_UNIT_RE.search(folded):
        raise ValueError(f'{context}: "{name}" contiene unidades no permitidas; usa solo gramos')
    grams = float(food.get("grams") or 0.0)
    if grams <= 0:
        raise ValueError(f'{context}: "{name}" debe tener gramos > 0')


def validate_plan_meals_hard(
    meals: list[dict[str, Any]],
    context: str,
) -> None:
    for meal in meals or []:
        foods = meal.get("foods") or []
        for raw_food in foods:
            if not isinstance(raw_food, dict):
                raise ValueError(f"{context}: formato de alimento invalido")
            validate_atomic_food_item(raw_food, context)


def canonical_shopping_name_and_raw_grams(name: str, grams: float) -> tuple[str, float]:
    base = sanitize_food_display_name(name)
    folded = _fold_text(base)
    had_cooked_marker = any(m in folded for m in _COOKED_MARKERS) and "crudo" not in folded
    cleaned = _PREP_TERMS_RE.sub("", base)
    cleaned = _SHOPPING_NOISE_TERMS_RE.sub("", cleaned)
    cleaned = _SERVING_NOISE_TERMS_RE.sub("", cleaned)
    cleaned = _LEADING_COUNT_RE.sub("", cleaned)
    cleaned = _compact_spaces(cleaned)
    cleaned_folded = _fold_text(cleaned)
    if _should_skip_from_shopping(cleaned_folded):
        return "", 0.0
    if "ensalada" in cleaned_folded:
        return "", 0.0
    if any(t in cleaned_folded for t in _HARD_BLOCKED_AMBIGUOUS_TERMS):
        return "", 0.0

    if "arroz" in cleaned_folded:
        if "integral" in cleaned_folded:
            display = "Arroz integral (crudo)"
        elif "basmati" in cleaned_folded:
            display = "Arroz basmati (crudo)"
        else:
            display = "Arroz blanco (crudo)"
    elif "pasta" in cleaned_folded:
        display = "Pasta (cruda)"
    elif any(k in cleaned_folded for k in ("lenteja", "garbanzo", "judia", "alubia", "legumbre")):
        display = f"{cleaned} (crudo)" if "crudo" not in cleaned_folded else cleaned
    elif any(k in cleaned_folded for k in ("quinoa", "cuscus")):
        display = f"{cleaned} (crudo)" if "crudo" not in cleaned_folded else cleaned
    elif "patata" in cleaned_folded or "boniato" in cleaned_folded or "batata" in cleaned_folded:
        display = "Patata (cruda)"
    elif "brocoli" in cleaned_folded or "brócoli" in cleaned_folded:
        display = "Brócoli (crudo)"
    elif "manzana" in cleaned_folded:
        display = "Manzana"
    elif any(k in cleaned_folded for k in ("platano", "plátano", "banana")):
        display = "Plátano"
    elif any(k in cleaned_folded for k in ("tomate", "tomates")):
        display = "Tomate"
    elif any(k in cleaned_folded for k in ("yogur", "yogurt", "skyr", "kefir", "kéfir")):
        display = "Yogur"
    elif "aceituna" in cleaned_folded:
        display = "Aceitunas"
    elif any(k in cleaned_folded for k in ("huevo", "huevos")):
        display = "Huevo (crudo)"
    elif "pan integral" in cleaned_folded:
        display = "Pan integral"
    elif cleaned_folded == "integral":
        display = "Pan integral"
    elif "pan" in cleaned_folded:
        display = "Pan"
    elif "merluza" in cleaned_folded:
        display = "Merluza (cruda)"
    elif "bacalao" in cleaned_folded:
        display = "Bacalao (crudo)"
    elif any(k in cleaned_folded for k in ("salmon", "salmón")):
        display = "Salmón (crudo)"
    elif any(k in cleaned_folded for k in ("atun", "atún")):
        display = "Atún (crudo)"
    elif "pollo" in cleaned_folded:
        display = "Pollo (crudo)"
    elif "pavo" in cleaned_folded:
        display = "Pavo (crudo)"
    elif "ternera" in cleaned_folded:
        display = "Ternera (cruda)"
    elif "cerdo" in cleaned_folded:
        display = "Cerdo (crudo)"
    elif cleaned:
        display = cleaned
    else:
        display = "Alimento"

    raw_grams = float(grams or 0.0)
    if had_cooked_marker:
        if "arroz" in cleaned_folded:
            raw_grams *= 0.35
        elif "pasta" in cleaned_folded:
            raw_grams *= 0.42
        elif any(k in cleaned_folded for k in ("quinoa", "cuscus", "cuscús")):
            raw_grams *= 0.40
        elif any(k in cleaned_folded for k in ("lenteja", "garbanzo", "judia", "judía", "alubia", "legumbre")):
            raw_grams *= 0.40
        elif any(k in cleaned_folded for k in ("pollo", "pavo", "ternera", "cerdo", "salmon", "salmón", "atun", "atún", "merluza", "bacalao")):
            raw_grams *= 1.25
        elif any(k in cleaned_folded for k in ("patata", "boniato", "batata")):
            raw_grams *= 1.10

    return display[:200], max(0.0, raw_grams)


def aggregate_plan_foods_for_shopping(plan: Any) -> dict[str, float]:
    agg: dict[str, float] = {}
    for day in plan.days:
        for meal in day.meals:
            for food in meal.foods or []:
                if not isinstance(food, dict):
                    continue
                name = (food.get("name") or "").strip()
                if not name:
                    continue
                display_name, raw_grams = canonical_shopping_name_and_raw_grams(
                    name,
                    float(food.get("grams") or 0),
                )
                if not display_name or raw_grams <= 0:
                    continue
                agg[display_name] = agg.get(display_name, 0.0) + raw_grams
    return agg


def string_list_from_json_field(values: Optional[list]) -> List[str]:
    out: List[str] = []
    for value in values or []:
        if value is None:
            continue
        text = str(value).strip() if not isinstance(value, str) else value.strip()
        if text:
            out.append(text)
    return out


def normalize_plan_label(raw: str) -> Optional[str]:
    text = clamp_str((raw or "").strip(), 200)
    return text or None
