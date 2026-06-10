from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.config import get_settings
from app.models.models import Profile
from app.services.subscription_quota_service import (
    SubscriptionQuotaService,
    effective_subscription_tier,
)


@pytest.fixture
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_no_developer_override_email_is_premium_by_default(
    monkeypatch, clear_settings_cache
):
    # Vaciar overrides vía env del proceso: tiene prioridad sobre `.env` del repo (dev local).
    monkeypatch.setenv("NUTRIFORCE_PREMIUM_OVERRIDE_EMAILS", "")
    monkeypatch.setenv("NUTRIFORCE_PREMIUM_OVERRIDE_USER_IDS", "")
    get_settings.cache_clear()
    profile = Profile(user_id="user-1", subscription_tier="free")

    assert effective_subscription_tier(profile, "user-1", "ACEMENGAB@gmail.com") == "free"
    assert effective_subscription_tier(profile, "user-1", "lucas.perezpract@siweb.es") == "free"


def test_env_override_email_is_the_only_email_override(monkeypatch, clear_settings_cache):
    monkeypatch.setenv("NUTRIFORCE_PREMIUM_OVERRIDE_EMAILS", "qa@example.com")
    get_settings.cache_clear()
    profile = Profile(user_id="user-1", subscription_tier="free")

    assert effective_subscription_tier(profile, "user-1", "qa@example.com") == "premium"
    assert effective_subscription_tier(profile, "user-1", "acemengab@gmail.com") == "free"


@pytest.mark.asyncio
async def test_premium_status_resolves_email_override_from_user_record(monkeypatch, clear_settings_cache):
    monkeypatch.setenv("NUTRIFORCE_PREMIUM_OVERRIDE_EMAILS", "lucas.perezpract@siweb.es")
    get_settings.cache_clear()
    service = SubscriptionQuotaService(AsyncMock())
    profile = Profile(user_id="user-1", subscription_tier="free")
    service.profile_repo.get_by_user_id = AsyncMock(return_value=profile)
    service.auth_repo.get_by_id = AsyncMock(
        return_value=SimpleNamespace(email="lucas.perezpract@siweb.es")
    )

    premium, resolved_profile = await service.premium_status("user-1")

    assert premium is True
    assert resolved_profile is profile
