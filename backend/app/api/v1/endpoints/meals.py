from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rate_limit import limit_if_enabled
from app.core.safe_attr import safe_getattr
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.services.meal_service import MealService
from app.services.subscription_quota_service import SubscriptionQuotaService
from app.services.recipe_recommendation import recommend_recipes
from app.repositories.profile_repo import ProfileRepository
from app.schemas.meal import (
    CheckRestrictionsRequest,
    CheckRestrictionsResponse,
    CustomFoodCreate,
    CustomFoodResponse,
    MealConfirmRequest,
    MealEntryResponse,
    MealItemEatenUpdate,
    MealUpdateRequest,
    ParseTextMealRequest,
    RecipeCreate,
    RecipeRecommendationsRequest,
    RecipeRecommendationsResponse,
    RecipeResponse,
    SavedMealCreate,
    SavedMealResponse,
)
from app.repositories.meal_repo import MealRepository
from app.schemas.food import PhotoAnalysisResponse
from app.services.badge_integration import fire_recipe_logged, fire_text_entry_meal
from app.services.recipe_recommendation_service import RecipeRecommendationService
from app.services.restriction_check_service import check_text_against_restrictions

router = APIRouter(prefix="/meals", tags=["meals"])


# ── Fixed-path endpoints first (before /{meal_id} to avoid route conflict) ──

@router.post("/confirm", response_model=MealEntryResponse)
@limit_if_enabled("60/minute")
async def confirm_meal(
    request: Request,
    data: MealConfirmRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = MealService(db)
    entry = await service.confirm_meal(user_id, data)
    return entry


@router.post("/parse-text", response_model=PhotoAnalysisResponse)
@limit_if_enabled("30/minute")
async def parse_text_meal(
    request: Request,
    data: ParseTextMealRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    quota = SubscriptionQuotaService(db)
    await quota.require_chat_turn(user_id)
    service = MealService(db)
    result = await service.parse_text_meal(data.text)
    if not result:
        raise HTTPException(status_code=422, detail="No se pudo interpretar la descripción de comida.")
    await quota.record_parse_text_success(user_id)
    await fire_text_entry_meal(db, user_id, data.text)
    return result


# ── Saved meals ──

@router.post("/saved", response_model=SavedMealResponse)
@limit_if_enabled("120/minute")
async def create_saved_meal(
    request: Request,
    data: SavedMealCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = MealService(db)
    saved = await service.create_saved_meal(user_id, data.name, data.items)
    return saved


@router.get("/saved", response_model=list[SavedMealResponse])
@limit_if_enabled("120/minute")
async def get_saved_meals(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = MealService(db)
    return await service.get_saved_meals(user_id)


@router.delete("/saved/{saved_meal_id}")
@limit_if_enabled("120/minute")
async def delete_saved_meal(
    request: Request,
    saved_meal_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = MealService(db)
    deleted = await service.delete_saved_meal(saved_meal_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Comida guardada no encontrada")
    return {"detail": "Comida guardada eliminada"}


# ── Custom foods ──

@router.post("/custom-foods", response_model=CustomFoodResponse)
@limit_if_enabled("60/minute")
async def create_custom_food(
    request: Request,
    data: CustomFoodCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = MealRepository(db)
    food = await repo.create_custom_food(
        user_id, data.name, data.kcal_per_100g,
        data.protein_per_100g, data.carbs_per_100g, data.fat_per_100g,
        icon=data.icon,
    )
    return food


@router.get("/custom-foods", response_model=list[CustomFoodResponse])
@limit_if_enabled("120/minute")
async def get_custom_foods(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = MealRepository(db)
    return await repo.get_custom_foods(user_id)


@router.put("/custom-foods/{food_id}", response_model=CustomFoodResponse)
@limit_if_enabled("120/minute")
async def update_custom_food(
    request: Request,
    food_id: UUID,
    data: CustomFoodCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = MealRepository(db)
    food = await repo.update_custom_food(
        food_id, user_id, data.name, data.kcal_per_100g,
        data.protein_per_100g, data.carbs_per_100g, data.fat_per_100g,
        icon=data.icon,
    )
    if not food:
        raise HTTPException(status_code=404, detail="Alimento no encontrado")
    return food


@router.delete("/custom-foods/{food_id}")
@limit_if_enabled("120/minute")
async def delete_custom_food(
    request: Request,
    food_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = MealRepository(db)
    deleted = await repo.delete_custom_food(food_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Alimento no encontrado")
    return {"detail": "Alimento eliminado"}


# ── Recipes ──

@router.post("/recipes", response_model=RecipeResponse)
@limit_if_enabled("60/minute")
async def create_recipe(
    request: Request,
    data: RecipeCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = MealRepository(db)
    items = [i.model_dump() for i in data.items]
    recipe = await repo.create_recipe(
        user_id, data.name, items,
        servings=data.servings, description=data.description, icon=data.icon,
    )
    await fire_recipe_logged(db, user_id, recipe.id)
    return recipe


@router.get("/recipes/recommended")
@limit_if_enabled("120/minute")
async def get_recommended_recipes(
    request: Request,
    meal_type: Optional[str] = Query(None, pattern=r"^(breakfast|lunch|dinner|snack)$"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    meal_repo = MealRepository(db)
    profile_repo = ProfileRepository(db)
    recipes = await meal_repo.get_recipes(user_id)
    if not recipes:
        return []

    profile = await profile_repo.get_by_user_id(user_id)
    if not profile:
        return []

    prefs = await profile_repo.get_preferences(profile.id)
    target = await profile_repo.get_active_target(user_id)

    target_kcal = float(target.calories_kcal) if target else 2000
    target_protein = float(target.protein_g) if target else 120
    mpd = safe_getattr(prefs, "preferred_meals_per_day") or 4

    allergies = safe_getattr(prefs, "allergies") or []
    intolerances = safe_getattr(prefs, "intolerances") or []
    forbidden = safe_getattr(prefs, "forbidden_foods") or []

    return recommend_recipes(
        recipes=recipes,
        target_kcal=target_kcal,
        target_protein_g=target_protein,
        meals_per_day=mpd,
        allergies=allergies,
        intolerances=intolerances,
        forbidden_foods=forbidden,
        meal_type_hint=meal_type,
    )


@router.get("/recipes", response_model=list[RecipeResponse])
@limit_if_enabled("120/minute")
async def get_recipes(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = MealRepository(db)
    return await repo.get_recipes(user_id)


@router.post("/recipes/check-restrictions", response_model=CheckRestrictionsResponse)
@limit_if_enabled("30/minute")
async def check_recipe_text_restrictions(
    request: Request,
    body: CheckRestrictionsRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await check_text_against_restrictions(db, user_id, body.text)


@router.post("/recipes/recommendations", response_model=RecipeRecommendationsResponse)
@limit_if_enabled("20/minute")
async def generate_recipe_recommendations(
    request: Request,
    data: RecipeRecommendationsRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    quota = SubscriptionQuotaService(db)
    await quota.require_recipe_recommendation_turn(user_id)
    service = RecipeRecommendationService(db)
    try:
        result = await service.generate_recommendations(user_id, data)
    except RuntimeError as e:
        if str(e) == "groq_not_configured":
            raise HTTPException(
                status_code=503,
                detail="Las recomendaciones con IA no están disponibles en este momento.",
            )
        raise
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="No se pudieron generar recomendaciones. Inténtalo de nuevo en unos segundos.",
        )
    if not result.recommendations:
        raise HTTPException(
            status_code=422,
            detail="No se generaron recomendaciones válidas. Ajusta los filtros e inténtalo de nuevo.",
        )
    await quota.record_recipe_recommendation_success(user_id)
    return result


@router.get("/recipes/{recipe_id}", response_model=RecipeResponse)
@limit_if_enabled("120/minute")
async def get_recipe(
    request: Request,
    recipe_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = MealRepository(db)
    recipe = await repo.get_recipe_by_id(recipe_id, user_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return recipe


@router.put("/recipes/{recipe_id}", response_model=RecipeResponse)
@limit_if_enabled("120/minute")
async def update_recipe(
    request: Request,
    recipe_id: UUID,
    data: RecipeCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = MealRepository(db)
    items = [i.model_dump() for i in data.items]
    recipe = await repo.update_recipe(
        recipe_id, user_id, data.name, items,
        servings=data.servings, description=data.description, icon=data.icon,
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return recipe


@router.delete("/recipes/{recipe_id}")
@limit_if_enabled("120/minute")
async def delete_recipe(
    request: Request,
    recipe_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = MealRepository(db)
    deleted = await repo.delete_recipe(recipe_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return {"detail": "Receta eliminada"}


# ── Dynamic /{meal_id} endpoints LAST ──

@router.patch("/{meal_id}/items/{item_id}", response_model=MealEntryResponse)
@limit_if_enabled("120/minute")
async def patch_meal_item_eaten(
    request: Request,
    meal_id: UUID,
    item_id: UUID,
    data: MealItemEatenUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = MealService(db)
    entry = await service.set_meal_item_eaten(meal_id, item_id, user_id, data.eaten)
    if not entry:
        raise HTTPException(status_code=404, detail="Comida o alimento no encontrado")
    return entry


@router.patch("/{meal_id}", response_model=MealEntryResponse)
@limit_if_enabled("120/minute")
async def update_meal(
    request: Request,
    meal_id: UUID,
    data: MealUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = MealService(db)
    entry = await service.update_meal(
        meal_id, user_id,
        title=data.title,
        meal_type=data.meal_type,
        items=data.items,
        notes=data.notes,
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Comida no encontrada")
    return entry


@router.delete("/{meal_id}")
@limit_if_enabled("120/minute")
async def delete_meal(
    request: Request,
    meal_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = MealService(db)
    await service.delete_meal(meal_id, user_id)
    return {"detail": "Comida eliminada"}


@router.get("/{meal_id}", response_model=MealEntryResponse)
@limit_if_enabled("120/minute")
async def get_meal(
    request: Request,
    meal_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = MealService(db)
    entry = await service.get_meal(meal_id, user_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Comida no encontrada")
    return entry
