"""Tests GET activity y estimación de entreno (mock LLM)."""

from datetime import date
from unittest.mock import AsyncMock

import pytest

from app.ai.workout_estimate import WorkoutEstimateAIResponse
from app.schemas.progress import EstimateTrainingRequest
from app.services.progress_service import ProgressService


class TestEstimateTrainingSchema:
    def test_request_rejects_short_text(self):
        with pytest.raises(Exception):
            EstimateTrainingRequest(text="ab")


@pytest.mark.asyncio
async def test_get_activity_day_empty():
    mock_db = AsyncMock()
    svc = ProgressService(mock_db)
    svc.progress_repo.get_latest_activity = AsyncMock(return_value=None)
    out = await svc.get_activity_day("u1", date(2026, 4, 21))
    assert out.steps is None
    assert out.date == date(2026, 4, 21)


@pytest.mark.asyncio
async def test_estimate_training_maps_ai(monkeypatch):
    async def fake_estimate(text: str):
        return WorkoutEstimateAIResponse(
            estimated_kcal=150.0,
            duration_min=30,
            summary_es="Test resumen",
            confidence="high",
        )

    monkeypatch.setattr(
        "app.services.progress_service.estimate_workout_from_text",
        fake_estimate,
    )
    mock_db = AsyncMock()
    svc = ProgressService(mock_db)
    out = await svc.estimate_training("correr suave media hora")
    assert out is not None
    assert out.estimated_kcal == 150.0
    assert out.summary_es == "Test resumen"
