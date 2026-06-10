"""Retención del diario (30 días) y validación al confirmar comidas."""
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.schemas.meal import MealConfirmRequest, MealItemCreate, MealTypeEnum
from app.services.meal_service import MealService


def _bare_meal_service():
    svc = MealService.__new__(MealService)
    svc.db = AsyncMock()
    svc.meal_repo = AsyncMock()
    svc.profile_repo = AsyncMock()
    svc.food_provider = AsyncMock()
    return svc


@pytest.mark.asyncio
async def test_confirm_meal_rejects_date_before_retention_cutoff():
    svc = _bare_meal_service()
    fixed_cutoff = date(2026, 6, 1)
    svc._diary_retention_cutoff = lambda: fixed_cutoff

    req = MealConfirmRequest(
        date=fixed_cutoff - timedelta(days=1),
        meal_type=MealTypeEnum.breakfast,
        items=[MealItemCreate(grams=100, kcal=200, protein_g=20, carbs_g=10, fat_g=5)],
    )
    with pytest.raises(HTTPException) as exc:
        await MealService.confirm_meal(svc, "user-1", req)
    assert exc.value.status_code == 400
    svc.meal_repo.delete_meals_before_date.assert_not_called()
    svc.meal_repo.create_meal_entry.assert_not_called()


@pytest.mark.asyncio
async def test_confirm_meal_on_cutoff_day_purges_and_creates():
    svc = _bare_meal_service()
    fixed_cutoff = date(2026, 6, 1)
    svc._diary_retention_cutoff = lambda: fixed_cutoff
    svc.meal_repo.create_meal_entry = AsyncMock(return_value=MagicMock())

    req = MealConfirmRequest(
        date=fixed_cutoff,
        meal_type=MealTypeEnum.lunch,
        items=[MealItemCreate(grams=100, kcal=200, protein_g=20, carbs_g=10, fat_g=5)],
    )
    await MealService.confirm_meal(svc, "user-1", req)
    svc.meal_repo.delete_meals_before_date.assert_awaited_once_with("user-1", fixed_cutoff)
    svc.meal_repo.create_meal_entry.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_diary_purges_old_entries_first():
    svc = _bare_meal_service()
    fixed_cutoff = date(2026, 4, 10)
    svc._diary_retention_cutoff = lambda: fixed_cutoff
    svc.meal_repo.get_meals_by_date = AsyncMock(return_value=[])
    svc.profile_repo.get_active_target = AsyncMock(return_value=None)

    diary_day = date(2026, 4, 10)
    out = await MealService.get_diary(svc, "user-1", diary_day)
    svc.meal_repo.delete_meals_before_date.assert_awaited_once_with("user-1", fixed_cutoff)
    assert out["date"] == diary_day
    assert out["meals"] == []
