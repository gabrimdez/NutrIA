"""Central nutrition service orchestrating search, barcode and photo analysis."""
import logging
import time
from typing import Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.food_providers.fatsecret_provider import fatsecret_search, fatsecret_barcode_search
from app.food_providers.barcode_provider import off_search_nutrition, off_barcode_nutrition
from app.food_providers.logmeal_provider import logmeal_analyze
from app.food_providers.generic_provider import GenericFoodProvider
from app.food_providers.search_normalize import (
    normalize_food_query,
    score_nutrition_item,
    deduplicate_nutrition_items,
)
from app.schemas.food import (
    NutritionFoodItem,
    NutritionSearchResponse,
    NutritionBarcodeResponse,
    NutritionPhotoResponse,
    PhotoCandidate,
    MacroBlock,
)
from app.ai.photo_analyzer import analyze_food_photo
from app.rules.nutrition_rules import calculate_food_macros

logger = logging.getLogger(__name__)

_MIN_USEFUL_RESULTS = 3
_CACHE_TTL_S = 600  # 10 min
_CACHE_MAX_ENTRIES = 200

# NutritionFoodItem.source solo admite estos valores; en BD `food_catalog.provider` puede ser marca u otros (p. ej. "Campofrío").
_ALLOWED_NUTRITION_SOURCES = frozenset({"fatsecret", "logmeal", "openfoodfacts", "generic", "groq"})


def _provider_to_nutrition_source(provider: Optional[str]) -> str:
    p = (provider or "generic").strip().lower()
    return p if p in _ALLOWED_NUTRITION_SOURCES else "generic"

_SEARCH_SYNONYMS: Dict[str, str] = {
    "pipas": "sunflower seeds",
    "cacahuetes": "peanuts",
    "almendras": "almonds",
    "nueces": "walnuts",
    "pistachos": "pistachios",
    "avellanas": "hazelnuts",
    "anacardos": "cashews",
    "garbanzos": "chickpeas",
    "lentejas": "lentils",
    "judias": "beans",
    "guisantes": "peas",
    "platano": "banana",
    "manzana": "apple",
    "naranja": "orange",
    "arroz": "rice",
    "avena": "oats",
    "pasta": "pasta",
    "pan": "bread",
    "leche": "milk",
    "yogur": "yogurt",
    "queso": "cheese",
    "huevo": "egg",
    "pollo": "chicken",
    "ternera": "beef",
    "cerdo": "pork",
    "salmon": "salmon",
    "atun": "tuna",
}

_search_cache: Dict[str, Tuple[float, List[NutritionFoodItem]]] = {}


def _cache_get(key: str) -> Optional[List[NutritionFoodItem]]:
    entry = _search_cache.get(key)
    if entry and (time.monotonic() - entry[0]) < _CACHE_TTL_S:
        return entry[1]
    if entry:
        _search_cache.pop(key, None)
    return None


def _cache_put(key: str, items: List[NutritionFoodItem]) -> None:
    if len(_search_cache) >= _CACHE_MAX_ENTRIES:
        oldest = min(_search_cache, key=lambda k: _search_cache[k][0])
        _search_cache.pop(oldest, None)
    _search_cache[key] = (time.monotonic(), items)


def _food_result_to_nutrition(r) -> NutritionFoodItem:
    """Convert legacy FoodResult to NutritionFoodItem."""
    return NutritionFoodItem(
        id=str(r.id) if r.id else None,
        source=_provider_to_nutrition_source(r.provider),
        source_id=r.external_id,
        type="generic",
        name=r.name_es or r.name,
        normalized_name=normalize_food_query(r.name_es or r.name),
        barcode=r.barcode,
        per_100g=MacroBlock(
            calories=round(r.kcal_per_100g, 1) if r.kcal_per_100g else None,
            protein=round(r.protein_per_100g, 1) if r.protein_per_100g else None,
            carbs=round(r.carbs_per_100g, 1) if r.carbs_per_100g else None,
            fat=round(r.fat_per_100g, 1) if r.fat_per_100g else None,
            fiber=round(r.fiber_per_100g, 1) if r.fiber_per_100g is not None else None,
        ),
    )


class NutritionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def search(self, query: str, lang: str = "es", limit: int = 20) -> NutritionSearchResponse:
        original_query = (query or "").strip()
        nq = normalize_food_query(original_query)
        if len(nq) < 2:
            return NutritionSearchResponse(results=[], total=0, query=original_query, normalized_query=nq)

        cache_key = f"{nq}:{lang}:{limit}"

        all_items: List[NutritionFoodItem] = []

        generic = GenericFoodProvider(self.db)
        local_results = await generic.search(original_query, limit=limit)
        for r in local_results:
            all_items.append(_food_result_to_nutrition(r))

        fs_results = await fatsecret_search(original_query, limit=limit)
        all_items.extend(fs_results)

        if len(fs_results) < _MIN_USEFUL_RESULTS and nq != original_query.lower().strip():
            fs_norm = await fatsecret_search(nq, limit=limit)
            all_items.extend(fs_norm)

        alt = _SEARCH_SYNONYMS.get(nq)
        if alt:
            fs_alt = await fatsecret_search(alt, limit=limit)
            all_items.extend(fs_alt)

        off_results = await off_search_nutrition(original_query, limit=limit)
        all_items.extend(off_results)

        if alt:
            off_alt = await off_search_nutrition(alt, limit=limit)
            all_items.extend(off_alt)

        cached = _cache_get(cache_key)
        if cached:
            all_items.extend(cached)

        logger.info("search '%s': local=%d fs=%d off=%d cached=%d alt=%s total=%d",
                     nq, len(local_results), len(fs_results), len(off_results),
                     len(cached) if cached else 0, alt or '-', len(all_items))

        deduped = deduplicate_nutrition_items(all_items)
        logger.info("search '%s': after dedup=%d", nq, len(deduped))

        for item in deduped:
            item.confidence = score_nutrition_item(item, nq)

        deduped.sort(key=lambda x: -(x.confidence or 0))
        final = deduped[:limit]

        _cache_put(cache_key, final)

        return NutritionSearchResponse(
            results=final,
            total=len(final),
            query=original_query,
            normalized_query=nq,
        )

    async def barcode_lookup(self, code: str) -> NutritionBarcodeResponse:
        code = (code or "").strip()
        if not code or not code.isdigit() or len(code) < 8:
            return NutritionBarcodeResponse(
                found=False,
                message="Código de barras inválido. Debe tener al menos 8 dígitos.",
            )

        item = await off_barcode_nutrition(code)
        if item:
            return NutritionBarcodeResponse(found=True, item=item)

        item = await fatsecret_barcode_search(code)
        if item:
            return NutritionBarcodeResponse(found=True, item=item)

        return NutritionBarcodeResponse(
            found=False,
            message=f"Producto con código {code} no encontrado. Prueba con búsqueda manual.",
        )

    async def analyze_photo(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
        *,
        image_url: Optional[str] = None,
        image_base64: Optional[str] = None,
    ) -> NutritionPhotoResponse:
        settings = get_settings()

        if (settings.logmeal_api_key or "").strip() and image_bytes:
            candidates = await logmeal_analyze(image_bytes, mime_type)
            if candidates:
                overall = min(1.0, sum(c.confidence for c in candidates) / max(len(candidates), 1))
                return NutritionPhotoResponse(
                    candidates=candidates,
                    overall_confidence=round(overall, 2),
                    source="logmeal",
                )

        vision_url = None
        if image_base64 and image_base64.strip():
            raw = image_base64.strip()
            vision_url = raw if raw.startswith("data:") else f"data:{mime_type};base64,{raw}"
        elif image_url and image_url.strip():
            vision_url = image_url.strip()
        elif image_bytes:
            import base64
            b64 = base64.b64encode(image_bytes).decode()
            vision_url = f"data:{mime_type};base64,{b64}"

        if not vision_url:
            return NutritionPhotoResponse(
                candidates=[],
                overall_confidence=0.0,
                source="none",
                notes=["No se proporcionó imagen válida."],
            )

        ai_result = await analyze_food_photo(vision_url)
        if not ai_result:
            return NutritionPhotoResponse(
                candidates=[],
                overall_confidence=0.0,
                source="groq",
                notes=["El análisis de imagen no pudo completarse."],
            )

        generic = GenericFoodProvider(self.db)
        candidates: List[PhotoCandidate] = []
        for item in ai_result.items:
            matched = await generic.search_by_name_exact(item.normalized_name)
            if not matched:
                results = await generic.search(item.normalized_name, limit=1)
                matched = results[0] if results else None

            per_100g = None
            per_serving = None
            if matched:
                per_100g = MacroBlock(
                    calories=matched.kcal_per_100g,
                    protein=matched.protein_per_100g,
                    carbs=matched.carbs_per_100g,
                    fat=matched.fat_per_100g,
                    fiber=matched.fiber_per_100g,
                )
                macros = calculate_food_macros(
                    matched.kcal_per_100g, matched.protein_per_100g,
                    matched.carbs_per_100g, matched.fat_per_100g,
                    item.estimated_grams,
                )
                per_serving = MacroBlock(
                    calories=macros["kcal"],
                    protein=macros["protein_g"],
                    carbs=macros["carbs_g"],
                    fat=macros["fat_g"],
                )

            conf_map = {"high": 0.9, "medium": 0.6, "low": 0.3}
            conf = conf_map.get(item.confidence, 0.5)

            candidates.append(PhotoCandidate(
                name=item.detected_name,
                normalized_name=item.normalized_name,
                estimated_grams=item.estimated_grams,
                confidence=conf,
                per_100g=per_100g,
                per_serving=per_serving,
                source="groq",
                requires_confirmation=conf < 0.8,
            ))

        overall = min(1.0, sum(c.confidence for c in candidates) / max(len(candidates), 1)) if candidates else 0.0
        conf_map_rev = {"high": 0.9, "medium": 0.6, "low": 0.3}
        overall = max(overall, conf_map_rev.get(ai_result.overall_confidence, 0.5))

        return NutritionPhotoResponse(
            candidates=candidates,
            overall_confidence=round(min(1.0, overall), 2),
            source="groq",
            notes=ai_result.notes,
        )
