"""Map FatSecret API responses to NutritionFoodItem."""
from __future__ import annotations

from typing import Optional, List

from app.food_providers.search_normalize import normalize_food_query
from app.schemas.food import NutritionFoodItem, MacroBlock, ServingInfo


def _safe_float(val, default: float = 0.0) -> Optional[float]:
    if val is None:
        return None
    try:
        return round(float(val), 1)
    except (ValueError, TypeError):
        return default


def _parse_serving(serving: dict) -> tuple[Optional[MacroBlock], Optional[ServingInfo]]:
    kcal = _safe_float(serving.get("calories"))
    protein = _safe_float(serving.get("protein"))
    carbs = _safe_float(serving.get("carbohydrate"))
    fat = _safe_float(serving.get("fat"))
    fiber = _safe_float(serving.get("fiber"))

    macro = MacroBlock(calories=kcal, protein=protein, carbs=carbs, fat=fat, fiber=fiber)

    metric_amount = _safe_float(serving.get("metric_serving_amount"))
    metric_unit = serving.get("metric_serving_unit")
    srv = ServingInfo(
        amount=_safe_float(serving.get("number_of_units")) or 1.0,
        unit=serving.get("serving_description"),
        grams=metric_amount,
    )
    return macro, srv


def _scale_to_100g(macro: MacroBlock, grams: Optional[float]) -> Optional[MacroBlock]:
    if grams is None or grams <= 0:
        return None
    factor = 100.0 / grams

    def _s(v: Optional[float]) -> Optional[float]:
        return round(v * factor, 1) if v is not None else None

    return MacroBlock(
        calories=_s(macro.calories),
        protein=_s(macro.protein),
        carbs=_s(macro.carbs),
        fat=_s(macro.fat),
        fiber=_s(macro.fiber),
    )


def map_fatsecret_food(food: dict) -> Optional[NutritionFoodItem]:
    """Map a single food object from foods.search or food.get.v4."""
    food_id = str(food.get("food_id", ""))
    name = (food.get("food_name") or "").strip()
    if not name:
        return None

    brand = (food.get("brand_name") or "").strip() or None
    food_type = food.get("food_type", "Generic")
    item_type = "branded" if brand else "generic"

    servings_raw = food.get("servings", {}).get("serving", [])
    if isinstance(servings_raw, dict):
        servings_raw = [servings_raw]

    per_serving: Optional[MacroBlock] = None
    per_100g: Optional[MacroBlock] = None
    serving_info: Optional[ServingInfo] = None

    for srv in servings_raw:
        macro, srv_info = _parse_serving(srv)
        metric_unit = (srv.get("metric_serving_unit") or "").lower()
        metric_amount = _safe_float(srv.get("metric_serving_amount"))

        if metric_unit == "g" and metric_amount and abs(metric_amount - 100.0) < 0.5:
            per_100g = macro
            if serving_info is None:
                serving_info = srv_info
            continue

        if per_serving is None:
            per_serving = macro
            serving_info = srv_info

    if per_100g is None and per_serving is not None and serving_info and serving_info.grams:
        per_100g = _scale_to_100g(per_serving, serving_info.grams)

    desc = food.get("food_description", "")

    return NutritionFoodItem(
        id=food_id,
        source="fatsecret",
        source_id=food_id,
        type=item_type,
        name=name,
        normalized_name=normalize_food_query(name),
        brand=brand,
        language=None,
        serving=serving_info,
        per_100g=per_100g,
        per_serving=per_serving,
        raw_summary=desc[:300] if desc else None,
    )


def map_fatsecret_search_results(data: dict) -> List[NutritionFoodItem]:
    foods_wrapper = data.get("foods", {})
    food_list = foods_wrapper.get("food", [])
    if isinstance(food_list, dict):
        food_list = [food_list]
    results: List[NutritionFoodItem] = []
    for f in food_list:
        item = map_fatsecret_food(f)
        if item:
            results.append(item)
    return results
