"""Barcode food provider using Open Food Facts API."""
import asyncio
import logging
from typing import List, Optional

import httpx

from app.core.config import get_settings
from app.food_providers.base import BarcodeFoodProvider, FoodResult
from app.food_providers.search_normalize import fold_accents, manual_search_text_matches
from app.food_providers.mappers.openfoodfacts_mapper import map_off_product
from app.schemas.food import NutritionFoodItem

logger = logging.getLogger(__name__)

OFF_PRODUCT_FIELDS = ",".join(
    [
        "code",
        "product_name",
        "product_name_es",
        "brands",
        "image_front_url",
        "image_front_small_url",
        "image_front_thumb_url",
        "image_url",
        "image_small_url",
        "image_thumb_url",
        "selected_images",
        "nutriments",
        "categories_tags",
        "serving_quantity",
        "serving_size",
    ]
)


def _off_settings() -> tuple[str, str, float]:
    settings = get_settings()
    base = (settings.off_api_base_url or "https://world.openfoodfacts.org").rstrip("/")
    ua = settings.off_user_agent or "NutrIA/1.0"
    timeout = settings.nutrition_timeout_ms / 1000.0
    return base, ua, timeout


def _off_headers() -> dict[str, str]:
    _, ua, _ = _off_settings()
    return {"User-Agent": ua, "Accept": "application/json"}


class OpenFoodFactsProvider(BarcodeFoodProvider):
    """Legacy provider returning FoodResult for backward compatibility."""

    def __init__(self):
        _, _, timeout = _off_settings()
        self.timeout = timeout

    async def search(self, query: str, limit: int = 20) -> List[FoodResult]:
        q = (query or "").strip()
        if len(q) < 2:
            return []
        folded = fold_accents(q)
        search_terms: list[str] = []
        seen_term: set[str] = set()
        for term in (q, folded):
            t = term.strip()
            if len(t) < 2:
                continue
            key = t.casefold()
            if key in seen_term:
                continue
            seen_term.add(key)
            search_terms.append(t)
        try:
            base, _, _ = _off_settings()
            async with httpx.AsyncClient(timeout=self.timeout, headers=_off_headers()) as client:
                products_by_code: dict[str, dict] = {}
                page_size = min(limit * 3, 60)
                for term in search_terms:
                    data = await self._search_cgi(client, term, page_size, base)
                    if not data.get("products"):
                        data = await self._search_v2_fallback(client, term, min(limit * 3, 40), base)
                    for product in data.get("products") or []:
                        code = product.get("code") or product.get("_id")
                        if code is not None:
                            products_by_code[str(code)] = product
                        else:
                            products_by_code[f"nocode-{id(product)}"] = product

                results: List[FoodResult] = []
                for product in products_by_code.values():
                    result = self._parse_product(product)
                    if not result:
                        continue
                    label = (result.name_es or result.name or "").strip()
                    if not manual_search_text_matches(q, label):
                        continue
                    results.append(result)
                    if len(results) >= limit:
                        break
                return results
        except Exception as e:
            logger.warning("Open Food Facts search failed: %s", e)
            return []

    async def _search_cgi(self, client: httpx.AsyncClient, query: str, page_size: int, base: str) -> dict:
        resp = await client.get(
            f"{base}/cgi/search.pl",
            params={
                "search_terms": query,
                "search_simple": 1,
                "action": "process",
                "json": 1,
                "page_size": page_size,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def _search_v2_fallback(self, client: httpx.AsyncClient, query: str, page_size: int, base: str) -> dict:
        resp = await client.get(
            f"{base}/api/v2/search",
            params={
                "search_terms": query,
                "page_size": page_size,
                "fields": OFF_PRODUCT_FIELDS,
                "json": 1,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def get_by_id(self, food_id: str) -> Optional[FoodResult]:
        return await self.search_by_barcode(food_id)

    async def search_by_barcode(self, barcode: str) -> Optional[FoodResult]:
        try:
            base, _, _ = _off_settings()
            async with httpx.AsyncClient(timeout=self.timeout, headers=_off_headers()) as client:
                resp = await client.get(f"{base}/api/v2/product/{barcode}")
                resp.raise_for_status()
                data = resp.json()
                if data.get("status") == 0:
                    return None
                prod = data.get("product")
                if isinstance(prod, dict) and prod:
                    return self._parse_product(prod)
                return None
        except Exception as e:
            logger.warning("Open Food Facts barcode lookup failed: %s", e)
            return None

    def _parse_product(self, product: dict) -> Optional[FoodResult]:
        nutriments = product.get("nutriments", {})
        name = (product.get("product_name") or product.get("product_name_es") or "").strip()
        if not name:
            return None
        if name.isdigit() and len(name) >= 8:
            return None

        kcal = float(nutriments.get("energy-kcal_100g") or 0)
        if not kcal and nutriments.get("energy_100g"):
            kcal = float(nutriments["energy_100g"]) / 4.184

        def _n(key: str) -> float:
            v = nutriments.get(key)
            return float(v) if v is not None else 0.0

        fib = nutriments.get("fiber_100g")
        code = product.get("code") or product.get("_id")
        return FoodResult(
            id=None,
            name=name,
            name_es=product.get("product_name_es"),
            category=self._get_category(product),
            provider="openfoodfacts",
            external_id=str(code) if code is not None else None,
            barcode=str(code) if code is not None else None,
            kcal_per_100g=round(kcal, 1),
            protein_per_100g=round(_n("proteins_100g"), 1),
            carbs_per_100g=round(_n("carbohydrates_100g"), 1),
            fat_per_100g=round(_n("fat_100g"), 1),
            fiber_per_100g=round(_n("fiber_100g"), 1) if fib is not None else None,
        )

    def _get_category(self, product: dict) -> Optional[str]:
        tags = product.get("categories_tags", [])
        if tags:
            return tags[0].replace("en:", "").replace("-", " ").title()
        return None

# ──────────────────────────────────────────────────────────────────────
# Nutrition-level helpers (return NutritionFoodItem instead of FoodResult)
# ──────────────────────────────────────────────────────────────────────

async def off_search_nutrition(query: str, limit: int = 20) -> List[NutritionFoodItem]:
    """Search OFF and return NutritionFoodItem list."""
    q = (query or "").strip()
    if len(q) < 2:
        return []
    folded = fold_accents(q)
    search_terms: list[str] = []
    seen_term: set[str] = set()
    for term in (q, folded):
        t = term.strip()
        if len(t) < 2:
            continue
        key = t.casefold()
        if key in seen_term:
            continue
        seen_term.add(key)
        search_terms.append(t)

    base, _, timeout = _off_settings()
    try:
        async with httpx.AsyncClient(timeout=timeout, headers=_off_headers()) as client:
            products_by_code: dict[str, dict] = {}
            page_size = min(limit * 3, 60)
            for term in search_terms:
                params = {
                    "search_terms": term,
                    "search_simple": 1,
                    "action": "process",
                    "json": 1,
                    "page_size": page_size,
                }
                resp = None
                for _attempt in range(3):
                    resp = await client.get(f"{base}/cgi/search.pl", params=params)
                    if resp.status_code != 503:
                        break
                    await asyncio.sleep(0.5 * (_attempt + 1))
                if resp is None:
                    continue
                resp.raise_for_status()
                data = resp.json()
                if not data.get("products"):
                    resp2 = await client.get(
                        f"{base}/api/v2/search",
                        params={
                            "search_terms": term, "page_size": min(limit * 3, 40),
                            "fields": OFF_PRODUCT_FIELDS,
                            "json": 1,
                        },
                    )
                    resp2.raise_for_status()
                    data = resp2.json()
                for product in data.get("products") or []:
                    code = product.get("code") or product.get("_id")
                    k = str(code) if code is not None else f"nocode-{id(product)}"
                    products_by_code[k] = product

            results: List[NutritionFoodItem] = []
            for product in products_by_code.values():
                item = map_off_product(product)
                if not item:
                    continue
                label = item.name or ""
                if not manual_search_text_matches(q, label):
                    continue
                results.append(item)
                if len(results) >= limit:
                    break
            return results
    except Exception as e:
        logger.warning("OFF nutrition search failed: %s", e)
        return []


async def off_barcode_nutrition(barcode: str) -> Optional[NutritionFoodItem]:
    """Lookup by barcode and return NutritionFoodItem."""
    base, _, timeout = _off_settings()
    try:
        async with httpx.AsyncClient(timeout=timeout, headers=_off_headers()) as client:
            resp = await client.get(
                f"{base}/api/v2/product/{barcode}",
                params={
                    "fields": OFF_PRODUCT_FIELDS,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == 0:
                return None
            prod = data.get("product")
            if isinstance(prod, dict) and prod:
                return map_off_product(prod)
            return None
    except Exception as e:
        logger.warning("OFF barcode nutrition lookup failed: %s", e)
        return None
