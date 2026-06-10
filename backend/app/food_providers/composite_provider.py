"""Composite provider that combines multiple food data sources."""
from typing import List, Optional

from app.food_providers.base import FoodProvider, FoodResult, BarcodeFoodProvider
from app.food_providers.search_normalize import fold_key_for_dedupe, skip_cooked_meat_for_manual_search


def _prefer_catalog(a: FoodResult, b: FoodResult) -> FoodResult:
    """Prioriza filas verificadas del catálogo local frente a APIs externas."""
    a_loc = a.provider == "generic"
    b_loc = b.provider == "generic"
    if a_loc and not b_loc:
        return a
    if b_loc and not a_loc:
        return b
    if a.is_verified and not b.is_verified:
        return a
    if b.is_verified and not a.is_verified:
        return b
    return a


class CompositeFoodProvider(FoodProvider):
    def __init__(self, providers: List[FoodProvider]):
        self.providers = providers

    async def search(self, query: str, limit: int = 20) -> List[FoodResult]:
        buckets: dict[str, FoodResult] = {}

        for provider in self.providers:
            results = await provider.search(query, limit=limit)
            for r in results:
                if skip_cooked_meat_for_manual_search(r):
                    continue
                key = fold_key_for_dedupe(r)
                if not key:
                    continue
                prev = buckets.get(key)
                if prev is None:
                    buckets[key] = r
                else:
                    buckets[key] = _prefer_catalog(prev, r)

        merged = list(buckets.values())

        def _sort_key(r: FoodResult) -> tuple:
            name = (r.name_es or r.name or "").lower()
            local = 0 if r.provider == "generic" else 1
            return (not r.is_verified, local, name)

        merged.sort(key=_sort_key)
        return merged[:limit]

    async def get_by_id(self, food_id: str) -> Optional[FoodResult]:
        for provider in self.providers:
            result = await provider.get_by_id(food_id)
            if result:
                return result
        return None

    async def search_by_barcode(self, barcode: str) -> Optional[FoodResult]:
        for provider in self.providers:
            if isinstance(provider, BarcodeFoodProvider):
                result = await provider.search_by_barcode(barcode)
                if result:
                    return result
        return None
