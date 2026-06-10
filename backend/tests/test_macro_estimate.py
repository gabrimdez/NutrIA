"""Tests del endpoint POST /api/v1/foods/estimate-macros y del validador IA."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.ai.macro_estimate import FoodMacroEstimateAIResponse
from app.api.v1.endpoints import foods as foods_endpoint
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.main import app


# ── Validador de coherencia energética ──

def test_validator_accepts_coherent_macros():
    r = FoodMacroEstimateAIResponse(kcal=400, protein_g=20, carbs_g=50, fat_g=10)
    assert r.kcal == 400


def test_validator_rejects_kcal_too_high():
    with pytest.raises(ValidationError):
        FoodMacroEstimateAIResponse(kcal=1000, protein_g=20, carbs_g=50, fat_g=10)


def test_validator_rejects_kcal_too_low():
    with pytest.raises(ValidationError):
        FoodMacroEstimateAIResponse(kcal=100, protein_g=20, carbs_g=50, fat_g=10)


def test_validator_accepts_all_zero():
    r = FoodMacroEstimateAIResponse(kcal=0, protein_g=0, carbs_g=0, fat_g=0)
    assert r.kcal == 0


def test_validator_rejects_kcal_with_zero_macros():
    with pytest.raises(ValidationError):
        FoodMacroEstimateAIResponse(kcal=200, protein_g=0, carbs_g=0, fat_g=0)


# ── Endpoint /api/v1/foods/estimate-macros ──

@pytest.fixture
def auth_overrides():
    """Inyecta usuario y DB falsos. Devuelve handles para parametrizar premium."""
    async def fake_user():
        return "user-test-1"

    async def fake_db():
        yield object()

    app.dependency_overrides[get_current_user_id] = fake_user
    app.dependency_overrides[get_db] = fake_db
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)
        app.dependency_overrides.pop(get_db, None)


def _patch_premium(monkeypatch, is_premium: bool):
    """Sortea la BD: el servicio cree que el usuario es premium o free según parametricemos."""
    from app.services import subscription_quota_service as svc

    async def fake_premium_status(self, user_id, *, profile=None, user_email=None):
        return (is_premium, None)

    monkeypatch.setattr(svc.SubscriptionQuotaService, "premium_status", fake_premium_status)


def test_estimate_macros_returns_503_when_groq_unavailable(auth_overrides, monkeypatch):
    monkeypatch.setattr(foods_endpoint, "has_groq_keys", lambda: False)
    # No hace falta mockear premium: el 503 debe devolverse antes que el 403.

    client = TestClient(app)
    r = client.post(
        "/api/v1/foods/estimate-macros",
        json={"name": "manzana", "quantity": 150, "unit": "g"},
    )
    assert r.status_code == 503
    assert "IA" in r.json()["detail"]


def test_estimate_macros_returns_403_for_free_user(auth_overrides, monkeypatch):
    monkeypatch.setattr(foods_endpoint, "has_groq_keys", lambda: True)
    _patch_premium(monkeypatch, is_premium=False)

    client = TestClient(app)
    r = client.post(
        "/api/v1/foods/estimate-macros",
        json={"name": "manzana", "quantity": 150, "unit": "g"},
    )
    assert r.status_code == 403
    assert "Premium" in r.json()["detail"]


def test_estimate_macros_returns_422_when_ai_fails(auth_overrides, monkeypatch):
    monkeypatch.setattr(foods_endpoint, "has_groq_keys", lambda: True)
    _patch_premium(monkeypatch, is_premium=True)

    async def fake_estimate(name, quantity, unit):
        return None

    monkeypatch.setattr(foods_endpoint, "estimate_macros_from_text", fake_estimate)

    client = TestClient(app)
    r = client.post(
        "/api/v1/foods/estimate-macros",
        json={"name": "xyzqq", "quantity": 100, "unit": "g"},
    )
    assert r.status_code == 422
    assert "estimar" in r.json()["detail"].lower()


def test_estimate_macros_returns_macros_on_success(auth_overrides, monkeypatch):
    monkeypatch.setattr(foods_endpoint, "has_groq_keys", lambda: True)
    _patch_premium(monkeypatch, is_premium=True)

    async def fake_estimate(name, quantity, unit):
        return FoodMacroEstimateAIResponse(
            kcal=78,
            protein_g=0.4,
            carbs_g=20.0,
            fat_g=0.2,
            confidence="high",
            notes="manzana mediana",
        )

    monkeypatch.setattr(foods_endpoint, "estimate_macros_from_text", fake_estimate)

    client = TestClient(app)
    r = client.post(
        "/api/v1/foods/estimate-macros",
        json={"name": "manzana", "quantity": 150, "unit": "g"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["kcal"] == 78.0
    assert body["protein_g"] == 0.4
    assert body["confidence"] == "high"
    assert body["notes"] == "manzana mediana"


def test_estimate_macros_rejects_invalid_unit(auth_overrides):
    client = TestClient(app)
    r = client.post(
        "/api/v1/foods/estimate-macros",
        json={"name": "manzana", "quantity": 150, "unit": "kg"},
    )
    assert r.status_code == 422


def test_estimate_macros_rejects_non_positive_quantity(auth_overrides):
    client = TestClient(app)
    r = client.post(
        "/api/v1/foods/estimate-macros",
        json={"name": "manzana", "quantity": 0, "unit": "g"},
    )
    assert r.status_code == 422


def test_estimate_macros_rejects_short_name(auth_overrides):
    client = TestClient(app)
    r = client.post(
        "/api/v1/foods/estimate-macros",
        json={"name": "a", "quantity": 100, "unit": "g"},
    )
    assert r.status_code == 422
