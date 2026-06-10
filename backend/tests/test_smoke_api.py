"""Smoke mínimo: app montada, health, ruta protegida sin token."""
from fastapi.testclient import TestClient

from app.main import app


def test_health():
    r = TestClient(app).get("/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_protected_nutrition_search_returns_401_without_auth():
    r = TestClient(app).get("/api/v1/nutrition/search?q=arroz")
    assert r.status_code == 401


def test_openapi_schema_available():
    r = TestClient(app).get("/openapi.json")
    assert r.status_code == 200
    assert "paths" in r.json()


def test_password_reset_routes_are_exposed():
    r = TestClient(app).get("/openapi.json")
    paths = r.json()["paths"]
    assert "/api/v1/auth/password/forgot" in paths
    assert "/api/v1/auth/password/reset" in paths


def test_email_verification_routes_are_exposed():
    r = TestClient(app).get("/openapi.json")
    paths = r.json()["paths"]
    assert "/api/v1/auth/email/resend-verification" in paths
    assert "/api/v1/auth/email/verify" in paths
