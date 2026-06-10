from typing import List, Optional
from uuid import UUID
from sqlalchemy import select, update, func, delete as sql_delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.models import (
    DietPlan,
    DietPlanDay,
    DietPlanMeal,
    ShoppingList,
    ShoppingListItem,
)


class PlanRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_plan(self, user_id: str, plan_data: dict, days_data: list) -> DietPlan:
        plan: Optional[DietPlan] = None
        for _ in range(16):
            mv = await self.db.execute(
                select(func.max(DietPlan.version)).where(DietPlan.user_id == user_id)
            )
            next_v = (mv.scalar() or 0) + 1
            try:
                async with self.db.begin_nested():
                    plan = DietPlan(
                        user_id=user_id,
                        version=next_v,
                        is_active=False,
                        **plan_data,
                    )
                    self.db.add(plan)
                    await self.db.flush()
                break
            except IntegrityError:
                continue
        if plan is None:
            raise RuntimeError(
                "No se pudo crear el plan: conflicto de versión tras reintentos (concurrencia)."
            )

        for day_data in days_data:
            meals = day_data.pop("meals", [])
            day = DietPlanDay(plan_id=plan.id, **day_data)
            self.db.add(day)
            await self.db.flush()

            for idx, meal_data in enumerate(meals):
                row = dict(meal_data)
                row["display_order"] = idx
                meal = DietPlanMeal(day_id=day.id, **row)
                self.db.add(meal)

        await self.db.flush()
        return plan

    async def duplicate_plan(self, user_id: str, source: DietPlan) -> DietPlan:
        """Crea una nueva versión inactiva clonando días/comidas del plan origen."""
        plan: Optional[DietPlan] = None
        for _ in range(16):
            mv = await self.db.execute(
                select(func.max(DietPlan.version)).where(DietPlan.user_id == user_id)
            )
            next_v = (mv.scalar() or 0) + 1
            try:
                async with self.db.begin_nested():
                    plan = DietPlan(
                        user_id=user_id,
                        version=next_v,
                        is_active=False,
                        target_kcal=source.target_kcal,
                        target_protein_g=source.target_protein_g,
                        target_carbs_g=source.target_carbs_g,
                        target_fat_g=source.target_fat_g,
                        rationale=source.rationale,
                        change_reason=f"Copia de v{source.version}",
                        caveats=list(source.caveats or []),
                        label=getattr(source, "label", None),
                    )
                    self.db.add(plan)
                    await self.db.flush()
                break
            except IntegrityError:
                continue
        if plan is None:
            raise RuntimeError(
                "No se pudo duplicar el plan: conflicto de versión tras reintentos (concurrencia)."
            )

        for src_day in sorted(source.days or [], key=lambda d: d.day_number):
            day = DietPlanDay(
                plan_id=plan.id,
                day_number=src_day.day_number,
                day_label=src_day.day_label,
            )
            self.db.add(day)
            await self.db.flush()

            sorted_meals = sorted(
                src_day.meals or [],
                key=lambda m: (m.display_order, str(m.id)),
            )
            for idx, src_meal in enumerate(sorted_meals):
                meal = DietPlanMeal(
                    day_id=day.id,
                    display_order=idx,
                    meal_type=src_meal.meal_type,
                    title=src_meal.title,
                    foods=[dict(f) if isinstance(f, dict) else f for f in (src_meal.foods or [])],
                    total_kcal=src_meal.total_kcal,
                    total_protein_g=src_meal.total_protein_g,
                    total_carbs_g=src_meal.total_carbs_g,
                    total_fat_g=src_meal.total_fat_g,
                )
                self.db.add(meal)

        await self.db.flush()
        return plan

    async def get_active_plan(self, user_id: str) -> Optional[DietPlan]:
        stmt = (
            select(DietPlan)
            .options(
                selectinload(DietPlan.days).selectinload(DietPlanDay.meals)
            )
            .where(DietPlan.user_id == user_id, DietPlan.is_active == True)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_plan_for_user(self, plan_id: UUID, user_id: str) -> Optional[DietPlan]:
        stmt = (
            select(DietPlan)
            .options(selectinload(DietPlan.days).selectinload(DietPlanDay.meals))
            .where(DietPlan.id == plan_id, DietPlan.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_plan_history(self, user_id: str, limit: int = 50) -> List[DietPlan]:
        stmt = (
            select(DietPlan)
            .where(DietPlan.user_id == user_id)
            .order_by(DietPlan.version.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_plan_label(self, plan_id: UUID, user_id: str, label: Optional[str]) -> bool:
        plan = await self.get_plan_for_user(plan_id, user_id)
        if not plan:
            return False
        plan.label = label
        await self.db.flush()
        return True

    async def set_active_plan(self, user_id: str, plan_id: UUID) -> None:
        await self.db.execute(
            update(DietPlan).where(DietPlan.user_id == user_id).values(is_active=False)
        )
        await self.db.execute(
            update(DietPlan)
            .where(DietPlan.id == plan_id, DietPlan.user_id == user_id)
            .values(is_active=True)
        )
        await self.db.flush()

    async def delete_plan_for_user(self, user_id: str, plan_id: UUID) -> bool:
        plan = await self.get_plan_for_user(plan_id, user_id)
        if not plan:
            return False
        was_active = bool(plan.is_active)

        await self.db.execute(
            sql_delete(ShoppingList).where(
                ShoppingList.plan_id == plan_id,
                ShoppingList.user_id == user_id,
            )
        )
        await self.db.delete(plan)
        await self.db.flush()

        if was_active:
            stmt = (
                select(DietPlan)
                .where(DietPlan.user_id == user_id)
                .order_by(DietPlan.version.desc())
                .limit(1)
            )
            r = await self.db.execute(stmt)
            nxt = r.scalar_one_or_none()
            if nxt:
                nxt.is_active = True
                await self.db.flush()

        return True

    async def get_plan_meal_for_user(self, meal_id: UUID, user_id: str) -> Optional[DietPlanMeal]:
        stmt = (
            select(DietPlanMeal)
            .join(DietPlanDay, DietPlanMeal.day_id == DietPlanDay.id)
            .join(DietPlan, DietPlanDay.plan_id == DietPlan.id)
            .where(DietPlanMeal.id == meal_id, DietPlan.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_plan_id_for_meal(self, meal_id: UUID, user_id: str) -> Optional[UUID]:
        """plan_id del plan que contiene la comida (activo o no)."""
        stmt = (
            select(DietPlanDay.plan_id)
            .join(DietPlanMeal, DietPlanMeal.day_id == DietPlanDay.id)
            .join(DietPlan, DietPlan.id == DietPlanDay.plan_id)
            .where(DietPlanMeal.id == meal_id, DietPlan.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_plan_meal_with_day_and_plan(
        self, meal_id: UUID, user_id: str
    ) -> Optional[DietPlanMeal]:
        """Comida con day.meals y day.plan cargados (contexto para regenerar una comida)."""
        stmt = (
            select(DietPlanMeal)
            .options(
                selectinload(DietPlanMeal.day).selectinload(DietPlanDay.meals),
                selectinload(DietPlanMeal.day).selectinload(DietPlanDay.plan),
            )
            .join(DietPlanDay, DietPlanMeal.day_id == DietPlanDay.id)
            .join(DietPlan, DietPlanDay.plan_id == DietPlan.id)
            .where(DietPlanMeal.id == meal_id, DietPlan.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_plan_meal(self, meal_id: UUID, **kwargs) -> Optional[DietPlanMeal]:
        stmt = select(DietPlanMeal).where(DietPlanMeal.id == meal_id)
        result = await self.db.execute(stmt)
        meal = result.scalar_one_or_none()
        if meal:
            for k, v in kwargs.items():
                if v is not None:
                    setattr(meal, k, v)
            await self.db.flush()
        return meal

    async def create_shopping_list(self, user_id: str, plan_id: Optional[UUID],
                                    items: list) -> ShoppingList:
        shopping_list = ShoppingList(user_id=user_id, plan_id=plan_id)
        self.db.add(shopping_list)
        await self.db.flush()

        for item_data in items:
            item = ShoppingListItem(shopping_list_id=shopping_list.id, **item_data)
            self.db.add(item)

        await self.db.flush()
        return shopping_list

    async def get_shopping_list(self, plan_id: UUID) -> Optional[ShoppingList]:
        stmt = (
            select(ShoppingList)
            .options(selectinload(ShoppingList.items))
            .where(ShoppingList.plan_id == plan_id)
            .order_by(ShoppingList.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def set_day_meals_order(
        self, day_id: UUID, user_id: str, ordered_meal_ids: List[UUID]
    ) -> Optional[UUID]:
        stmt = (
            select(DietPlanDay)
            .join(DietPlan, DietPlanDay.plan_id == DietPlan.id)
            .options(selectinload(DietPlanDay.meals))
            .where(DietPlanDay.id == day_id, DietPlan.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        day = result.scalar_one_or_none()
        if not day or not day.meals:
            return None
        existing = {m.id for m in day.meals}
        if set(ordered_meal_ids) != existing or len(ordered_meal_ids) != len(existing):
            raise ValueError("La lista de comidas no coincide con este día")
        for idx, mid in enumerate(ordered_meal_ids):
            await self.db.execute(
                update(DietPlanMeal).where(DietPlanMeal.id == mid).values(display_order=idx)
            )
        await self.db.flush()
        return day.plan_id

    async def update_shopping_list_item_checked(
        self,
        user_id: str,
        plan_id: UUID,
        item_id: UUID,
        checked: bool,
    ) -> tuple[bool, bool]:
        """Devuelve (actualizado, pasó_a_checked): pasó_a_checked solo si antes False y ahora True."""
        stmt = (
            select(ShoppingListItem)
            .join(ShoppingList, ShoppingListItem.shopping_list_id == ShoppingList.id)
            .where(
                ShoppingListItem.id == item_id,
                ShoppingList.plan_id == plan_id,
                ShoppingList.user_id == user_id,
            )
        )
        result = await self.db.execute(stmt)
        row = result.scalar_one_or_none()
        if not row:
            return False, False
        was = bool(row.checked)
        row.checked = checked
        await self.db.flush()
        became_checked = bool(checked) and not was
        return True, became_checked
