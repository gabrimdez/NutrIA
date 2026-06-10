from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rate_limit import limit_if_enabled
from app.core.safe_attr import safe_getattr as _safe_getattr
from app.core.user_settings import (
    normalize_app_settings,
    normalize_integration_preferences,
    normalize_integration_status,
    normalize_notification_preferences,
    normalize_plan_preferences,
)
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.repositories.profile_repo import ProfileRepository
from app.services.subscription_quota_service import SubscriptionQuotaService
from app.rules.nutrition_rules import (
    calculate_bmr,
    calculate_tdee,
    calculate_target_calories,
    adjust_target_calories_for_overweight_deficit,
    calculate_macros,
    calculate_steps_target,
)
from app.schemas.profile import (
    ProfileResponse,
    ProfileUpdate,
    SubscriptionUsageSnapshot,
    DailyTargetResponse,
    DailyTargetUpdate,
    ActiveGoalResponse,
    ActivityLevelUpdate,
    GoalRecalculateRequest,
    GoalWeightsUpdate,
    FoodRestrictionsUpdate,
    FoodRestrictionsResponse,
    InjuriesUpdate,
    InjuriesResponse,
)
from app.schemas.injury_profile import injury_profile_from_dict
from app.schemas.settings import AppSettingsResponse, AppSettingsUpdate

router = APIRouter(prefix="/me", tags=["profile"])


def _enum_field_str(value) -> str:
    if value is None:
        return ""
    return value.value if hasattr(value, "value") else str(value)


async def _recalculate_targets_for_user(
    repo: ProfileRepository,
    user_id: str,
    profile,
    goal,
):
    """Recalcula y persiste el DailyTarget activo a partir del perfil y el objetivo actual."""
    sex_str = profile.sex.value if profile.sex else "male"
    age = date.today().year - (profile.birth_year or 1990)
    weight = float(profile.current_weight_kg or 70)
    height = float(profile.height_cm or 170)
    activity_str = _enum_field_str(goal.activity_level) or "moderate"
    goal_type_str = _enum_field_str(goal.goal_type) or "maintain"

    bmr = calculate_bmr(sex_str, weight, height, age)
    tdee = calculate_tdee(bmr, activity_str)
    raw_target = calculate_target_calories(tdee, goal_type_str)
    target_kcal = adjust_target_calories_for_overweight_deficit(
        raw_target,
        float(tdee),
        float(bmr),
        weight,
        height,
        goal_type_str,
    )
    macros = calculate_macros(
        target_kcal,
        weight,
        goal_type_str,
        activity_level=activity_str,
        training_days_per_week=goal.training_days_per_week,
    )
    steps = calculate_steps_target(activity_str, goal_type_str)
    return await repo.update_active_target(
        user_id,
        calories_kcal=target_kcal,
        protein_g=macros["protein_g"],
        carbs_g=macros["carbs_g"],
        fat_g=macros["fat_g"],
        steps_target=steps,
    )


def _settings_response(pref) -> AppSettingsResponse:
    normalized = normalize_app_settings(
        plan_preferences=_safe_getattr(pref, "plan_preferences"),
        notification_preferences=_safe_getattr(pref, "notification_preferences"),
        integration_preferences=_safe_getattr(pref, "integration_preferences"),
        integration_status=_safe_getattr(pref, "integration_status"),
    )
    return AppSettingsResponse(**normalized)


@router.get("/profile", response_model=ProfileResponse)
@limit_if_enabled("120/minute")
async def get_profile(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    base = ProfileResponse.model_validate(profile)
    quota = SubscriptionQuotaService(db)
    premium, _ = await quota.premium_status(user_id, profile=profile)
    snap = await quota.build_usage_snapshot(user_id, premium=premium)
    usage = SubscriptionUsageSnapshot(**snap) if snap is not None else None
    return base.model_copy(
        update={
            "subscription_tier": "premium" if premium else (getattr(profile, "subscription_tier", None) or "free"),
            "usage": usage,
        }
    )


@router.put("/profile", response_model=ProfileResponse)
@limit_if_enabled("120/minute")
async def update_profile(
    request: Request,
    data: ProfileUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = await repo.update_profile(user_id, **data.model_dump(exclude_unset=True))
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    base = ProfileResponse.model_validate(profile)
    quota = SubscriptionQuotaService(db)
    premium, _ = await quota.premium_status(user_id, profile=profile)
    snap = await quota.build_usage_snapshot(user_id, premium=premium)
    usage = SubscriptionUsageSnapshot(**snap) if snap is not None else None
    return base.model_copy(
        update={
            "subscription_tier": "premium" if premium else (getattr(profile, "subscription_tier", None) or "free"),
            "usage": usage,
        }
    )


@router.get("/settings", response_model=AppSettingsResponse)
@limit_if_enabled("120/minute")
async def get_settings(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    pref = await repo.get_preferences(profile.id)
    return _settings_response(pref)


@router.put("/settings", response_model=AppSettingsResponse)
@limit_if_enabled("120/minute")
async def update_settings(
    request: Request,
    data: AppSettingsUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    existing = await repo.get_preferences(profile.id)
    current = normalize_app_settings(
        plan_preferences=_safe_getattr(existing, "plan_preferences"),
        notification_preferences=_safe_getattr(existing, "notification_preferences"),
        integration_preferences=_safe_getattr(existing, "integration_preferences"),
        integration_status=_safe_getattr(existing, "integration_status"),
    )

    next_plan = current["plan_preferences"]
    if data.plan_preferences is not None:
        next_plan = normalize_plan_preferences(
            {
                **next_plan,
                **data.plan_preferences.model_dump(exclude_unset=True),
            }
        )

    next_notifications = current["notification_preferences"]
    if data.notification_preferences is not None:
        dump = data.notification_preferences.model_dump(exclude_unset=True)
        merged = {**next_notifications, **dump}
        mt_patch = dump.get("meal_reminder_times")
        if isinstance(mt_patch, dict):
            base_times = next_notifications.get("meal_reminder_times")
            if isinstance(base_times, dict):
                merged["meal_reminder_times"] = {**base_times, **mt_patch}
        next_notifications = normalize_notification_preferences(merged)

    next_integrations = current["integration_preferences"]
    if data.integration_preferences is not None:
        next_integrations = normalize_integration_preferences(
            {
                **next_integrations,
                **data.integration_preferences.model_dump(exclude_unset=True),
            }
        )

    next_status = current["integration_status"]
    if data.integration_status is not None:
        next_status = normalize_integration_status(
            {
                **next_status,
                **data.integration_status.model_dump(exclude_unset=True),
            }
        )

    pref = await repo.upsert_preferences(
        profile.id,
        plan_preferences=next_plan,
        notification_preferences=next_notifications,
        integration_preferences=next_integrations,
        integration_status=next_status,
    )
    await db.commit()
    return _settings_response(pref)


@router.get("/goal", response_model=ActiveGoalResponse)
@limit_if_enabled("120/minute")
async def get_active_goal(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    goal = await repo.get_active_goal_by_user_id(user_id)
    if not goal:
        raise HTTPException(status_code=404, detail="No hay objetivo activo. Completa el onboarding primero.")
    return goal


@router.put("/goal/weights", response_model=ActiveGoalResponse)
@limit_if_enabled("120/minute")
async def update_goal_weights(
    request: Request,
    data: GoalWeightsUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    goal = await repo.get_active_goal_by_user_id(user_id)
    if not goal:
        raise HTTPException(
            status_code=404,
            detail="No hay objetivo activo. Completa el onboarding primero.",
        )
    goal.target_weight_kg = data.target_weight_kg
    await db.flush()
    await db.commit()
    from app.services.badge_integration import fire_active_goal_confirmed

    await fire_active_goal_confirmed(db, user_id)
    return goal


@router.put("/goal/activity-level", response_model=ActiveGoalResponse)
@limit_if_enabled("120/minute")
async def update_activity_level(
    request: Request,
    data: ActivityLevelUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    goal = await repo.update_active_goal(user_id, activity_level=data.activity_level)
    if not goal:
        raise HTTPException(
            status_code=404,
            detail="No hay objetivo activo. Completa el onboarding primero.",
        )
    profile = await repo.get_by_user_id(user_id)
    if profile:
        await _recalculate_targets_for_user(repo, user_id, profile, goal)
    await db.commit()
    from app.services.badge_integration import fire_active_goal_confirmed

    await fire_active_goal_confirmed(db, user_id)
    return goal


@router.put("/goal/recalculate", response_model=DailyTargetResponse)
@limit_if_enabled("30/minute")
async def recalculate_goal(
    request: Request,
    data: GoalRecalculateRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    goal = await repo.get_active_goal_by_user_id(user_id)
    if not goal:
        raise HTTPException(
            status_code=404,
            detail="No hay objetivo activo. Completa el onboarding primero.",
        )

    goal_changed = False
    if data.goal_type and data.goal_type != goal.goal_type:
        goal.goal_type = data.goal_type
        goal_changed = True
    if data.activity_level and data.activity_level != goal.activity_level:
        goal.activity_level = data.activity_level
        goal_changed = True

    if goal_changed:
        await db.flush()

    target = await _recalculate_targets_for_user(repo, user_id, profile, goal)
    if not target:
        raise HTTPException(status_code=404, detail="No hay objetivos activos.")

    await db.commit()
    from app.services.badge_integration import fire_active_goal_confirmed

    await fire_active_goal_confirmed(db, user_id)
    return target


@router.get("/food-restrictions", response_model=FoodRestrictionsResponse)
@limit_if_enabled("120/minute")
async def get_food_restrictions(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    pref = await repo.get_preferences(profile.id)
    return FoodRestrictionsResponse(
        allergies=_safe_getattr(pref, "allergies") or [],
        intolerances=_safe_getattr(pref, "intolerances") or [],
        forbidden_foods=_safe_getattr(pref, "forbidden_foods") or [],
        disliked_foods=_safe_getattr(pref, "disliked_foods") or [],
        dietary_preferences=_safe_getattr(pref, "dietary_preferences") or [],
    )


@router.put("/food-restrictions", response_model=FoodRestrictionsResponse)
@limit_if_enabled("120/minute")
async def update_food_restrictions(
    request: Request,
    data: FoodRestrictionsUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    kwargs = {}
    if data.dietary_preferences is not None:
        kwargs["dietary_preferences"] = data.dietary_preferences
    if data.allergies is not None:
        kwargs["allergies"] = data.allergies
    if data.intolerances is not None:
        kwargs["intolerances"] = data.intolerances
    if data.forbidden_foods is not None:
        kwargs["forbidden_foods"] = data.forbidden_foods
    if data.disliked_foods is not None:
        kwargs["disliked_foods"] = data.disliked_foods

    pref = await repo.upsert_preferences(profile.id, **kwargs)
    await db.commit()
    return FoodRestrictionsResponse(
        allergies=_safe_getattr(pref, "allergies") or [],
        intolerances=_safe_getattr(pref, "intolerances") or [],
        forbidden_foods=_safe_getattr(pref, "forbidden_foods") or [],
        disliked_foods=_safe_getattr(pref, "disliked_foods") or [],
        dietary_preferences=_safe_getattr(pref, "dietary_preferences") or [],
    )


@router.get("/injuries", response_model=InjuriesResponse)
@limit_if_enabled("120/minute")
async def get_injuries(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    pref = await repo.get_preferences(profile.id)
    raw = _safe_getattr(pref, "active_injuries") or []
    items = []
    for r in raw:
        if isinstance(r, dict):
            parsed = injury_profile_from_dict(r)
            if parsed:
                items.append(parsed)
    return InjuriesResponse(active_injuries=items)


@router.put("/injuries", response_model=InjuriesResponse)
@limit_if_enabled("120/minute")
async def update_injuries(
    request: Request,
    data: InjuriesUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    serialized = [item.model_dump(by_alias=True, mode="json") for item in data.active_injuries]
    await repo.upsert_preferences(profile.id, active_injuries=serialized)
    await db.commit()
    return InjuriesResponse(active_injuries=data.active_injuries)


@router.get("/targets", response_model=DailyTargetResponse)
@limit_if_enabled("120/minute")
async def get_targets(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    target = await repo.get_active_target(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="No hay objetivos configurados")
    return target


@router.put("/targets", response_model=DailyTargetResponse)
@limit_if_enabled("120/minute")
async def update_targets(
    request: Request,
    data: DailyTargetUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    target = await repo.update_active_target(
        user_id,
        calories_kcal=data.calories_kcal,
        protein_g=data.protein_g,
        carbs_g=data.carbs_g,
        fat_g=data.fat_g,
        steps_target=data.steps_target,
    )
    if not target:
        raise HTTPException(
            status_code=404,
            detail="No hay objetivos activos. Completa el onboarding primero.",
        )
    await db.commit()
    return target
