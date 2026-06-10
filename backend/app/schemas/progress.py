from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import date, datetime
from uuid import UUID


def _not_future(v: date) -> date:
    if v > date.today():
        raise ValueError("La fecha no puede ser en el futuro.")
    return v


class WeightLogCreate(BaseModel):
    weight_kg: float = Field(ge=30, le=300)
    date: date
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: date) -> date:
        return _not_future(v)


class WeightLogResponse(BaseModel):
    id: UUID
    weight_kg: float
    date: date
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityLogCreate(BaseModel):
    date: date
    steps: Optional[int] = Field(None, ge=0, le=100000)
    training_type: Optional[str] = Field(default=None, max_length=80)
    training_duration_min: Optional[int] = Field(None, ge=0, le=600)
    notes: Optional[str] = Field(default=None, max_length=1000)
    estimated_burn_kcal: Optional[float] = Field(None, ge=0, le=20000)

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: date) -> date:
        return _not_future(v)


class ActivityLogResponse(BaseModel):
    id: UUID
    date: date
    steps: Optional[int] = None
    training_type: Optional[str] = None
    training_duration_min: Optional[int] = None
    notes: Optional[str] = None
    estimated_burn_kcal: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityDayResponse(BaseModel):
    """Último registro de actividad del día (GET /progress/activity)."""

    date: date
    steps: Optional[int] = None
    training_type: Optional[str] = None
    training_duration_min: Optional[int] = None
    notes: Optional[str] = None
    estimated_burn_kcal: Optional[float] = None


class EstimateTrainingRequest(BaseModel):
    text: str = Field(..., min_length=3, max_length=4000)


class EstimateTrainingResponse(BaseModel):
    estimated_kcal: float = Field(ge=0, le=20000)
    duration_min: Optional[int] = Field(None, ge=0, le=600)
    summary_es: str = ""
    confidence: Optional[str] = None  # high | medium | low


class ProgressSummary(BaseModel):
    current_weight_kg: Optional[float] = None
    weight_trend: List[WeightLogResponse] = []
    avg_daily_kcal_7d: Optional[float] = None
    avg_daily_protein_7d: Optional[float] = None
    adherence_percentage_7d: Optional[float] = None
    days_logged_7d: int = 0
    total_meals_7d: int = 0
    nutrition_streak_days: int = 0


class WaterLogUpdate(BaseModel):
    date: date
    glasses: int = Field(ge=0, le=30)


class WaterLogResponse(BaseModel):
    date: date
    glasses: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlateauAnalysis(BaseModel):
    is_plateau: bool
    weeks_stagnant: int = 0
    adherence_good: bool = False
    data_sufficient: bool = False
    recommendation: str
    suggested_action: str  # increase_movement, reduce_calories, improve_adherence, need_more_data
    new_target_kcal: Optional[float] = None
    rationale: str
