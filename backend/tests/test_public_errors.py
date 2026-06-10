"""Mensajes públicos de error (prod vs dev)."""
import pytest

from app.core.config import get_settings
from app.core.public_errors import MSG_500_PUBLIC, detail_500


@pytest.fixture
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_detail_500_production_hides_exception(monkeypatch, clear_settings_cache):
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    assert detail_500(ValueError("internal path /etc/passwd")) == MSG_500_PUBLIC
    assert "internal" not in detail_500(ValueError("internal"))


def test_detail_500_development_includes_type(monkeypatch, clear_settings_cache):
    monkeypatch.setenv("ENVIRONMENT", "development")
    get_settings.cache_clear()
    d = detail_500(ValueError("boom"))
    assert "dev" in d
    assert "ValueError" in d
