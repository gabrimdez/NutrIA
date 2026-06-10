"""Recipe recommendation engine based on user profile, macros, and restrictions."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, List, Optional, Sequence

from app.rules.allergy_validation import check_food_against_restrictions

logger = logging.getLogger(__name__)

MEAL_TYPE_BY_HOUR: dict[str, tuple[int, int]] = {
    "breakfast": (5, 11),
    "lunch": (11, 16),
    "snack": (16, 20),
    "dinner": (20, 24),
}


def _current_meal_type() -> str:
    hour = datetime.now().hour
    for mt, (start, end) in MEAL_TYPE_BY_HOUR.items():
        if start <= hour < end:
            return mt
    return "snack"


def _recipe_has_restricted_ingredient(
    recipe_items: list,
    restrictions: Sequence[str],
) -> bool:
    for item in recipe_items:
        name = ""
        if isinstance(item, dict):
            name = item.get("custom_name") or item.get("name") or ""
        elif hasattr(item, "custom_name"):
            name = getattr(item, "custom_name", "") or ""
        if name and check_food_against_restrictions(name, restrictions):
            return True
    return False


def _macro_similarity_score(
    recipe_kcal: float,
    recipe_protein: float,
    target_kcal_per_meal: float,
    target_protein_per_meal: float,
) -> float:
    """Lower = better match. Normalized to [0, ∞)."""
    if target_kcal_per_meal <= 0:
        return 0.0
    kcal_diff = abs(recipe_kcal - target_kcal_per_meal) / target_kcal_per_meal
    protein_diff = abs(recipe_protein - target_protein_per_meal) / max(target_protein_per_meal, 1)
    return kcal_diff * 0.6 + protein_diff * 0.4


def recommend_recipes(
    recipes: list,
    target_kcal: float,
    target_protein_g: float,
    meals_per_day: int = 4,
    allergies: Optional[List[str]] = None,
    intolerances: Optional[List[str]] = None,
    forbidden_foods: Optional[List[str]] = None,
    meal_type_hint: Optional[str] = None,
    max_results: int = 6,
) -> list[dict]:
    """
    Score and rank user recipes by macro compatibility and restrictions.
    Returns list of {recipe, score, reasons[]}.
    """
    if not recipes:
        return []

    all_restrictions = list(allergies or []) + list(intolerances or []) + list(forbidden_foods or [])
    meal_type = meal_type_hint or _current_meal_type()

    target_kcal_per_meal = target_kcal / max(meals_per_day, 1)
    target_protein_per_meal = target_protein_g / max(meals_per_day, 1)

    scored: list[dict] = []

    for recipe in recipes:
        r_kcal = float(getattr(recipe, "total_kcal", 0) or 0)
        r_protein = float(getattr(recipe, "total_protein_g", 0) or 0)
        r_name = str(getattr(recipe, "name", "") or "")
        r_items = getattr(recipe, "items", []) or []
        servings = int(getattr(recipe, "servings", 1) or 1) or 1

        kcal_per_serving = r_kcal / servings
        protein_per_serving = r_protein / servings

        if all_restrictions and _recipe_has_restricted_ingredient(r_items, all_restrictions):
            continue

        score = _macro_similarity_score(
            kcal_per_serving, protein_per_serving,
            target_kcal_per_meal, target_protein_per_meal,
        )

        reasons: list[str] = []
        kcal_diff_pct = abs(kcal_per_serving - target_kcal_per_meal) / max(target_kcal_per_meal, 1)
        if kcal_diff_pct < 0.15:
            reasons.append("Calorías alineadas con tu objetivo")
        if protein_per_serving >= target_protein_per_meal * 0.8:
            reasons.append("Buena fuente de proteína")
        if kcal_per_serving < 400:
            reasons.append("Opción ligera")

        if not reasons:
            reasons.append("Compatible con tu perfil")

        scored.append({
            "recipe_id": str(getattr(recipe, "id", "")),
            "name": r_name,
            "kcal_per_serving": round(kcal_per_serving, 1),
            "protein_per_serving": round(protein_per_serving, 1),
            "score": round(score, 3),
            "reasons": reasons,
            "meal_type_suggestion": meal_type,
        })

    scored.sort(key=lambda x: x["score"])
    return scored[:max_results]
