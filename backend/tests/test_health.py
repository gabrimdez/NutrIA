"""Smoke test for FastAPI app import and health endpoint."""
from fastapi.testclient import TestClient

from app.main import app


def test_health_check():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0"}
