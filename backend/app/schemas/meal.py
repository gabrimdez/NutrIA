from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from uuid import UUID
from datetime import date, datetime
from enum import Enum

from app.rules.food_validation_rules import (
    MAX_CARBS_PER_100G,
    MAX_FAT_PER_100G,
    MAX_KCAL_PER_100G,
    MAX_PROTEIN_PER_100G,
)


class MealTypeEnum(str, Enum):
    breakfast = "breakfast"
    lunch = "lunch"
    dinner = "dinner"
    snack = "snack"


class ParseTextMealRequest(BaseModel):
    text: str = Field(min_length=3, max_length=1000)


class MealItemCreate(BaseModel):
    food_catalog_id: Optional[UUID] = None
    custom_name: Optional[str] = Field(default=None, max_length=200)
    grams: float = Field(gt=0, le=5000)
    kcal: float = Field(ge=0, le=20000)
    protein_g: float = Field(ge=0, le=2000)
    carbs_g: float = Field(ge=0, le=2000)
    fat_g: float = Field(ge=0, le=2000)
    """Si es True, cuenta en el resumen del día; si es False, sigue listado pero no suma."""
    eaten: bool = True


class MealConfirmRequest(BaseModel):
    date: date
    meal_type: MealTypeEnum
    title: Optional[str] = Field(default=None, max_length=200)
    photo_url: Optional[str] = Field(default=None, max_length=2048)
    items: List[MealItemCreate] = Field(min_length=1, max_length=80)
    ai_confidence: Optional[str] = Field(default=None, max_length=40)
    notes: Optional[str] = Field(default=None, max_length=2000)


class MealItemResponse(BaseModel):
    id: UUID
    food_catalog_id: Optional[UUID] = None
    custom_name: Optional[str] = None
    grams: float
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    source: Optional[str] = None
    eaten: bool = True

    model_config = {"from_attributes": True}


class MealItemEatenUpdate(BaseModel):
    eaten: bool


class MealEntryResponse(BaseModel):
    id: UUID
    user_id: str
    date: date
    meal_type: MealTypeEnum
    title: Optional[str] = None
    photo_url: Optional[str] = None
    total_kcal: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    ai_confidence: Optional[str] = None
    notes: Optional[str] = None
    items: List[MealItemResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class MealUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    meal_type: Optional[MealTypeEnum] = None
    items: Optional[List[MealItemCreate]] = Field(default=None, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=2000)


class SavedMealCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    items: List[MealItemCreate] = Field(min_length=1, max_length=80)


class SavedMealResponse(BaseModel):
    id: UUID
    name: str
    total_kcal: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    items: List[MealItemResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class DayDiaryResponse(BaseModel):
    date: date
    meals: List[MealEntryResponse]
    total_kcal: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    target_kcal: Optional[float] = None
    target_protein_g: Optional[float] = None
    target_carbs_g: Optional[float] = None
    target_fat_g: Optional[float] = None


class DayStatusEntry(BaseModel):
    date: date
    kcal: float
    status: str  # "done" | "partial" | "missed"


class MonthSummaryResponse(BaseModel):
    year: int
    month: int
    target_kcal: Optional[float] = None
    days: List[DayStatusEntry]


class RecipeItemCreate(BaseModel):
    food_catalog_id: Optional[UUID] = None
    custom_name: Optional[str] = Field(default=None, max_length=200)
    grams: float = Field(gt=0, le=5000)
    kcal: float = Field(ge=0, le=20000)
    protein_g: float = Field(ge=0, le=2000)
    carbs_g: float = Field(ge=0, le=2000)
    fat_g: float = Field(ge=0, le=2000)


class RecipeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    servings: int = Field(ge=1, le=50, default=1)
    icon: Optional[str] = Field(default=None, max_length=32)
    items: List[RecipeItemCreate] = Field(min_length=1, max_length=80)


class RecipeItemResponse(BaseModel):
    id: UUID
    food_catalog_id: Optional[UUID] = None
    custom_name: Optional[str] = None
    grams: float
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float

    model_config = {"from_attributes": True}


class RecipeResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    servings: int
    total_weight_g: float
    total_kcal: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    icon: Optional[str] = None
    items: List[RecipeItemResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class RecipeRecommendationItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    grams: float = Field(ge=0)
    kcal: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)


class RecipeRecommendation(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    icon: Optional[str] = Field(default=None, max_length=8)
    description: Optional[str] = Field(default=None, max_length=300)
    servings: int = Field(ge=1, le=8, default=1)
    prep_time_min: Optional[int] = Field(default=None, ge=1, le=300)
    difficulty: Optional[str] = Field(default=None, max_length=20)
    tags: List[str] = Field(default_factory=list, max_length=10)
    meal_type: Optional[MealTypeEnum] = None
    items: List[RecipeRecommendationItem] = Field(min_length=1, max_length=40)
    total_weight_g: float = Field(ge=0)
    total_kcal: float = Field(ge=0)
    total_protein_g: float = Field(ge=0)
    total_carbs_g: float = Field(ge=0)
    total_fat_g: float = Field(ge=0)
    instructions: List[str] = Field(default_factory=list, max_length=20)


class RecipeRecommendationsRequest(BaseModel):
    meal_type: Optional[MealTypeEnum] = None
    max_prep_time_min: Optional[int] = Field(default=None, ge=5, le=240)
    max_kcal_per_serving: Optional[int] = Field(default=None, ge=100, le=2000)
    tags: List[str] = Field(default_factory=list, max_length=10)
    count: int = Field(default=3, ge=1, le=5)
    additional_request: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Texto libre del usuario (ingredientes, estilo). No sustituye alergias ni prohibidos.",
    )


class RecipeRecommendationsResponse(BaseModel):
    recommendations: List[RecipeRecommendation] = Field(default_factory=list)


class CheckRestrictionsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


class FoodRestrictionConflict(BaseModel):
    mentioned_food: str = Field(..., max_length=200)
    matched_restriction: str = Field(..., max_length=200)
    restriction_type: Literal["allergy", "intolerance", "forbidden", "disliked"]
    explanation: str = Field(..., max_length=500)
    alternatives: List[str] = Field(default_factory=list, max_length=5)


class RecipeTextRestrictionCheckLLMResult(BaseModel):
    """JSON parseado del LLM (sin llm_unavailable; lo fija el servidor)."""

    has_conflicts: bool = False
    conflicts: List[FoodRestrictionConflict] = Field(default_factory=list)


class CheckRestrictionsResponse(BaseModel):
    has_conflicts: bool
    conflicts: List[FoodRestrictionConflict] = Field(default_factory=list)
    llm_unavailable: bool = False


class CustomFoodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kcal_per_100g: float = Field(ge=0, le=MAX_KCAL_PER_100G)
    protein_per_100g: float = Field(ge=0, le=MAX_PROTEIN_PER_100G)
    carbs_per_100g: float = Field(ge=0, le=MAX_CARBS_PER_100G)
    fat_per_100g: float = Field(ge=0, le=MAX_FAT_PER_100G)
    icon: Optional[str] = Field(default=None, max_length=32)


class CustomFoodResponse(BaseModel):
    id: UUID
    name: str
    kcal_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    icon: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
