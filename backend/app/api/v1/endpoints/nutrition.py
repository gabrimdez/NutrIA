"""Nutrition endpoints: unified search, barcode lookup, photo analysis, confirm."""
import logging
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.image_uploads import read_limited_image_upload
from app.core.rate_limit import limit_if_enabled
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.services.nutrition_service import NutritionService
from app.services.meal_service import MealService
from app.services.subscription_quota_service import SubscriptionQuotaService
from app.schemas.food import (
    NutritionSearchResponse,
    NutritionBarcodeResponse,
    NutritionPhotoResponse,
    NutritionConfirmRequest,
)
from app.schemas.meal import MealConfirmRequest, MealItemCreate, MealTypeEnum, MealEntryResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/nutrition", tags=["nutrition"])

_MAX_IMAGE_SIZE = 10 * 1024 * 1024


@router.get("/search", response_model=NutritionSearchResponse)
@limit_if_enabled("120/minute")
async def nutrition_search(
    request: Request,
    q: str = Query(min_length=2, max_length=200),
    lang: str = Query(default="es", max_length=5),
    limit: int = Query(default=20, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = NutritionService(db)
    out = await service.search(q, lang=lang, limit=limit)
    from app.services.badge_integration import fire_nutrition_search

    await fire_nutrition_search(db, user_id, q)
    return out


@router.get("/barcode/{code}", response_model=NutritionBarcodeResponse)
@limit_if_enabled("120/minute")
async def nutrition_barcode(
    request: Request,
    code: str = Path(pattern=r"^\d{8,14}$"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = NutritionService(db)
    result = await service.barcode_lookup(code)
    from app.services.badge_integration import fire_barcode_scan

    await fire_barcode_scan(db, user_id, code)
    return result


@router.post("/photo/analyze", response_model=NutritionPhotoResponse)
@limit_if_enabled("12/minute")
async def nutrition_photo_analyze(
    request: Request,
    image: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    image_bytes, mime = await read_limited_image_upload(image, _MAX_IMAGE_SIZE)

    quota = SubscriptionQuotaService(db)
    await quota.require_vision(user_id)
    service = NutritionService(db)
    result = await service.analyze_photo(image_bytes, mime)
    has_candidates = bool(result.candidates)
    if has_candidates:
        await quota.record_vision_success(user_id)
        from app.services.badge_integration import fire_photo_analyze

        await fire_photo_analyze(db, user_id, image_bytes)
    return result


@router.post("/confirm", response_model=MealEntryResponse)
@limit_if_enabled("60/minute")
async def nutrition_confirm(
    request: Request,
    data: NutritionConfirmRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        meal_date = date_type.fromisoformat(data.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha invalido. Usa YYYY-MM-DD.")

    try:
        meal_type_enum = MealTypeEnum(data.meal_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Tipo de comida invalido: {data.meal_type}")

    items = [
        MealItemCreate(
            food_catalog_id=item.food_catalog_id,
            custom_name=item.custom_name,
            grams=item.grams,
            kcal=item.kcal,
            protein_g=item.protein_g,
            carbs_g=item.carbs_g,
            fat_g=item.fat_g,
            eaten=item.eaten,
        )
        for item in data.items
    ]

    confirm_req = MealConfirmRequest(
        date=meal_date,
        meal_type=meal_type_enum,
        title=data.title,
        photo_url=data.photo_url,
        items=items,
        ai_confidence=data.ai_confidence,
        notes=data.notes,
    )

    service = MealService(db)
    return await service.confirm_meal(user_id, confirm_req)
