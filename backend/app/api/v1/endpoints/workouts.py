from datetime import date
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limit_if_enabled
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.services.workout_service import WorkoutService
from app.schemas.workout import (
    RoutineCreate, RoutineUpdate, RoutineOut, RoutineListItem,
    SessionCreate, SessionUpdate, SessionOut, SessionListItem,
    QuickCompleteRoutine, QuickCompleteOther,
    ExerciseHistoryPoint, PreviousSessionTemplate, WeekSummary,
)

router = APIRouter(prefix="/workouts", tags=["workouts"])


# ------------------------------------------------------------------
# Routines
# ------------------------------------------------------------------

@router.get("/routines", response_model=List[RoutineListItem])
@limit_if_enabled("120/minute")
async def list_routines(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.list_routines(user_id)


@router.get("/routines/{routine_id}", response_model=RoutineOut)
@limit_if_enabled("120/minute")
async def get_routine(
    request: Request,
    routine_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.get_routine(user_id, routine_id)


@router.post("/routines", response_model=RoutineOut, status_code=201)
@limit_if_enabled("120/minute")
async def create_routine(
    request: Request,
    data: RoutineCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.create_routine(user_id, data)


@router.put("/routines/{routine_id}", response_model=RoutineOut)
@limit_if_enabled("120/minute")
async def update_routine(
    request: Request,
    routine_id: UUID,
    data: RoutineUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.update_routine(user_id, routine_id, data)


@router.delete("/routines/{routine_id}", status_code=204)
@limit_if_enabled("120/minute")
async def delete_routine(
    request: Request,
    routine_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    await service.delete_routine(user_id, routine_id)


@router.patch("/routines/{routine_id}/activate", response_model=RoutineOut)
@limit_if_enabled("120/minute")
async def activate_routine(
    request: Request,
    routine_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.activate_routine(user_id, routine_id)


# ------------------------------------------------------------------
# Sessions
# ------------------------------------------------------------------

@router.get("/sessions", response_model=List[SessionListItem])
@limit_if_enabled("120/minute")
async def list_sessions(
    request: Request,
    category: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.list_sessions(user_id, category, from_date, to_date)


@router.get("/sessions/previous-template", response_model=PreviousSessionTemplate)
@limit_if_enabled("120/minute")
async def previous_session_template(
    request: Request,
    date: date = Query(...),
    weekday: int = Query(..., ge=0, le=6),
    category: str = Query("gym"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.get_previous_session_template(
        user_id,
        weekday=weekday,
        before_date=date,
        category=category,
    )


@router.get("/sessions/{session_id}", response_model=SessionOut)
@limit_if_enabled("120/minute")
async def get_session(
    request: Request,
    session_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.get_session(user_id, session_id)


@router.post("/sessions", response_model=SessionOut, status_code=201)
@limit_if_enabled("120/minute")
async def create_session(
    request: Request,
    data: SessionCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.create_session(user_id, data)


@router.put("/sessions/{session_id}", response_model=SessionOut)
@limit_if_enabled("120/minute")
async def update_session(
    request: Request,
    session_id: UUID,
    data: SessionUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.update_session(user_id, session_id, data)


@router.delete("/sessions/{session_id}", status_code=204)
@limit_if_enabled("120/minute")
async def delete_session(
    request: Request,
    session_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    await service.delete_session(user_id, session_id)


@router.patch("/sessions/{session_id}/complete", response_model=SessionOut)
@limit_if_enabled("120/minute")
async def complete_session(
    request: Request,
    session_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.complete_session(user_id, session_id)


@router.post("/sessions/{session_id}/copy-previous", response_model=SessionOut)
@limit_if_enabled("60/minute")
async def copy_previous_session(
    request: Request,
    session_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.copy_previous_session(user_id, session_id)


# ------------------------------------------------------------------
# Quick complete (un toque)
# ------------------------------------------------------------------

@router.post("/sessions/quick-complete", response_model=SessionOut, status_code=201)
@limit_if_enabled("60/minute")
async def quick_complete_routine(
    request: Request,
    data: QuickCompleteRoutine,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.quick_complete_routine(user_id, data)


@router.post("/sessions/quick-other", response_model=SessionOut, status_code=201)
@limit_if_enabled("60/minute")
async def quick_complete_other(
    request: Request,
    data: QuickCompleteOther,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.quick_complete_other(user_id, data)


# ------------------------------------------------------------------
# Distinct exercise names
# ------------------------------------------------------------------

@router.get("/exercises", response_model=List[str])
@limit_if_enabled("120/minute")
async def list_exercises(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.get_distinct_exercises(user_id)


# ------------------------------------------------------------------
# Exercise history
# ------------------------------------------------------------------

@router.get("/exercises/{exercise_name}/history", response_model=List[ExerciseHistoryPoint])
@limit_if_enabled("120/minute")
async def get_exercise_history(
    request: Request,
    exercise_name: str,
    limit: int = Query(30, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.get_exercise_history(user_id, exercise_name, limit)


# ------------------------------------------------------------------
# Week summary
# ------------------------------------------------------------------

@router.get("/summary/week", response_model=WeekSummary)
@limit_if_enabled("120/minute")
async def get_week_summary(
    request: Request,
    ref_date: Optional[date] = Query(None, alias="date"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = WorkoutService(db)
    return await service.get_week_summary(user_id, ref_date)
