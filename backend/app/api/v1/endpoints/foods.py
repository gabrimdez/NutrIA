from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.ai.groq_client import has_groq_keys
from app.ai.macro_estimate import estimate_macros_from_text
from app.core.rate_limit import limit_if_enabled
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.services.meal_service import MealService
from app.services.nutrition_service import NutritionService
from app.services.subscription_quota_service import SubscriptionQuotaService
from app.schemas.food import (
    FoodMacroEstimateRequest,
    FoodMacroEstimateResponse,
    FoodSearchRequest,
    FoodSearchResponse,
    FoodItem,
    PhotoAnalysisResponse,
    PhotoAnalyzeRequest,
)

router = APIRouter(prefix="/foods", tags=["foods"])


@router.post("/search", response_model=FoodSearchResponse)
@limit_if_enabled("120/minute")
async def search_foods(
    request: Request,
    data: FoodSearchRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = MealService(db)
    results = await service.search_foods(data.query, data.limit)
    items = [
        FoodItem(
            id=r.id,
            name=r.name,
            name_es=r.name_es,
            category=r.category,
            provider=r.provider,
            external_id=r.external_id,
            barcode=r.barcode,
            kcal_per_100g=round(r.kcal_per_100g, 1),
            protein_per_100g=round(r.protein_per_100g, 1),
            carbs_per_100g=round(r.carbs_per_100g, 1),
            fat_per_100g=round(r.fat_per_100g, 1),
            fiber_per_100g=round(r.fiber_per_100g, 1) if r.fiber_per_100g is not None else None,
            serving_size_g=r.serving_size_g,
            serving_description=r.serving_description,
        )
        for r in results
    ]

    # Enrich with FatSecret results if local+OFF gave few results
    if len(items) < 5:
        try:
            nutrition_svc = NutritionService(db)
            enriched = await nutrition_svc.search(data.query, limit=data.limit)
            for ni in enriched.results:
                if len(items) >= data.limit:
                    break
                existing_names = {(i.name or "").lower() for i in items}
                if (ni.name or "").lower() in existing_names:
                    continue
                p100 = ni.per_100g
                items.append(FoodItem(
                    id=None,
                    name=ni.name,
                    name_es=ni.name if ni.language == "es" else None,
                    category=None,
                    provider=ni.source,
                    external_id=ni.source_id,
                    barcode=ni.barcode,
                    kcal_per_100g=round(p100.calories or 0, 1) if p100 else 0,
                    protein_per_100g=round(p100.protein or 0, 1) if p100 else 0,
                    carbs_per_100g=round(p100.carbs or 0, 1) if p100 else 0,
                    fat_per_100g=round(p100.fat or 0, 1) if p100 else 0,
                    fiber_per_100g=round(p100.fiber, 1) if p100 and p100.fiber is not None else None,
                    serving_size_g=ni.serving.grams if ni.serving else None,
                    serving_description=ni.serving.unit if ni.serving else None,
                ))
        except Exception:
            pass

    from app.services.badge_integration import fire_food_search

    await fire_food_search(db, user_id, data.query)
    return FoodSearchResponse(results=items, total=len(items))


@router.post("/analyze-photo", response_model=PhotoAnalysisResponse)
@limit_if_enabled("12/minute")
async def analyze_photo(
    request: Request,
    data: PhotoAnalyzeRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    quota = SubscriptionQuotaService(db)
    await quota.require_vision(user_id)
    service = MealService(db)
    result = await service.analyze_photo(
        image_url=data.image_url,
        image_base64=data.image_base64,
        mime_type=data.mime_type,
    )
    if not result:
        raise HTTPException(status_code=422, detail="No se pudo analizar la imagen. Intenta con otra foto.")
    await quota.record_vision_success(user_id)
    return result


@router.post("/estimate-macros", response_model=FoodMacroEstimateResponse)
@limit_if_enabled("30/minute")
async def estimate_macros(
    request: Request,
    data: FoodMacroEstimateRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if not has_groq_keys():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Estimación por IA no disponible (servidor sin clave LLM).",
        )
    quota = SubscriptionQuotaService(db)
    await quota.require_premium_for_macro_estimate(user_id)
    ai = await estimate_macros_from_text(
        name=data.name.strip(),
        quantity=data.quantity,
        unit=data.unit,
    )
    if not ai:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se pudieron estimar los macros. Reformula el nombre o ajusta la cantidad.",
        )
    return FoodMacroEstimateResponse(
        kcal=round(float(ai.kcal), 1),
        protein_g=round(float(ai.protein_g), 1),
        carbs_g=round(float(ai.carbs_g), 1),
        fat_g=round(float(ai.fat_g), 1),
        confidence=ai.confidence,
        notes=ai.notes,
    )
