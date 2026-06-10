from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services.workout_service import WorkoutService


class FakeWorkoutRepo:
    def __init__(self, previous):
        self.previous = previous

    async def find_previous_session(self, user_id, weekday, before_date, category="gym"):
        self.args = (user_id, weekday, before_date, category)
        return self.previous


@pytest.mark.asyncio
async def test_previous_session_template_returns_clear_404_without_writes():
    service = WorkoutService(db=object())
    repo = FakeWorkoutRepo(None)
    service.repo = repo

    with pytest.raises(HTTPException) as exc:
        await service.get_previous_session_template(
            "user-1",
            weekday=0,
            before_date=date(2026, 5, 7),
            category="gym",
        )

    assert exc.value.status_code == 404
    assert "entrenamiento anterior" in exc.value.detail
    assert repo.args == ("user-1", 0, date(2026, 5, 7), "gym")


@pytest.mark.asyncio
async def test_previous_session_template_maps_exercises_without_session_ids():
    previous = SimpleNamespace(
        id=uuid4(),
        date=date(2026, 4, 30),
        day_label="Lunes",
        sport_type=None,
        notes="buena sesion",
        exercises=[
            SimpleNamespace(
                name="Press inclinado",
                display_order=0,
                notes=None,
                sets=[
                    SimpleNamespace(set_number=1, reps=10, weight_kg=40.0, notes=None),
                ],
            )
        ],
    )
    service = WorkoutService(db=object())
    service.repo = FakeWorkoutRepo(previous)

    result = await service.get_previous_session_template(
        "user-1",
        weekday=0,
        before_date=date(2026, 5, 7),
        category="gym",
    )

    assert result.source_session_id == previous.id
    assert result.source_date == previous.date
    assert result.exercises[0].name == "Press inclinado"
    assert result.exercises[0].sets[0].reps == 10
