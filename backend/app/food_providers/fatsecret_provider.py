"""FatSecret REST API provider with OAuth2 client_credentials."""
import asyncio
import logging
import time
from typing import List, Optional

import httpx

from app.core.config import get_settings
from app.food_providers.search_normalize import normalize_food_query
from app.schemas.food import NutritionFoodItem, MacroBlock, ServingInfo

logger = logging.getLogger(__name__)

_FATSECRET_TOKEN_URL = "https://oauth.fatsecret.com/connect/token"
_FATSECRET_API_URL = "https://platform.fatsecret.com/rest/server.api"

_cached_token: Optional[str] = None
_cached_token_expires: float = 0.0
_token_lock: Optional[asyncio.Lock] = None


def _get_token_lock() -> asyncio.Lock:
    global _token_lock
    if _token_lock is None:
        _token_lock = asyncio.Lock()
    return _token_lock


def _safe_float(val, default: float = 0.0) -> Optional[float]:
    if val is None:
        return None
    try:
        return round(float(val), 1)
    except (ValueError, TypeError):
        return default


async def _get_token() -> str:
    global _cached_token, _cached_token_expires
    now = time.time()
    if _cached_token and now < _cached_token_expires - 60:
        return _cached_token

    async with _get_token_lock():
        # Re-check inside lock to avoid double fetch
        now = time.time()
        if _cached_token and now < _cached_token_expires - 60:
            return _cached_token

        settings = get_settings()
        cid = (settings.fatsecret_client_id or "").strip()
        csecret = (settings.fatsecret_client_secret or "").strip()
        if not cid or not csecret:
            raise RuntimeError("FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET not configured")

        timeout = settings.nutrition_timeout_ms / 1000.0
        async with httpx.AsyncClient(timeout=timeout) as client:
            for scope in ("basic premier", "basic"):
                resp = await client.post(
                    _FATSECRET_TOKEN_URL,
                    data={"grant_type": "client_credentials", "scope": scope},
                    auth=(cid, csecret),
                )
                if resp.status_code == 200:
                    break
            resp.raise_for_status()
            data = resp.json()

        _cached_token = data["access_token"]
        _cached_token_expires = now + float(data.get("expires_in", 86400))
        return _cached_token


def _parse_serving(srv: dict) -> tuple[Optional[MacroBlock], Optional[ServingInfo]]:
    macro = MacroBlock(
        calories=_safe_float(srv.get("calories")),
        protein=_safe_float(srv.get("protein")),
        carbs=_safe_float(srv.get("carbohydrate")),
        fat=_safe_float(srv.get("fat")),
        fiber=_safe_float(srv.get("fiber")),
    )
    info = ServingInfo(
        amount=_safe_float(srv.get("number_of_units")) or 1.0,
        unit=srv.get("serving_description"),
        grams=_safe_float(srv.get("metric_serving_amount")),
    )
    return macro, info


def _scale_to_100g(macro: MacroBlock, grams: float) -> MacroBlock:
    if grams <= 0:
        return MacroBlock()
    f = 100.0 / grams

    def _s(v: Optional[float]) -> Optional[float]:
        return round(v * f, 1) if v is not None else None

    return MacroBlock(calories=_s(macro.calories), protein=_s(macro.protein),
                      carbs=_s(macro.carbs), fat=_s(macro.fat), fiber=_s(macro.fiber))


def _map_food(food: dict) -> Optional[NutritionFoodItem]:
    food_id = str(food.get("food_id", ""))
    name = (food.get("food_name") or "").strip()
    if not name:
        return None
    brand = (food.get("brand_name") or "").strip() or None
    item_type = "branded" if brand else "generic"

    servings_raw = food.get("servings", {}).get("serving", [])
    if isinstance(servings_raw, dict):
        servings_raw = [servings_raw]

    per_serving: Optional[MacroBlock] = None
    per_100g: Optional[MacroBlock] = None
    serving_info: Optional[ServingInfo] = None

    for srv in servings_raw:
        macro, sinfo = _parse_serving(srv)
        metric_unit = (srv.get("metric_serving_unit") or "").lower()
        metric_amount = _safe_float(srv.get("metric_serving_amount"))

        if metric_unit == "g" and metric_amount and abs(metric_amount - 100.0) < 0.5:
            per_100g = macro
            if serving_info is None:
                serving_info = sinfo
            continue
        if per_serving is None:
            per_serving = macro
            serving_info = sinfo

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
        serving=serving_info,
        per_100g=per_100g,
        per_serving=per_serving,
        raw_summary=desc[:300] if desc else None,
    )


async def fatsecret_search(query: str, limit: int = 20) -> List[NutritionFoodItem]:
    settings = get_settings()
    if not (settings.fatsecret_client_id or "").strip():
        return []
    try:
        token = await _get_token()
    except Exception as e:
        logger.warning("FatSecret token error: %s", e)
        return []

    timeout = settings.nutrition_timeout_ms / 1000.0
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                _FATSECRET_API_URL,
                params={
                    "method": "foods.search",
                    "search_expression": query,
                    "format": "json",
                    "max_results": min(limit * 2, 50),
                    "page_number": 0,
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 429:
                logger.warning("FatSecret rate-limited (429)")
                return []
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("FatSecret search error: %s", e)
        return []

    foods_wrapper = data.get("foods", {})
    food_list = foods_wrapper.get("food", [])
    if isinstance(food_list, dict):
        food_list = [food_list]

    results: List[NutritionFoodItem] = []
    for f in food_list:
        item = _map_food(f)
        if item:
            results.append(item)
        if len(results) >= limit:
            break
    return results


async def fatsecret_get_by_id(food_id: str) -> Optional[NutritionFoodItem]:
    settings = get_settings()
    if not (settings.fatsecret_client_id or "").strip():
        return None
    try:
        token = await _get_token()
    except Exception as e:
        logger.warning("FatSecret token error: %s", e)
        return None

    timeout = settings.nutrition_timeout_ms / 1000.0
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                _FATSECRET_API_URL,
                params={
                    "method": "food.get.v4",
                    "food_id": food_id,
                    "format": "json",
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("FatSecret get_by_id error: %s", e)
        return None

    food = data.get("food", {})
    return _map_food(food)


async def fatsecret_barcode_search(barcode: str) -> Optional[NutritionFoodItem]:
    """Search FatSecret by barcode (uses food_id_for_barcode endpoint when available)."""
    settings = get_settings()
    if not (settings.fatsecret_client_id or "").strip():
        return None
    try:
        token = await _get_token()
    except Exception as e:
        logger.warning("FatSecret token error: %s", e)
        return None

    timeout = settings.nutrition_timeout_ms / 1000.0
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                _FATSECRET_API_URL,
                params={
                    "method": "food.find_id_for_barcode",
                    "barcode": barcode,
                    "format": "json",
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 429:
                return None
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("FatSecret barcode lookup error: %s", e)
        return None

    food_id_data = data.get("food_id", {})
    fid = food_id_data.get("value") if isinstance(food_id_data, dict) else food_id_data
    if not fid:
        return None

    item = await fatsecret_get_by_id(str(fid))
    if item:
        item.barcode = barcode
    return item
