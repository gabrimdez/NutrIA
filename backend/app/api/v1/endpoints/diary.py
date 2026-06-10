from datetime import date
from fastapi import APIRouter, Depends, Query, Request
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rate_limit import limit_if_enabled
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.services.meal_service import MealService
from app.schemas.meal import DayDiaryResponse, MealEntryResponse, MonthSummaryResponse

router = APIRouter(prefix="/diary", tags=["diary"])


@router.get("/day", response_model=DayDiaryResponse)
@limit_if_enabled("120/minute")
async def get_day_diary(
    request: Request,
    diary_date: date = Query(default=None, alias="date"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if diary_date is None:
        diary_date = date.today()
    service = MealService(db)
    result = await service.get_diary(user_id, diary_date)
    meals_response = [MealEntryResponse.model_validate(m) for m in result["meals"]]
    return DayDiaryResponse(
        date=result["date"],
        meals=meals_response,
        total_kcal=result["total_kcal"],
        total_protein_g=result["total_protein_g"],
        total_carbs_g=result["total_carbs_g"],
        total_fat_g=result["total_fat_g"],
        target_kcal=result["target_kcal"],
        target_protein_g=result["target_protein_g"],
        target_carbs_g=result["target_carbs_g"],
        target_fat_g=result["target_fat_g"],
    )


@router.get("/month-summary", response_model=MonthSummaryResponse)
@limit_if_enabled("120/minute")
async def get_month_summary(
    request: Request,
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Estado de cumplimiento de cada día del mes (done/partial/missed) según kcal vs objetivo."""
    service = MealService(db)
    return await service.get_month_summary(user_id, year, month)


@router.get("/recent-meals", response_model=List[MealEntryResponse])
@limit_if_enabled("120/minute")
async def get_recent_meals(
    request: Request,
    limit: int = Query(default=40, ge=1, le=80),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Últimas comidas del usuario (todas las fechas visibles en retención), más recientes primero."""
    service = MealService(db)
    entries = await service.list_recent_meal_entries(user_id, limit)
    return [MealEntryResponse.model_validate(m) for m in entries]
