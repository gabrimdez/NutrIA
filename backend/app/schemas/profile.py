from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any, Literal
from enum import Enum

from app.schemas.injury_profile import InjuryProfile, injury_profile_from_dict


class SexEnum(str, Enum):
    male = "male"
    female = "female"


class GoalTypeEnum(str, Enum):
    lose_fat = "lose_fat"
    maintain = "maintain"
    gain_muscle = "gain_muscle"
    recomposition = "recomposition"


class ActivityLevelEnum(str, Enum):
    sedentary = "sedentary"
    light = "light"
    moderate = "moderate"
    active = "active"
    very_active = "very_active"


class TrainingTypeEnum(str, Enum):
    strength = "strength"
    hypertrophy = "hypertrophy"
    mixed = "mixed"


class SubscriptionUsageSnapshot(BaseModel):
    """Cupos efectivos de Free; Premium devuelve usage=None porque es ilimitado."""

    chat_messages_limit: int
    chat_messages_used: int
    chat_messages_period: Literal["day", "month"]
    vision_analyses_limit_per_month: int
    vision_analyses_this_month: int
    plan_regenerations_limit_per_week: int
    plan_regenerations_this_week: int


class ProfileResponse(BaseModel):
    user_id: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    sex: Optional[SexEnum] = None
    birth_year: Optional[int] = None
    height_cm: Optional[float] = None
    current_weight_kg: Optional[float] = None
    onboarding_completed: bool = False
    subscription_tier: str = "free"
    usage: Optional[SubscriptionUsageSnapshot] = None

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=100)
    sex: Optional[SexEnum] = None
    birth_year: Optional[int] = Field(None, ge=1920, le=2015)
    height_cm: Optional[float] = Field(None, ge=100, le=250)
    current_weight_kg: Optional[float] = Field(None, ge=30, le=300)


class OnboardingRequest(BaseModel):
    sex: SexEnum
    birth_year: int = Field(ge=1920, le=2015)
    height_cm: float = Field(ge=100, le=250)
    current_weight_kg: float = Field(ge=30, le=300)
    goal_type: GoalTypeEnum
    target_weight_kg: Optional[float] = Field(None, ge=30, le=300)
    activity_level: ActivityLevelEnum
    training_days_per_week: int = Field(ge=0, le=7)
    training_type: TrainingTypeEnum = TrainingTypeEnum.hypertrophy
    dietary_preferences: List[str] = Field(default_factory=list, max_length=20)
    disliked_foods: List[str] = Field(default_factory=list, max_length=50)
    allergies: List[str] = Field(default_factory=list, max_length=30)
    intolerances: List[str] = Field(default_factory=list, max_length=30)
    forbidden_foods: List[str] = Field(default_factory=list, max_length=50)
    preferred_meals_per_day: int = Field(default=4, ge=2, le=8)

    @field_validator("dietary_preferences", "disliked_foods", "allergies", "intolerances", "forbidden_foods")
    @classmethod
    def _normalize_short_string_list(cls, v: List[str]) -> List[str]:
        out: List[str] = []
        seen: set[str] = set()
        for item in v or []:
            s = str(item).strip()
            if not s:
                continue
            if len(s) > 80:
                raise ValueError("Cada elemento debe tener 80 caracteres o menos")
            key = s.casefold()
            if key not in seen:
                out.append(s)
                seen.add(key)
        return out


class OnboardingResponse(BaseModel):
    profile: "ProfileResponse"
    daily_targets: "DailyTargetResponse"
    summary: str
    active_goal: "ActiveGoalResponse"


class DailyTargetResponse(BaseModel):
    calories_kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    steps_target: Optional[int] = None
    rationale: Optional[str] = None

    model_config = {"from_attributes": True}


class DailyTargetUpdate(BaseModel):
    calories_kcal: float = Field(ge=800, le=8000)
    protein_g: float = Field(ge=0, le=500)
    carbs_g: float = Field(ge=0, le=1000)
    fat_g: float = Field(ge=0, le=500)
    steps_target: Optional[int] = Field(default=None, ge=1000, le=50000)


class ActiveGoalResponse(BaseModel):
    activity_level: ActivityLevelEnum
    goal_type: GoalTypeEnum
    training_days_per_week: int
    training_type: TrainingTypeEnum
    target_weight_kg: Optional[float] = None

    model_config = {"from_attributes": True}


class ActivityLevelUpdate(BaseModel):
    activity_level: ActivityLevelEnum


class GoalRecalculateRequest(BaseModel):
    goal_type: Optional[GoalTypeEnum] = None
    activity_level: Optional[ActivityLevelEnum] = None


class GoalWeightsUpdate(BaseModel):
    """Peso objetivo del goal activo; `null` lo elimina."""

    target_weight_kg: Optional[float] = Field(..., description="kg; null para borrar")

    @field_validator("target_weight_kg")
    @classmethod
    def target_weight_range(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and (v < 30 or v > 300):
            raise ValueError("El peso objetivo debe estar entre 30 y 300 kg")
        return v


class InjuriesUpdate(BaseModel):
    active_injuries: List[InjuryProfile] = Field(default_factory=list, max_length=20)

    @field_validator("active_injuries", mode="before")
    @classmethod
    def _coerce_injuries(cls, v: Any) -> List[InjuryProfile]:
        if not v:
            return []
        out: List[InjuryProfile] = []
        for item in v:
            if isinstance(item, InjuryProfile):
                out.append(item)
                continue
            if isinstance(item, dict):
                p = injury_profile_from_dict(item)
                if p:
                    out.append(p)
        return out


class InjuriesResponse(BaseModel):
    active_injuries: List[InjuryProfile] = []


class FoodRestrictionsUpdate(BaseModel):
    """Edicion de restricciones alimentarias desde perfil."""

    dietary_preferences: Optional[List[str]] = Field(default=None, max_length=20)
    allergies: Optional[List[str]] = Field(default=None, max_length=30)
    intolerances: Optional[List[str]] = Field(default=None, max_length=30)
    forbidden_foods: Optional[List[str]] = Field(default=None, max_length=50)
    disliked_foods: Optional[List[str]] = Field(default=None, max_length=50)

    @field_validator("dietary_preferences", "allergies", "intolerances", "forbidden_foods", "disliked_foods")
    @classmethod
    def _normalize_optional_short_string_list(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        return OnboardingRequest._normalize_short_string_list(v)


class FoodRestrictionsResponse(BaseModel):
    allergies: List[str] = []
    intolerances: List[str] = []
    forbidden_foods: List[str] = []
    disliked_foods: List[str] = []
    dietary_preferences: List[str] = []
