from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from uuid import UUID
from enum import Enum


class WorkoutCategoryEnum(str, Enum):
    GYM = "gym"
    OTHER = "other"


# ---------------------------------------------------------------------------
# Routine exercises (template)
# ---------------------------------------------------------------------------

class RoutineExerciseIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    display_order: int = 0
    default_sets: Optional[int] = Field(None, ge=1, le=30)
    default_reps: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=500)


class RoutineExerciseOut(BaseModel):
    id: UUID
    name: str
    display_order: int
    default_sets: Optional[int] = None
    default_reps: Optional[str] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Routine days
# ---------------------------------------------------------------------------

class RoutineDayIn(BaseModel):
    weekday: int = Field(..., ge=0, le=6)
    label: str = Field(..., min_length=1, max_length=100)
    display_order: int = 0
    exercises: List[RoutineExerciseIn] = []


class RoutineDayOut(BaseModel):
    id: UUID
    weekday: int
    label: str
    display_order: int
    exercises: List[RoutineExerciseOut] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Routines
# ---------------------------------------------------------------------------

class RoutineCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category: WorkoutCategoryEnum
    sport_type: Optional[str] = Field(None, max_length=100)
    days_per_week: int = Field(0, ge=0, le=7)
    days: List[RoutineDayIn] = []


class RoutineUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    sport_type: Optional[str] = Field(None, max_length=100)
    days_per_week: Optional[int] = Field(None, ge=0, le=7)
    days: Optional[List[RoutineDayIn]] = None


class RoutineOut(BaseModel):
    id: UUID
    name: str
    category: str
    sport_type: Optional[str] = None
    is_active: bool
    days_per_week: int
    days: List[RoutineDayOut] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RoutineListItem(BaseModel):
    id: UUID
    name: str
    category: str
    sport_type: Optional[str] = None
    is_active: bool
    days_per_week: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Exercise sets (session)
# ---------------------------------------------------------------------------

class ExerciseSetIn(BaseModel):
    set_number: int = Field(..., ge=1, le=30)
    reps: Optional[int] = Field(None, ge=0, le=999)
    weight_kg: Optional[float] = Field(None, ge=0, le=2000)
    notes: Optional[str] = Field(None, max_length=500)


class ExerciseSetOut(BaseModel):
    id: UUID
    set_number: int
    reps: Optional[int] = None
    weight_kg: Optional[float] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Session exercises
# ---------------------------------------------------------------------------

class SessionExerciseIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    display_order: int = 0
    notes: Optional[str] = Field(None, max_length=500)
    sets: List[ExerciseSetIn] = []


class SessionExerciseOut(BaseModel):
    id: UUID
    name: str
    display_order: int
    notes: Optional[str] = None
    sets: List[ExerciseSetOut] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

class SessionCreate(BaseModel):
    routine_id: Optional[UUID] = None
    routine_day_id: Optional[UUID] = None
    category: WorkoutCategoryEnum
    date: date
    weekday: int = Field(..., ge=0, le=6)
    day_label: Optional[str] = Field(None, max_length=100)
    sport_type: Optional[str] = Field(None, max_length=100)
    free_text: Optional[str] = Field(None, max_length=10000)
    completed: bool = False
    notes: Optional[str] = Field(None, max_length=2000)
    exercises: List[SessionExerciseIn] = []


class SessionUpdate(BaseModel):
    day_label: Optional[str] = Field(None, max_length=100)
    sport_type: Optional[str] = Field(None, max_length=100)
    free_text: Optional[str] = Field(None, max_length=10000)
    completed: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=2000)
    exercises: Optional[List[SessionExerciseIn]] = None


class QuickCompleteRoutine(BaseModel):
    """Marca una rutina (gym) como hecha hoy en un solo toque."""
    routine_id: UUID
    routine_day_id: Optional[UUID] = None
    date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=2000)


class QuickCompleteOther(BaseModel):
    """Marca una sesión de otro deporte como hecha hoy con datos mínimos."""
    routine_id: Optional[UUID] = None
    sport_type: Optional[str] = Field(None, max_length=100)
    duration_min: Optional[int] = Field(None, ge=1, le=1440)
    free_text: Optional[str] = Field(None, max_length=10000)
    notes: Optional[str] = Field(None, max_length=2000)
    date: Optional[date] = None


class SessionOut(BaseModel):
    id: UUID
    routine_id: Optional[UUID] = None
    routine_day_id: Optional[UUID] = None
    category: str
    date: date
    weekday: int
    day_label: Optional[str] = None
    sport_type: Optional[str] = None
    free_text: Optional[str] = None
    completed: bool
    notes: Optional[str] = None
    exercises: List[SessionExerciseOut] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ExerciseSetTemplate(BaseModel):
    set_number: int
    reps: Optional[int] = None
    weight_kg: Optional[float] = None
    notes: Optional[str] = None


class SessionExerciseTemplate(BaseModel):
    name: str
    display_order: int = 0
    notes: Optional[str] = None
    sets: List[ExerciseSetTemplate] = []


class PreviousSessionTemplate(BaseModel):
    source_session_id: UUID
    source_date: date
    day_label: Optional[str] = None
    sport_type: Optional[str] = None
    notes: Optional[str] = None
    exercises: List[SessionExerciseTemplate] = []


class SessionListItem(BaseModel):
    id: UUID
    category: str
    date: date
    weekday: int
    day_label: Optional[str] = None
    sport_type: Optional[str] = None
    completed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Exercise history (progress chart)
# ---------------------------------------------------------------------------

class ExerciseHistorySet(BaseModel):
    set_number: int
    reps: Optional[int] = None
    weight_kg: Optional[float] = None


class ExerciseHistoryPoint(BaseModel):
    date: date
    day_label: Optional[str] = None
    display_order: Optional[int] = None
    max_weight_kg: Optional[float] = None
    total_volume: Optional[float] = None
    best_set_reps: Optional[int] = None
    sets_count: int = 0
    sets: List[ExerciseHistorySet] = []


# ---------------------------------------------------------------------------
# Week summary
# ---------------------------------------------------------------------------

class WeekDayObjective(BaseModel):
    """Objetivo individual de un día (una rutina activa que toca ese weekday)."""
    routine_id: UUID
    routine_name: str
    routine_day_id: UUID
    day_label: str
    category: str
    sport_type: Optional[str] = None
    weekday: int
    completed: bool = False
    session_id: Optional[UUID] = None


class WeekDayPlan(BaseModel):
    """Estado del día: lista de objetivos y si están todos completados."""
    weekday: int
    date: date
    total: int
    completed_count: int
    is_complete: bool
    objectives: List[WeekDayObjective] = []


class WeekSummary(BaseModel):
    week_start: date
    planned_days: int  # nº de weekdays con al menos un objetivo
    completed_days: int  # nº de weekdays con TODOS los objetivos completados
    sessions: List[SessionListItem] = []
    days: List[WeekDayPlan] = []
