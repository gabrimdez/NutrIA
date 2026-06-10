"""Map Open Food Facts product dict to NutritionFoodItem."""
from __future__ import annotations

from typing import Any, Optional

from app.food_providers.search_normalize import normalize_food_query
from app.schemas.food import NutritionFoodItem, MacroBlock, ServingInfo


def _num(val, default: float = 0.0) -> Optional[float]:
    if val is None:
        return None
    try:
        return round(float(val), 1)
    except (ValueError, TypeError):
        return default


def _clean_str(val: Any) -> Optional[str]:
    if not isinstance(val, str):
        return None
    cleaned = val.strip()
    return cleaned or None


def _pick_localized_value(node: Any, *preferred_keys: str) -> Optional[str]:
    if not isinstance(node, dict):
        return None
    for key in preferred_keys:
        value = _clean_str(node.get(key))
        if value:
            return value
    for value in node.values():
        cleaned = _clean_str(value)
        if cleaned:
            return cleaned
    return None


def _pick_front_image(product: dict) -> Optional[str]:
    selected_images = product.get("selected_images")
    front = selected_images.get("front") if isinstance(selected_images, dict) else None
    display = front.get("display") if isinstance(front, dict) else None
    small = front.get("small") if isinstance(front, dict) else None
    thumb = front.get("thumb") if isinstance(front, dict) else None

    for candidate in (
        _clean_str(product.get("image_front_url")),
        _pick_localized_value(display, "es", "en"),
        _pick_localized_value(small, "es", "en"),
        _pick_localized_value(thumb, "es", "en"),
        _clean_str(product.get("image_front_small_url")),
        _clean_str(product.get("image_front_thumb_url")),
        _clean_str(product.get("image_url")),
        _clean_str(product.get("image_small_url")),
        _clean_str(product.get("image_thumb_url")),
    ):
        if candidate:
            return candidate
    return None


def map_off_product(product: dict) -> Optional[NutritionFoodItem]:
    name = (product.get("product_name") or product.get("product_name_es") or "").strip()
    if not name:
        return None
    if name.isdigit() and len(name) >= 8:
        return None

    nutriments = product.get("nutriments", {})
    kcal = _num(nutriments.get("energy-kcal_100g"))
    if not kcal and nutriments.get("energy_100g"):
        kcal = round(float(nutriments["energy_100g"]) / 4.184, 1)

    code = product.get("code") or product.get("_id")
    brand = (product.get("brands") or "").strip() or None
    image = _pick_front_image(product)
    name_es = product.get("product_name_es") or None

    serving_q = product.get("serving_quantity")
    serving_unit = product.get("serving_size") or None

    per_100g = MacroBlock(
        calories=kcal,
        protein=_num(nutriments.get("proteins_100g")),
        carbs=_num(nutriments.get("carbohydrates_100g")),
        fat=_num(nutriments.get("fat_100g")),
        fiber=_num(nutriments.get("fiber_100g")),
    )

    per_serving: Optional[MacroBlock] = None
    srv_kcal = _num(nutriments.get("energy-kcal_serving"))
    if srv_kcal is not None:
        per_serving = MacroBlock(
            calories=srv_kcal,
            protein=_num(nutriments.get("proteins_serving")),
            carbs=_num(nutriments.get("carbohydrates_serving")),
            fat=_num(nutriments.get("fat_serving")),
            fiber=_num(nutriments.get("fiber_serving")),
        )

    serving = None
    if serving_q is not None:
        try:
            serving = ServingInfo(amount=1, unit=serving_unit, grams=float(serving_q))
        except (ValueError, TypeError):
            pass

    item_type = "packaged" if brand else "generic"

    tags = product.get("categories_tags", [])
    category = None
    if tags:
        category = tags[0].replace("en:", "").replace("-", " ").title()

    display_name = name_es or name

    return NutritionFoodItem(
        id=str(code) if code else None,
        source="openfoodfacts",
        source_id=str(code) if code else None,
        type=item_type,
        name=display_name,
        normalized_name=normalize_food_query(display_name),
        brand=brand,
        barcode=str(code) if code else None,
        language="es" if name_es else None,
        image_url=image,
        serving=serving,
        per_100g=per_100g,
        per_serving=per_serving,
        metadata={"category": category} if category else None,
    )
