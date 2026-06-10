from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from enum import Enum


class PlanFoodItem(BaseModel):
    name: str = Field(..., max_length=200)
    grams: float = Field(ge=0, le=5000)
    kcal: float = Field(ge=0, le=20000)
    protein_g: float = Field(ge=0, le=2000)
    carbs_g: float = Field(ge=0, le=2000)
    fat_g: float = Field(ge=0, le=2000)


class PlanMeal(BaseModel):
    id: Optional[UUID] = None
    meal_type: str
    title: str
    foods: List[PlanFoodItem]
    total_kcal: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float


class PlanDay(BaseModel):
    id: Optional[UUID] = None
    day_number: int
    day_label: str
    meals: List[PlanMeal]


class ReorderDayMealsRequest(BaseModel):
    meal_ids: List[UUID] = Field(..., min_length=1, max_length=8)


class DietPlanResponse(BaseModel):
    id: UUID
    version: int
    is_active: bool
    target_kcal: float
    target_protein_g: float
    target_carbs_g: float
    target_fat_g: float
    rationale: Optional[str] = None
    change_reason: Optional[str] = None
    caveats: List[str] = []
    days: List[PlanDay] = []
    created_at: datetime
    label: Optional[str] = None

    model_config = {"from_attributes": True}


class PatchPlanLabelRequest(BaseModel):
    """Nombre visible del plan; cadena vacía borra el nombre personalizado."""

    label: str = Field("", max_length=200)


class GeneratePlanRequest(BaseModel):
    additional_preferences: Optional[str] = Field(default=None, max_length=2000)
    force_regenerate: bool = False
    meals_per_day: Optional[int] = Field(None, ge=3, le=6, description="Si se envía, sustituye preferencia de perfil para esta generación")


class ManualPlanCreateRequest(BaseModel):
    """Plan vacío (7 días) para rellenar a mano; objetivos desde el perfil."""

    meals_per_day: Optional[int] = Field(
        None,
        ge=3,
        le=6,
        description="Comidas por día; si no se envía, se usa la preferencia del perfil (3–6).",
    )


class SwapFoodRequest(BaseModel):
    day_number: int = Field(ge=1, le=7)
    meal_type: str
    food_name: str
    reason: Optional[str] = None


class SubstitutePlanFoodRequest(BaseModel):
    food_index: int = Field(ge=0, description="Índice del alimento dentro de la comida (0 = primero)")
    reason: Optional[str] = Field(None, max_length=500)


class UpdateMealTitleRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class UpdatePlanFoodRequest(BaseModel):
    name: str = Field(..., max_length=200)
    grams: float = Field(ge=0, le=5000)
    kcal: float = Field(ge=0, le=20000)
    protein_g: float = Field(ge=0, le=2000)
    carbs_g: float = Field(ge=0, le=2000)
    fat_g: float = Field(ge=0, le=2000)


class RegenerateMealRequest(BaseModel):
    note: Optional[str] = Field(None, max_length=500)


class SwapFoodResponse(BaseModel):
    original_food: PlanFoodItem
    replacement_food: PlanFoodItem
    rationale: str


class ShoppingListItemResponse(BaseModel):
    id: Optional[UUID] = None
    food_name: str
    quantity: str
    category: Optional[str] = None
    checked: bool = False

    model_config = {"from_attributes": True}


class PatchShoppingListItemRequest(BaseModel):
    checked: bool


class ShoppingListResponse(BaseModel):
    id: UUID
    plan_id: Optional[UUID] = None
    name: str
    items: List[ShoppingListItemResponse]
    created_at: datetime

    model_config = {"from_attributes": True}
