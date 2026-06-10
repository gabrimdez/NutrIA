"""Map LogMeal API responses to PhotoCandidate list."""
from __future__ import annotations

from typing import List

from app.food_providers.search_normalize import normalize_food_query
from app.schemas.food import PhotoCandidate, MacroBlock


def _safe_float(val, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        return round(float(val), 1)
    except (ValueError, TypeError):
        return default


def map_logmeal_recognition(recognition: dict, nutrition: dict | None = None) -> List[PhotoCandidate]:
    """Map dish recognition + optional nutrition info to PhotoCandidate list."""
    candidates: List[PhotoCandidate] = []

    food_items = recognition.get("recognition_results") or recognition.get("segmentation_results") or []
    if isinstance(food_items, dict):
        food_items = [food_items]

    nutrition_items = {}
    if nutrition and isinstance(nutrition, dict):
        for entry in nutrition.get("foodItems", []):
            nid = entry.get("id") or entry.get("name", "")
            nutrition_items[str(nid)] = entry

    for item in food_items:
        name = (item.get("name") or item.get("foodName") or "").strip()
        if not name:
            continue

        prob = _safe_float(item.get("prob") or item.get("probability"), 0.5)
        item_id = str(item.get("id", ""))

        per_100g = None
        per_serving = None
        estimated_grams = _safe_float(item.get("quantity"), 100.0)

        nut = nutrition_items.get(item_id) or nutrition_items.get(name)
        if nut:
            nut_info = nut.get("nutritional_info") or nut.get("nutritionalInfo") or {}
            total_nut = nut_info.get("totalNutrients") or nut_info
            calories = _safe_float(total_nut.get("calories") or total_nut.get("ENERC_KCAL", {}).get("quantity"))
            protein = _safe_float(total_nut.get("protein") or total_nut.get("PROCNT", {}).get("quantity"))
            carbs = _safe_float(total_nut.get("totalCarbs") or total_nut.get("CHOCDF", {}).get("quantity"))
            fat = _safe_float(total_nut.get("totalFat") or total_nut.get("FAT", {}).get("quantity"))
            fiber = _safe_float(total_nut.get("dietaryFiber") or total_nut.get("FIBTG", {}).get("quantity"))

            serving_g = _safe_float(nut_info.get("servingWeight") or nut.get("serving_weight"))
            if serving_g and serving_g > 0:
                estimated_grams = serving_g
                per_serving = MacroBlock(calories=calories, protein=protein, carbs=carbs, fat=fat, fiber=fiber)
                factor = 100.0 / serving_g
                per_100g = MacroBlock(
                    calories=round(calories * factor, 1) if calories else None,
                    protein=round(protein * factor, 1) if protein else None,
                    carbs=round(carbs * factor, 1) if carbs else None,
                    fat=round(fat * factor, 1) if fat else None,
                    fiber=round(fiber * factor, 1) if fiber else None,
                )
            else:
                per_100g = MacroBlock(calories=calories, protein=protein, carbs=carbs, fat=fat, fiber=fiber)

        candidates.append(PhotoCandidate(
            name=name,
            normalized_name=normalize_food_query(name),
            estimated_grams=estimated_grams,
            confidence=min(1.0, max(0.0, prob)),
            per_100g=per_100g,
            per_serving=per_serving,
            source="logmeal",
            source_id=item_id or None,
            requires_confirmation=prob < 0.8,
        ))

    return candidates
