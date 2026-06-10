from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.avatar import get_avatar
from app.api.v1.endpoints.nutrition import nutrition_photo_analyze
from app.core.config import get_settings
from app.models.models import BadgeSource
from app.repositories.badge_repo import BadgeRepository, _naive_utc
from app.services.subscription_quota_service import SubscriptionQuotaService


@pytest.mark.asyncio
async def test_premium_quota_checks_are_unlimited(monkeypatch):
    monkeypatch.setenv("PREMIUM_CHAT_USER_MESSAGES_PER_DAY", "0")
    monkeypatch.setenv("PREMIUM_RECIPE_RECOMMENDATIONS_PER_DAY", "0")
    get_settings.cache_clear()

    service = SubscriptionQuotaService(AsyncMock())
    service.premium_status = AsyncMock(return_value=(True, SimpleNamespace(subscription_tier="premium")))
    service.usage_repo.get_usage = AsyncMock(return_value=999)
    service.usage_repo.count_user_messages_since = AsyncMock(return_value=999)

    await service.require_chat_turn("u1")
    await service.require_recipe_recommendation_turn("u1")
    await service.require_vision("u1")
    await service.require_plan_regen("u1")

    assert await service.build_usage_snapshot("u1", premium=True) is None


@pytest.mark.asyncio
async def test_free_chat_quota_uses_lock_before_count(monkeypatch):
    monkeypatch.setenv("FREE_CHAT_USER_MESSAGES_PER_MONTH", "1")
    get_settings.cache_clear()

    service = SubscriptionQuotaService(AsyncMock())
    service.premium_status = AsyncMock(return_value=(False, SimpleNamespace(subscription_tier="free")))
    service.usage_repo.month_key = lambda: "2026-04"
    service.usage_repo.acquire_quota_lock = AsyncMock()
    service.chat_turns_this_month = AsyncMock(return_value=1)

    with pytest.raises(HTTPException) as exc:
        await service.require_chat_turn("u1")

    assert exc.value.status_code == 403
    service.usage_repo.acquire_quota_lock.assert_awaited_once_with("u1", "chat_month", "2026-04")


def test_badge_repo_naive_utc_normalizes_aware_datetimes():
    aware = datetime(2026, 4, 27, 10, 30, tzinfo=timezone.utc)

    out = _naive_utc(aware)

    assert out.tzinfo is None
    assert out == datetime(2026, 4, 27, 10, 30)


@pytest.mark.asyncio
async def test_badge_repo_grant_stores_naive_unlocked_at():
    db = AsyncMock()
    db.add = Mock()
    repo = BadgeRepository(db)
    repo.get_user_badge_row = AsyncMock(return_value=None)
    aware = datetime(2026, 4, 27, 10, 30, tzinfo=timezone.utc)

    row, created = await repo.grant_user_badge(
        "u1",
        UUID("00000000-0000-0000-0000-000000000001"),
        source=BadgeSource.SYSTEM,
        progress_snapshot=None,
        unlocked_at=aware,
    )

    assert created is True
    assert row.unlocked_at.tzinfo is None
    assert db.add.call_args.args[0].unlocked_at.tzinfo is None


@pytest.mark.asyncio
async def test_nutrition_photo_badge_not_fired_without_candidates(monkeypatch):
    class FakeUpload:
        content_type = "image/jpeg"

        def __init__(self):
            self._done = False

        async def read(self, size=-1):
            if self._done:
                return b""
            self._done = True
            return b"\xff\xd8\xff\xe0image"

    class FakeQuota:
        def __init__(self, db):
            pass

        async def require_vision(self, user_id):
            pass

        async def record_vision_success(self, user_id):
            raise AssertionError("vision usage should not be recorded without candidates")

    class FakeNutritionService:
        def __init__(self, db):
            pass

        async def analyze_photo(self, image_bytes, mime):
            return SimpleNamespace(candidates=[])

    fired = AsyncMock()
    monkeypatch.setattr("app.api.v1.endpoints.nutrition.SubscriptionQuotaService", FakeQuota)
    monkeypatch.setattr("app.api.v1.endpoints.nutrition.NutritionService", FakeNutritionService)
    monkeypatch.setattr("app.services.badge_integration.fire_photo_analyze", fired)

    result = await nutrition_photo_analyze(
        request=SimpleNamespace(),
        image=FakeUpload(),
        user_id="u1",
        db=AsyncMock(),
    )

    assert result.candidates == []
    fired.assert_not_awaited()


@pytest.mark.asyncio
async def test_avatar_public_rejects_invalid_id():
    with pytest.raises(HTTPException) as exc:
        await get_avatar("../not-safe")

    assert exc.value.status_code == 400
