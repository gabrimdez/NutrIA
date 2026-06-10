"""Normalización de texto para búsqueda (acentos), scoring y reglas de resultados manuales."""
from __future__ import annotations

import re
import unicodedata
from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas.food import NutritionFoodItem

from app.food_providers.base import FoodResult


def fold_accents(s: str) -> str:
    s = s.lower().strip()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def normalize_food_query(text: str) -> str:
    """Lowercase, trim, collapse whitespace, strip diacritics."""
    s = (text or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return fold_accents(s)


def fold_key_for_dedupe(r: FoodResult) -> str:
    label = (r.name_es or r.name or "").strip()
    return fold_accents(label)


def dedupe_key_nutrition(item: "NutritionFoodItem") -> str:
    name = normalize_food_query(item.normalized_name)
    brand = normalize_food_query(item.brand) if item.brand else ""
    bc = (item.barcode or "").strip()
    kcal = round(item.per_100g.calories or 0) if item.per_100g else 0
    return f"{name}|{brand}|{bc}|{kcal}"


def score_nutrition_item(item: "NutritionFoodItem", normalized_query: str) -> float:
    """Higher is better. Used to re-rank merged results from multiple providers."""
    score = 0.0
    name = normalize_food_query(item.normalized_name)

    if name == normalized_query:
        score += 100
    elif name.startswith(normalized_query):
        score += 70
    elif normalized_query in name:
        score += 40

    if item.brand and normalized_query in normalize_food_query(item.brand):
        score += 15

    if item.barcode and item.barcode.strip() == normalized_query:
        score += 200

    p100 = item.per_100g
    if p100 and p100.calories is not None and p100.calories > 0:
        score += 10
        if p100.protein is not None and p100.protein > 0:
            score += 5
    else:
        score -= 20

    if item.source == "generic":
        score += 8

    if item.image_url:
        score += 3

    return score


def deduplicate_nutrition_items(items: List["NutritionFoodItem"]) -> List["NutritionFoodItem"]:
    seen: dict[str, "NutritionFoodItem"] = {}
    for item in items:
        key = dedupe_key_nutrition(item)
        if not key:
            continue
        if key not in seen:
            seen[key] = item
    return list(seen.values())


def manual_search_text_matches(query: str, product_label: str) -> bool:
    """
    Exige que cada palabra significativa de la búsqueda aparezca en el nombre del producto
    (acentos ignorados). Evita mezclar resultados OFF irrelevantes cuando la API devuelve ruido.
    """
    raw_q = (query or "").strip()
    raw_lab = (product_label or "").strip()
    if len(raw_q) < 2 or not raw_lab:
        return False
    q_fold = fold_accents(raw_q)
    lab_fold = fold_accents(raw_lab)
    tokens = [t for t in q_fold.split() if t]
    if not tokens:
        return False
    return all(t in lab_fold for t in tokens)


_MEATISH = (
    "pollo",
    "chicken",
    "pechuga",
    "pavo",
    "turkey",
    "ternera",
    "beef",
    "carne",
    "cerdo",
    "pork",
    "cordero",
    "lamb",
    "salm",
    "salmon",
    "atún",
    "atun",
    "tuna",
    "pescado",
    "fish",
    "merluza",
    "bacalao",
    "gamb",
    "shrimp",
    "calamar",
    "sepia",
    "squid",
)

_COOKED_MARKERS = (
    "cocid",
    "cooked",
    "asado",
    "asad",
    "grilled",
    "hornead",
    "frito",
    "frit",
    "saltead",
    "estofad",
    "guisad",
    "plancha",
    "barbacoa",
    "bbq",
    "ahumad",
    "smoked",
)


def skip_cooked_meat_for_manual_search(r: FoodResult) -> bool:
    """Carnes/pescados: en búsqueda manual solo crudo; lo cocido queda para foto + IA."""
    label = f"{r.name_es or ''} {r.name}".lower()
    if not any(k in label for k in _MEATISH):
        return False
    return any(m in label for m in _COOKED_MARKERS)
