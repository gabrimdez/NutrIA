from collections.abc import Callable
from typing import List, Optional, Union
from uuid import UUID
from datetime import date, datetime
from sqlalchemy import select, delete, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.models import (
    FoodCatalog,
    MealEntry,
    MealEntryItem,
    SavedMeal,
    SavedMealItem,
    CustomFood,
    Recipe,
    RecipeItem,
)


def _item_counts_toward_day(item: Union[dict, MealEntryItem]) -> bool:
    if isinstance(item, dict):
        v = item.get("eaten", True)
        return True if v is None else bool(v)
    return bool(getattr(item, "eaten", True))


def _totals_from_items(items: list) -> tuple[float, float, float, float]:
    tk, tp, tc, tf = 0.0, 0.0, 0.0, 0.0
    for i in items:
        if not _item_counts_toward_day(i):
            continue
        if isinstance(i, dict):
            tk += float(i.get("kcal", 0) or 0)
            tp += float(i.get("protein_g", 0) or 0)
            tc += float(i.get("carbs_g", 0) or 0)
            tf += float(i.get("fat_g", 0) or 0)
        else:
            tk += float(i.kcal or 0)
            tp += float(i.protein_g or 0)
            tc += float(i.carbs_g or 0)
            tf += float(i.fat_g or 0)
    return tk, tp, tc, tf


def _apply_totals_to_entry(entry: MealEntry, items: list) -> None:
    tk, tp, tc, tf = _totals_from_items(items)
    entry.total_kcal = tk
    entry.total_protein_g = tp
    entry.total_carbs_g = tc
    entry.total_fat_g = tf


def _is_created_before_streak_deadline(
    created_at: datetime | None,
    meal_date: date,
    *,
    streak_deadline_fn: Callable[[date], datetime],
) -> bool:
    if created_at is None:
        return False
    deadline = streak_deadline_fn(meal_date)
    if created_at.tzinfo is not None and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=created_at.tzinfo)
    elif created_at.tzinfo is None and deadline.tzinfo is not None:
        created_at = created_at.replace(tzinfo=deadline.tzinfo)
    return created_at <= deadline


class MealRepository:
    """Comidas y recetas por usuario. Todas las rutas de acceso deben incluir ``user_id``
    del token; no usar IDs de usuario desde el cuerpo de la petición como fuente de verdad."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _coerce_food_catalog_fk_in_items(self, items: list) -> None:
        """
        Pone food_catalog_id a None si el UUID no existe en food_catalog.
        Los resultados de búsqueda (p. ej. fatsecret) llevan id propio y fallan el FK
        al guardar comidas favoritas o ítems con referencia a catálogo local.
        """
        if not items:
            return
        to_check: list[UUID] = []
        for item_data in items:
            fid = item_data.get("food_catalog_id")
            if fid is None:
                continue
            try:
                to_check.append(fid if isinstance(fid, UUID) else UUID(str(fid)))
            except (ValueError, TypeError):
                item_data["food_catalog_id"] = None
        if not to_check:
            return
        unique = list({*to_check})
        stmt = select(FoodCatalog.id).where(FoodCatalog.id.in_(unique))
        result = await self.db.execute(stmt)
        found: set[UUID] = set(result.scalars().all())
        for item_data in items:
            fid = item_data.get("food_catalog_id")
            if fid is None:
                continue
            try:
                u = fid if isinstance(fid, UUID) else UUID(str(fid))
            except (ValueError, TypeError):
                item_data["food_catalog_id"] = None
                continue
            if u not in found:
                item_data["food_catalog_id"] = None

    async def create_meal_entry(self, user_id: str, meal_date: date,
                                 meal_type: str, items: list, **kwargs) -> MealEntry:
        await self._coerce_food_catalog_fk_in_items(items)
        total_kcal, total_protein, total_carbs, total_fat = _totals_from_items(items)

        entry = MealEntry(
            user_id=user_id,
            date=meal_date,
            meal_type=meal_type,
            total_kcal=total_kcal,
            total_protein_g=total_protein,
            total_carbs_g=total_carbs,
            total_fat_g=total_fat,
            **kwargs,
        )
        self.db.add(entry)
        await self.db.flush()

        for item_data in items:
            item = MealEntryItem(
                meal_entry_id=entry.id,
                food_catalog_id=item_data.get("food_catalog_id"),
                custom_name=item_data.get("custom_name"),
                grams=item_data["grams"],
                kcal=item_data["kcal"],
                protein_g=item_data["protein_g"],
                carbs_g=item_data["carbs_g"],
                fat_g=item_data["fat_g"],
                source=item_data.get("source"),
                eaten=_item_counts_toward_day(item_data),
            )
            self.db.add(item)

        await self.db.flush()
        stmt = (
            select(MealEntry)
            .options(selectinload(MealEntry.items))
            .where(MealEntry.id == entry.id)
        )
        res = await self.db.execute(stmt)
        return res.scalar_one()

    async def delete_meals_before_date(self, user_id: str, cutoff_date: date) -> None:
        """Elimina entradas de diario con fecha estrictamente anterior a cutoff_date (cascade en ítems)."""
        await self.db.execute(
            delete(MealEntry).where(MealEntry.user_id == user_id, MealEntry.date < cutoff_date)
        )
        await self.db.flush()

    async def get_meals_by_date(self, user_id: str, meal_date: date) -> List[MealEntry]:
        stmt = (
            select(MealEntry)
            .options(selectinload(MealEntry.items))
            .where(MealEntry.user_id == user_id, MealEntry.date == meal_date)
            .order_by(MealEntry.created_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_daily_kcal_in_range(
        self, user_id: str, start_date: date, end_date: date
    ) -> dict[date, float]:
        """Devuelve {fecha: kcal_totales} para cada día con registros dentro del rango [start, end]."""
        stmt = (
            select(MealEntry.date, func.coalesce(func.sum(MealEntry.total_kcal), 0.0))
            .where(
                MealEntry.user_id == user_id,
                MealEntry.date >= start_date,
                MealEntry.date <= end_date,
            )
            .group_by(MealEntry.date)
        )
        result = await self.db.execute(stmt)
        return {row[0]: float(row[1] or 0.0) for row in result.all()}

    async def get_daily_streak_kcal_in_range(
        self,
        user_id: str,
        start_date: date,
        end_date: date,
        *,
        streak_deadline_fn: Callable[[date], datetime],
    ) -> dict[date, float]:
        """Devuelve {fecha: kcal elegibles para racha} según created_at <= deadline(fecha)."""
        stmt = (
            select(MealEntry.date, MealEntry.total_kcal, MealEntry.created_at)
            .where(
                MealEntry.user_id == user_id,
                MealEntry.date >= start_date,
                MealEntry.date <= end_date,
            )
        )
        result = await self.db.execute(stmt)
        daily: dict[date, float] = {}
        for meal_date, total_kcal, created_at in result.all():
            if _is_created_before_streak_deadline(
                created_at,
                meal_date,
                streak_deadline_fn=streak_deadline_fn,
            ):
                daily[meal_date] = daily.get(meal_date, 0.0) + float(total_kcal or 0.0)
        return daily

    async def list_recent_meal_entries(self, user_id: str, limit: int = 40) -> List[MealEntry]:
        """Últimas comidas registradas (cualquier día), por fecha de creación descendente."""
        stmt = (
            select(MealEntry)
            .options(selectinload(MealEntry.items))
            .where(MealEntry.user_id == user_id)
            .order_by(desc(MealEntry.created_at))
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_meal_by_id(self, meal_id: UUID, user_id: str) -> Optional[MealEntry]:
        stmt = (
            select(MealEntry)
            .options(selectinload(MealEntry.items))
            .where(MealEntry.id == meal_id, MealEntry.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_meal_entry(self, meal_id: UUID, user_id: str,
                                 items: Optional[list] = None, **kwargs) -> Optional[MealEntry]:
        entry = await self.get_meal_by_id(meal_id, user_id)
        if not entry:
            return None

        for k, v in kwargs.items():
            if v is not None:
                setattr(entry, k, v)

        if items is not None:
            await self._coerce_food_catalog_fk_in_items(items)
            await self.db.execute(
                delete(MealEntryItem).where(MealEntryItem.meal_entry_id == meal_id)
            )
            total_kcal, total_protein, total_carbs, total_fat = _totals_from_items(items)

            entry.total_kcal = total_kcal
            entry.total_protein_g = total_protein
            entry.total_carbs_g = total_carbs
            entry.total_fat_g = total_fat

            for item_data in items:
                item = MealEntryItem(
                    meal_entry_id=meal_id,
                    food_catalog_id=item_data.get("food_catalog_id"),
                    custom_name=item_data.get("custom_name"),
                    grams=item_data["grams"],
                    kcal=item_data["kcal"],
                    protein_g=item_data["protein_g"],
                    carbs_g=item_data["carbs_g"],
                    fat_g=item_data["fat_g"],
                    source=item_data.get("source"),
                    eaten=_item_counts_toward_day(item_data),
                )
                self.db.add(item)

        await self.db.flush()
        return entry

    async def set_meal_entry_item_eaten(
        self, meal_id: UUID, item_id: UUID, user_id: str, eaten: bool
    ) -> Optional[MealEntry]:
        entry = await self.get_meal_by_id(meal_id, user_id)
        if not entry:
            return None
        found: Optional[MealEntryItem] = None
        for it in entry.items:
            if it.id == item_id:
                found = it
                break
        if not found:
            return None
        found.eaten = eaten
        _apply_totals_to_entry(entry, list(entry.items))
        await self.db.flush()
        return await self.get_meal_by_id(meal_id, user_id)

    async def delete_meal_entry(self, meal_id: UUID, user_id: str) -> bool:
        entry = await self.get_meal_by_id(meal_id, user_id)
        if not entry:
            return False
        await self.db.delete(entry)
        await self.db.flush()
        return True

    async def create_saved_meal(self, user_id: str, name: str, items: list) -> SavedMeal:
        await self._coerce_food_catalog_fk_in_items(items)
        existing_stmt = (
            select(SavedMeal)
            .options(selectinload(SavedMeal.items))
            .where(SavedMeal.user_id == user_id, SavedMeal.name == name)
        )
        existing = (await self.db.execute(existing_stmt)).scalar_one_or_none()
        if existing:
            return existing

        total_kcal = sum(i.get("kcal", 0) for i in items)
        total_protein = sum(i.get("protein_g", 0) for i in items)
        total_carbs = sum(i.get("carbs_g", 0) for i in items)
        total_fat = sum(i.get("fat_g", 0) for i in items)

        saved = SavedMeal(
            user_id=user_id,
            name=name,
            total_kcal=total_kcal,
            total_protein_g=total_protein,
            total_carbs_g=total_carbs,
            total_fat_g=total_fat,
        )
        self.db.add(saved)
        await self.db.flush()

        for item_data in items:
            item = SavedMealItem(
                saved_meal_id=saved.id,
                food_catalog_id=item_data.get("food_catalog_id"),
                custom_name=item_data.get("custom_name"),
                grams=item_data["grams"],
                kcal=item_data["kcal"],
                protein_g=item_data["protein_g"],
                carbs_g=item_data["carbs_g"],
                fat_g=item_data["fat_g"],
            )
            self.db.add(item)

        await self.db.flush()

        stmt = (
            select(SavedMeal)
            .options(selectinload(SavedMeal.items))
            .where(SavedMeal.id == saved.id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def get_saved_meals(self, user_id: str) -> List[SavedMeal]:
        stmt = (
            select(SavedMeal)
            .options(selectinload(SavedMeal.items))
            .where(SavedMeal.user_id == user_id)
            .order_by(SavedMeal.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_saved_meal(self, saved_meal_id: UUID, user_id: str) -> bool:
        stmt = select(SavedMeal).where(SavedMeal.id == saved_meal_id, SavedMeal.user_id == user_id)
        result = await self.db.execute(stmt)
        meal = result.scalar_one_or_none()
        if not meal:
            return False
        await self.db.delete(meal)
        await self.db.flush()
        return True

    # ── Custom foods ──

    async def create_custom_food(self, user_id: str, name: str, kcal_per_100g: float,
                                  protein_per_100g: float, carbs_per_100g: float,
                                  fat_per_100g: float, icon: str | None = None) -> CustomFood:
        food = CustomFood(
            user_id=user_id,
            name=name,
            kcal_per_100g=kcal_per_100g,
            protein_per_100g=protein_per_100g,
            carbs_per_100g=carbs_per_100g,
            fat_per_100g=fat_per_100g,
            icon=icon,
        )
        self.db.add(food)
        await self.db.flush()
        return food

    async def get_custom_foods(self, user_id: str) -> List[CustomFood]:
        stmt = (
            select(CustomFood)
            .where(CustomFood.user_id == user_id)
            .order_by(CustomFood.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_custom_food(self, food_id: UUID, user_id: str, name: str,
                                  kcal_per_100g: float, protein_per_100g: float,
                                  carbs_per_100g: float, fat_per_100g: float,
                                  icon: str | None = None) -> Optional[CustomFood]:
        stmt = select(CustomFood).where(CustomFood.id == food_id, CustomFood.user_id == user_id)
        result = await self.db.execute(stmt)
        food = result.scalar_one_or_none()
        if not food:
            return None
        food.name = name
        food.kcal_per_100g = kcal_per_100g
        food.protein_per_100g = protein_per_100g
        food.carbs_per_100g = carbs_per_100g
        food.fat_per_100g = fat_per_100g
        food.icon = icon
        await self.db.flush()
        return food

    async def delete_custom_food(self, food_id: UUID, user_id: str) -> bool:
        stmt = select(CustomFood).where(CustomFood.id == food_id, CustomFood.user_id == user_id)
        result = await self.db.execute(stmt)
        food = result.scalar_one_or_none()
        if not food:
            return False
        await self.db.delete(food)
        await self.db.flush()
        return True

    # ── Recipes ──

    async def create_recipe(
        self, user_id: str, name: str, items: list,
        servings: int = 1, description: str | None = None, icon: str | None = None,
    ) -> Recipe:
        await self._coerce_food_catalog_fk_in_items(items)
        total_weight = sum(float(i.get("grams", 0)) for i in items)
        total_kcal = sum(float(i.get("kcal", 0)) for i in items)
        total_protein = sum(float(i.get("protein_g", 0)) for i in items)
        total_carbs = sum(float(i.get("carbs_g", 0)) for i in items)
        total_fat = sum(float(i.get("fat_g", 0)) for i in items)

        recipe = Recipe(
            user_id=user_id,
            name=name,
            description=description,
            servings=servings,
            total_weight_g=total_weight,
            total_kcal=total_kcal,
            total_protein_g=total_protein,
            total_carbs_g=total_carbs,
            total_fat_g=total_fat,
            icon=icon,
        )
        self.db.add(recipe)
        await self.db.flush()

        for item_data in items:
            item = RecipeItem(
                recipe_id=recipe.id,
                food_catalog_id=item_data.get("food_catalog_id"),
                custom_name=item_data.get("custom_name"),
                grams=item_data["grams"],
                kcal=item_data["kcal"],
                protein_g=item_data["protein_g"],
                carbs_g=item_data["carbs_g"],
                fat_g=item_data["fat_g"],
            )
            self.db.add(item)

        await self.db.flush()
        return await self.get_recipe_by_id(recipe.id, user_id)  # type: ignore[return-value]

    async def get_recipes(self, user_id: str) -> List[Recipe]:
        stmt = (
            select(Recipe)
            .options(selectinload(Recipe.items))
            .where(Recipe.user_id == user_id)
            .order_by(Recipe.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_recipe_by_id(self, recipe_id: UUID, user_id: str) -> Optional[Recipe]:
        stmt = (
            select(Recipe)
            .options(selectinload(Recipe.items))
            .where(Recipe.id == recipe_id, Recipe.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_recipe(
        self, recipe_id: UUID, user_id: str, name: str, items: list,
        servings: int = 1, description: str | None = None, icon: str | None = None,
    ) -> Optional[Recipe]:
        recipe = await self.get_recipe_by_id(recipe_id, user_id)
        if not recipe:
            return None

        recipe.name = name
        recipe.description = description
        recipe.servings = servings
        recipe.icon = icon

        await self._coerce_food_catalog_fk_in_items(items)
        await self.db.execute(
            delete(RecipeItem).where(RecipeItem.recipe_id == recipe_id)
        )

        total_weight = sum(float(i.get("grams", 0)) for i in items)
        total_kcal = sum(float(i.get("kcal", 0)) for i in items)
        total_protein = sum(float(i.get("protein_g", 0)) for i in items)
        total_carbs = sum(float(i.get("carbs_g", 0)) for i in items)
        total_fat = sum(float(i.get("fat_g", 0)) for i in items)

        recipe.total_weight_g = total_weight
        recipe.total_kcal = total_kcal
        recipe.total_protein_g = total_protein
        recipe.total_carbs_g = total_carbs
        recipe.total_fat_g = total_fat

        for item_data in items:
            item = RecipeItem(
                recipe_id=recipe_id,
                food_catalog_id=item_data.get("food_catalog_id"),
                custom_name=item_data.get("custom_name"),
                grams=item_data["grams"],
                kcal=item_data["kcal"],
                protein_g=item_data["protein_g"],
                carbs_g=item_data["carbs_g"],
                fat_g=item_data["fat_g"],
            )
            self.db.add(item)

        await self.db.flush()
        return await self.get_recipe_by_id(recipe_id, user_id)

    async def delete_recipe(self, recipe_id: UUID, user_id: str) -> bool:
        recipe = await self.get_recipe_by_id(recipe_id, user_id)
        if not recipe:
            return False
        await self.db.delete(recipe)
        await self.db.flush()
        return True
