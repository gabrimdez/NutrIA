from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from app.core.rate_limit import limit_if_enabled
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.services.progress_service import ProgressService
from app.services.badge_integration import fire_progress_summary_viewed
from app.ai.groq_client import has_groq_keys
from app.schemas.progress import (
    WeightLogCreate, WeightLogResponse, ActivityLogCreate,
    ActivityLogResponse, ProgressSummary, PlateauAnalysis,
    WaterLogUpdate, WaterLogResponse, ActivityDayResponse,
    EstimateTrainingRequest, EstimateTrainingResponse,
)

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/summary", response_model=ProgressSummary)
@limit_if_enabled("120/minute")
async def get_progress_summary(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProgressService(db)
    result = await service.get_progress_summary(user_id)
    await fire_progress_summary_viewed(db, user_id)
    return ProgressSummary(
        current_weight_kg=result["current_weight_kg"],
        weight_trend=[WeightLogResponse.model_validate(w) for w in result["weight_trend"]],
        avg_daily_kcal_7d=result["avg_daily_kcal_7d"],
        avg_daily_protein_7d=result["avg_daily_protein_7d"],
        adherence_percentage_7d=result["adherence_percentage_7d"],
        days_logged_7d=result["days_logged_7d"],
        total_meals_7d=result["total_meals_7d"],
        nutrition_streak_days=result["nutrition_streak_days"],
    )


@router.post("/weight", response_model=WeightLogResponse)
@limit_if_enabled("120/minute")
async def log_weight(
    request: Request,
    data: WeightLogCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProgressService(db)
    return await service.log_weight(user_id, data.weight_kg, data.date, data.notes)


@router.get("/weight-history", response_model=list[WeightLogResponse])
@limit_if_enabled("120/minute")
async def get_weight_history(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProgressService(db)
    return await service.get_weight_history(user_id)


@router.get("/activity", response_model=ActivityDayResponse)
@limit_if_enabled("120/minute")
async def get_activity(
    request: Request,
    log_date: Optional[date] = Query(None, alias="date"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProgressService(db)
    d = log_date or date.today()
    return await service.get_activity_day(user_id, d)


@router.post("/activity", response_model=ActivityLogResponse)
@limit_if_enabled("120/minute")
async def log_activity(
    request: Request,
    data: ActivityLogCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProgressService(db)
    return await service.log_activity(
        user_id, data.date,
        steps=data.steps,
        training_type=data.training_type,
        training_duration_min=data.training_duration_min,
        notes=data.notes,
        estimated_burn_kcal=data.estimated_burn_kcal,
    )


@router.post("/estimate-training", response_model=EstimateTrainingResponse)
@limit_if_enabled("30/minute")
async def estimate_training(
    request: Request,
    data: EstimateTrainingRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    _ = user_id  # autenticado; sin personalización por usuario en MVP
    if not (data.text or "").strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Texto demasiado corto.",
        )
    if not has_groq_keys():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Estimación por IA no disponible (servidor sin clave LLM).",
        )
    service = ProgressService(db)
    result = await service.estimate_training(data.text.strip())
    if not result:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se pudo estimar el entrenamiento. Reformula la descripción.",
        )
    return result


@router.put("/water", response_model=WaterLogResponse)
@limit_if_enabled("120/minute")
async def set_water(
    request: Request,
    data: WaterLogUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProgressService(db)
    row = await service.set_water(user_id, data.date, data.glasses)
    return WaterLogResponse.model_validate(row)


@router.get("/water", response_model=WaterLogResponse)
@limit_if_enabled("120/minute")
async def get_water(
    request: Request,
    log_date: Optional[date] = Query(None, alias="date"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProgressService(db)
    result = await service.get_water_today(user_id, log_date)
    if hasattr(result, "date"):
        return WaterLogResponse.model_validate(result)
    return WaterLogResponse(
        date=result["date"],
        glasses=result["glasses"],
        updated_at=result["updated_at"] or datetime.now(timezone.utc),
    )


@router.get("/plateau", response_model=PlateauAnalysis)
@limit_if_enabled("30/minute")
async def analyze_plateau(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProgressService(db)
    return await service.analyze_plateau(user_id)
