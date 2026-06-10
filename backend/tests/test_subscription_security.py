from types import SimpleNamespace

from app.core.config import get_settings
from app.services.subscription_quota_service import effective_subscription_tier


def test_premium_email_override_when_env_list_contains_email(monkeypatch):
    for env in ("development", "production"):
        monkeypatch.setenv("ENVIRONMENT", env)
        monkeypatch.setenv("NUTRIFORCE_PREMIUM_OVERRIDE_EMAILS", "admin@example.com")
        get_settings.cache_clear()

        tier = effective_subscription_tier(
            SimpleNamespace(subscription_tier="free"),
            "user-1",
            "admin@example.com",
        )

        assert tier == "premium"
        get_settings.cache_clear()


def test_premium_email_overrides_absent_stays_free(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("NUTRIFORCE_PREMIUM_OVERRIDE_EMAILS", raising=False)
    get_settings.cache_clear()

    tier = effective_subscription_tier(
        SimpleNamespace(subscription_tier="free"),
        "user-1",
        "admin@example.com",
    )

    assert tier == "free"
    get_settings.cache_clear()
