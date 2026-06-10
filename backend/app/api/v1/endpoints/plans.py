import logging
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.public_errors import detail_500, detail_502
from app.core.rate_limit import limit_if_enabled
from app.core.security import get_current_user_id
from app.db.session import get_async_session_maker, get_db
from app.ai.diet_generator import generate_diet_plan
from app.rules.allergy_validation import validate_plan_restrictions
from app.services.plan_service import PlanService
from app.services.subscription_quota_service import SubscriptionQuotaService
from app.services.plan_meal_normalize import sanitize_food_display_name
from app.schemas.plan import (
    DietPlanResponse,
    GeneratePlanRequest,
    SwapFoodRequest,
    SwapFoodResponse,
    ShoppingListResponse,
    PatchShoppingListItemRequest,
    PatchPlanLabelRequest,
    PlanDay,
    PlanMeal,
    PlanFoodItem,
    SubstitutePlanFoodRequest,
    UpdateMealTitleRequest,
    UpdatePlanFoodRequest,
    RegenerateMealRequest,
    ReorderDayMealsRequest,
)

router = APIRouter(prefix="/plans", tags=["plans"])
logger = logging.getLogger(__name__)


def _rationale_preview(text: Optional[str], max_len: int = 140) -> Optional[str]:
    if not text or not str(text).strip():
        return None
    t = str(text).strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


@router.get("/current")
async def get_current_plan(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Sin plan activo → 200 y cuerpo JSON `null` (no 404: evita ruido en la consola del navegador)."""
    service = PlanService(db)
    plan = await service.get_current_plan(user_id)
    if not plan:
        return Response(content=b"null", media_type="application/json", status_code=200)
    return _plan_to_response(plan)


@router.get("/history")
async def get_plan_history(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    plans = await service.get_plan_history(user_id)
    return [
        {
            "id": str(p.id),
            "version": p.version,
            "is_active": p.is_active,
            "target_kcal": p.target_kcal,
            "target_protein_g": p.target_protein_g,
            "created_at": p.created_at.isoformat() if p.created_at else "",
            "rationale_preview": _rationale_preview(p.rationale),
            "label": getattr(p, "label", None),
        }
        for p in plans
    ]


@router.post("/generate", response_model=DietPlanResponse)
@limit_if_enabled("8/minute")
async def generate_plan(
    request: Request,
    data: GeneratePlanRequest,
    user_id: str = Depends(get_current_user_id),
):
    # Sesión corta para leer perfil; la IA puede tardar minutos y el pooler cierra conexiones idle
    # si se mantiene una sola sesión abierta (asyncpg: connection closed).
    factory = get_async_session_maker()
    try:
        async with factory() as db:
            try:
                await SubscriptionQuotaService(db).require_premium_for_plan_ai_generate(user_id)
                service = PlanService(db)
                ctx = await service.prepare_plan_generation_context(
                    user_id,
                    data.additional_preferences,
                    meals_per_day=data.meals_per_day,
                )
                await db.commit()
            except Exception:
                await db.rollback()
                raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    combined_allergies = list(ctx.allergies) + list(ctx.intolerances) + list(ctx.forbidden_foods)

    try:
        generated = await generate_diet_plan(
            target_kcal=ctx.target_kcal,
            target_protein_g=ctx.target_protein_g,
            target_carbs_g=ctx.target_carbs_g,
            target_fat_g=ctx.target_fat_g,
            goal_type=ctx.goal_type_str,
            meals_per_day=ctx.meals_per_day,
            preferences=ctx.preferences,
            disliked_foods=ctx.disliked_foods,
            allergies=combined_allergies,
            additional_preferences=ctx.additional_preferences,
            plan_profile=ctx.plan_profile,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error generando plan con IA: %s", e)
        raise HTTPException(status_code=500, detail=detail_500(e)) from e

    if not generated:
        logger.error(
            "Plan IA no generado o validación fallida: revisar GROQ_API_KEY / modelos / logs"
        )
        raise HTTPException(status_code=500, detail=detail_500(None))

    violations = validate_plan_restrictions(
        generated.days or [],
        ctx.allergies,
        ctx.intolerances,
        ctx.forbidden_foods,
    )
    if violations:
        logger.warning(
            "Plan generado contiene alimentos restringidos (%d violaciones): %s",
            len(violations),
            violations[:5],
        )
        violation_names = {v["food_name"] for v in violations}
        generated.caveats = list(generated.caveats or []) + [
            f"⚠️ Se detectaron alimentos incompatibles con tus restricciones ({', '.join(sorted(violation_names)[:5])}). "
            "Revisa el plan y usa el botón de sustitución en los alimentos marcados."
        ]

    try:
        async with factory() as db:
            try:
                service = PlanService(db)
                plan = await service.persist_generated_plan(user_id, ctx, generated)
                from app.services.badge_integration import fire_plan_generated

                await fire_plan_generated(db, user_id, plan.id)
                await db.commit()
            except Exception:
                await db.rollback()
                raise
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=detail_500(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error guardando plan generado: %s", e)
        raise HTTPException(status_code=500, detail=detail_500(e)) from e

    if not plan:
        raise HTTPException(status_code=500, detail="No se pudo generar el plan")
    return _plan_to_response(plan)


@router.post("/manual", response_model=DietPlanResponse)
async def create_manual_plan(
    meals_per_day: Optional[int] = Query(None, ge=3, le=6),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Plan semanal vacío (marcadores) usando objetivos del perfil."""
    service = PlanService(db)
    try:
        plan = await service.create_manual_skeleton_plan(user_id, meals_per_day)
        if plan:
            from app.services.badge_integration import fire_plan_generated

            await fire_plan_generated(db, user_id, plan.id)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        await db.rollback()
        raise
    if not plan:
        raise HTTPException(status_code=500, detail="No se pudo crear el plan manual")
    return _plan_to_response(plan)


@router.delete("/meals/{meal_id}/foods/{food_index}", response_model=DietPlanResponse)
async def remove_plan_food(
    meal_id: UUID,
    food_index: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    try:
        plan = await service.remove_plan_food(user_id, meal_id, food_index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not plan:
        raise HTTPException(status_code=404, detail="Sin plan activo")
    return _plan_to_response(plan)


@router.post("/meals/{meal_id}/substitute-food", response_model=DietPlanResponse)
async def substitute_plan_food(
    meal_id: UUID,
    data: SubstitutePlanFoodRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await SubscriptionQuotaService(db).require_premium_for_substitute_food(user_id)
    service = PlanService(db)
    try:
        plan = await service.substitute_plan_food(
            user_id, meal_id, data.food_index, data.reason
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=detail_502(e)) from e
    if not plan:
        raise HTTPException(status_code=404, detail="Sin plan activo")
    return _plan_to_response(plan)


@router.patch("/meals/{meal_id}", response_model=DietPlanResponse)
async def update_plan_meal_title(
    meal_id: UUID,
    data: UpdateMealTitleRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    try:
        plan = await service.update_plan_meal_title(user_id, meal_id, data.title)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not plan:
        raise HTTPException(status_code=404, detail="Sin plan activo")
    return _plan_to_response(plan)


@router.patch("/meals/{meal_id}/foods/{food_index}", response_model=DietPlanResponse)
async def update_plan_food(
    meal_id: UUID,
    food_index: int,
    data: UpdatePlanFoodRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if food_index < 0:
        raise HTTPException(status_code=400, detail="Índice no válido")
    service = PlanService(db)
    try:
        plan = await service.update_plan_food_item(
            user_id,
            meal_id,
            food_index,
            name=data.name,
            grams=data.grams,
            kcal=data.kcal,
            protein_g=data.protein_g,
            carbs_g=data.carbs_g,
            fat_g=data.fat_g,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not plan:
        raise HTTPException(status_code=404, detail="Sin plan activo")
    return _plan_to_response(plan)


@router.post("/meals/{meal_id}/foods", response_model=DietPlanResponse)
async def add_plan_food(
    meal_id: UUID,
    data: UpdatePlanFoodRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    try:
        plan = await service.add_plan_food_item(
            user_id,
            meal_id,
            name=data.name,
            grams=data.grams,
            kcal=data.kcal,
            protein_g=data.protein_g,
            carbs_g=data.carbs_g,
            fat_g=data.fat_g,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not plan:
        raise HTTPException(status_code=404, detail="Sin plan activo")
    return _plan_to_response(plan)


@router.post("/meals/{meal_id}/regenerate-meal", response_model=DietPlanResponse)
async def regenerate_plan_meal_ia(
    meal_id: UUID,
    data: RegenerateMealRequest = Body(default=RegenerateMealRequest()),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await SubscriptionQuotaService(db).require_plan_regen(user_id)
    service = PlanService(db)
    try:
        plan = await service.regenerate_plan_meal_with_ia(user_id, meal_id, data.note)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=detail_502(e)) from e
    if not plan:
        raise HTTPException(status_code=404, detail="Sin plan activo")
    return _plan_to_response(plan)


@router.post("/{plan_id}/activate", response_model=DietPlanResponse)
async def activate_plan(
    plan_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    try:
        plan = await service.activate_plan(user_id, plan_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not plan:
        raise HTTPException(status_code=404, detail="No se pudo activar el plan")
    return _plan_to_response(plan)


@router.post("/{plan_id}/duplicate", response_model=DietPlanResponse)
async def duplicate_plan(
    plan_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    try:
        plan = await service.duplicate_plan(user_id, plan_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=detail_500(e)) from e
    if not plan:
        raise HTTPException(status_code=500, detail="No se pudo duplicar el plan")
    return _plan_to_response(plan)


@router.patch("/{plan_id}/label", response_model=DietPlanResponse)
async def patch_plan_label(
    plan_id: UUID,
    data: PatchPlanLabelRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    plan = await service.update_plan_label(user_id, plan_id, data.label)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return _plan_to_response(plan)


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    deleted = await service.delete_plan(user_id, plan_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return Response(status_code=204)


@router.get("/{plan_id}", response_model=DietPlanResponse)
async def get_plan_by_id(
    plan_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    plan = await service.get_plan_by_id(user_id, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return _plan_to_response(plan)


@router.patch("/days/{day_id}/meals-order", response_model=DietPlanResponse)
async def reorder_day_meals(
    day_id: UUID,
    data: ReorderDayMealsRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    try:
        plan = await service.reorder_plan_day_meals(user_id, day_id, data.meal_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not plan:
        raise HTTPException(status_code=404, detail="Día no encontrado")
    return _plan_to_response(plan)


@router.get("/{plan_id}/shopping-list", response_model=ShoppingListResponse)
async def get_shopping_list(
    plan_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    shopping_list = await service.get_shopping_list(plan_id, user_id)
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Plan no encontrado o sin datos")
    return shopping_list


@router.patch("/{plan_id}/shopping-list/items/{item_id}", response_model=ShoppingListResponse)
async def patch_shopping_list_item(
    plan_id: UUID,
    item_id: UUID,
    data: PatchShoppingListItemRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = PlanService(db)
    updated = await service.patch_shopping_list_item_checked(
        plan_id, user_id, item_id, data.checked
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    return updated


def _plan_to_response(plan) -> DietPlanResponse:
    days = []
    for day in sorted(plan.days, key=lambda d: d.day_number):
        meals = []
        sorted_meals = sorted(
            day.meals,
            key=lambda m: (m.display_order, str(m.id)),
        )
        for meal in sorted_meals:
            foods = []
            for raw in meal.foods or []:
                fd = dict(raw) if isinstance(raw, dict) else {}
                fd["name"] = sanitize_food_display_name(fd.get("name"))
                foods.append(PlanFoodItem(**fd))
            meals.append(PlanMeal(
                id=meal.id,
                meal_type=meal.meal_type.value if hasattr(meal.meal_type, 'value') else meal.meal_type,
                title=meal.title,
                foods=foods,
                total_kcal=meal.total_kcal,
                total_protein_g=meal.total_protein_g,
                total_carbs_g=meal.total_carbs_g,
                total_fat_g=meal.total_fat_g,
            ))
        days.append(PlanDay(
            id=day.id,
            day_number=day.day_number,
            day_label=day.day_label or f"Día {day.day_number}",
            meals=meals,
        ))
    return DietPlanResponse(
        id=plan.id,
        version=plan.version,
        is_active=plan.is_active,
        target_kcal=plan.target_kcal,
        target_protein_g=plan.target_protein_g,
        target_carbs_g=plan.target_carbs_g,
        target_fat_g=plan.target_fat_g,
        rationale=plan.rationale,
        change_reason=plan.change_reason,
        caveats=plan.caveats or [],
        days=days,
        created_at=plan.created_at,
        label=getattr(plan, "label", None),
    )
