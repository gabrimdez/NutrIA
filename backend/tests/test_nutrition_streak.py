"""Tests for nutrition streak (consecutive days >= 80% of kcal target)."""
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.repositories.meal_repo import MealRepository
from app.services.meal_service import (
    MealService,
    compute_nutrition_streak_days,
    get_streak_deadline,
    is_day_done,
)


def test_is_day_done_with_target():
    assert is_day_done(799.0, 1000.0) is False
    assert is_day_done(800.0, 1000.0) is True
    assert is_day_done(1200.0, 1000.0) is True


def test_is_day_done_no_target():
    assert is_day_done(0.0, None) is False
    assert is_day_done(1.0, None) is True


def test_compute_streak_no_target_counts_days_with_kcal():
    """Sin objetivo, 'done' coincide con el mes: kcal > 0."""
    today = date(2026, 4, 20)
    cutoff = today - timedelta(days=30)
    m = {today - timedelta(days=1): 2000.0}
    assert compute_nutrition_streak_days(today, cutoff, m, None) == 1
    assert compute_nutrition_streak_days(today, cutoff, m, 0.0) == 1


def test_compute_streak_today_incomplete_yesterday_done():
    today = date(2026, 4, 20)
    cutoff = today - timedelta(days=30)
    target = 1000.0
    m = {
        today: 100.0,
        today - timedelta(days=1): 900.0,
    }
    assert compute_nutrition_streak_days(today, cutoff, m, target) == 1


def test_compute_streak_today_done_chain():
    today = date(2026, 4, 20)
    cutoff = today - timedelta(days=30)
    target = 1000.0
    m = {
        today: 800.0,
        today - timedelta(days=1): 800.0,
        today - timedelta(days=2): 400.0,
    }
    assert compute_nutrition_streak_days(today, cutoff, m, target) == 2


def test_compute_streak_broken_by_gap():
    today = date(2026, 4, 20)
    cutoff = today - timedelta(days=30)
    target = 1000.0
    m = {
        today: 800.0,
        today - timedelta(days=1): 100.0,
        today - timedelta(days=2): 900.0,
    }
    assert compute_nutrition_streak_days(today, cutoff, m, target) == 1


def test_get_streak_deadline_uses_next_day_3am():
    assert get_streak_deadline(date(2026, 4, 20)) == datetime(2026, 4, 21, 3, 0, 0)


@pytest.mark.asyncio
async def test_get_daily_streak_kcal_in_range_excludes_late_backfill_and_keeps_on_time():
    repo = MealRepository(AsyncMock())
    day = date(2026, 4, 20)
    repo.db.execute.return_value = MagicMock()
    repo.db.execute.return_value.all.return_value = [
        (day, 500.0, datetime(2026, 4, 20, 22, 0, 0)),
        (day, 400.0, datetime(2026, 4, 21, 1, 30, 0)),
        (day, 700.0, datetime(2026, 4, 21, 9, 0, 0)),
        (day - timedelta(days=1), 900.0, datetime(2026, 4, 20, 3, 0, 0)),
    ]

    daily = await repo.get_daily_streak_kcal_in_range(
        "user-1",
        day - timedelta(days=1),
        day,
        streak_deadline_fn=get_streak_deadline,
    )

    assert daily[day] == 900.0
    assert daily[day - timedelta(days=1)] == 900.0


@pytest.mark.asyncio
async def test_get_daily_streak_kcal_in_range_includes_entry_created_exactly_at_deadline():
    repo = MealRepository(AsyncMock())
    day = date(2026, 4, 20)
    repo.db.execute.return_value = MagicMock()
    repo.db.execute.return_value.all.return_value = [
        (day, 800.0, datetime(2026, 4, 21, 3, 0, 0)),
    ]

    daily = await repo.get_daily_streak_kcal_in_range(
        "user-1",
        day,
        day,
        streak_deadline_fn=get_streak_deadline,
    )

    assert daily[day] == 800.0


@pytest.mark.asyncio
async def test_get_daily_streak_kcal_in_range_handles_timezone_aware_created_at():
    repo = MealRepository(AsyncMock())
    day = date(2026, 4, 20)
    repo.db.execute.return_value = MagicMock()
    repo.db.execute.return_value.all.return_value = [
        (day, 800.0, datetime(2026, 4, 21, 2, 0, 0, tzinfo=UTC)),
    ]

    daily = await repo.get_daily_streak_kcal_in_range(
        "user-1",
        day,
        day,
        streak_deadline_fn=get_streak_deadline,
    )

    assert daily[day] == 800.0


@pytest.mark.asyncio
async def test_get_nutrition_streak_days_ignores_late_backfill_but_keeps_today_incomplete_rule():
    svc = MealService.__new__(MealService)
    svc.db = AsyncMock()
    svc.meal_repo = AsyncMock()
    svc.profile_repo = AsyncMock()
    svc.food_provider = AsyncMock()
    svc._diary_retention_cutoff = lambda: date.today() - timedelta(days=30)
    svc.profile_repo.get_active_target = AsyncMock(return_value=MagicMock(calories_kcal=1000.0))

    today = date.today()
    yesterday = today - timedelta(days=1)
    svc.meal_repo.get_daily_streak_kcal_in_range = AsyncMock(
        return_value={
            today: 100.0,
            yesterday: 0.0,
            yesterday - timedelta(days=1): 900.0,
        }
    )

    streak = await MealService.get_nutrition_streak_days(svc, "user-1")

    assert streak == 0
    svc.meal_repo.get_daily_streak_kcal_in_range.assert_awaited_once()
