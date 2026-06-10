"""Tests para los endpoints/servicios de marcado rápido y para el resumen semanal
resultante (`WeekSummary`) tras usar quick-complete.

Se usa el mismo patrón de fakes minimalistas que en `test_workout_previous_template.py`
para no depender de la sesión SQLAlchemy real.
"""

from datetime import date, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.schemas.workout import (
    QuickCompleteRoutine,
    QuickCompleteOther,
)
from app.services.workout_service import WorkoutService


def _make_routine(*, category: str, days: list[dict] | None = None, is_active: bool = True, sport_type: str | None = None):
    rid = uuid4()
    day_objs = []
    for d in days or []:
        day_objs.append(SimpleNamespace(
            id=uuid4(),
            weekday=d["weekday"],
            label=d["label"],
            display_order=d.get("display_order", 0),
            exercises=[
                SimpleNamespace(
                    name=ex["name"],
                    display_order=ex.get("display_order", i),
                    default_sets=ex.get("default_sets"),
                    default_reps=ex.get("default_reps"),
                    notes=None,
                )
                for i, ex in enumerate(d.get("exercises", []))
            ],
        ))
    return SimpleNamespace(
        id=rid,
        user_id="user-1",
        name=f"Rutina {category}",
        category=category,
        sport_type=sport_type,
        is_active=is_active,
        days_per_week=len(day_objs),
        days=day_objs,
        created_at=datetime(2026, 5, 1),
        updated_at=datetime(2026, 5, 1),
    )


def _empty_session_record(**overrides):
    base = dict(
        id=uuid4(),
        user_id="user-1",
        routine_id=None,
        routine_day_id=None,
        category="gym",
        date=date.today(),
        weekday=date.today().weekday(),
        day_label=None,
        sport_type=None,
        free_text=None,
        completed=False,
        notes=None,
        exercises=[],
        created_at=datetime(2026, 5, 1),
        updated_at=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class FakeRepo:
    """Fake mínimo del repositorio para guiar el flujo de quick-complete."""

    def __init__(self, *, routine=None, existing_session=None):
        self.routine = routine
        self.existing_session = existing_session
        self.created_payload = None
        self._created = None

    async def get_routine(self, user_id, routine_id):
        return self.routine if (self.routine and self.routine.id == routine_id) else None

    async def find_session_for_day(self, user_id, *, on_date, routine_id=None, routine_day_id=None, category=None):
        if self.existing_session is None:
            return None
        s = self.existing_session
        if s.date != on_date:
            return None
        if routine_id is not None and s.routine_id != routine_id:
            return None
        if routine_day_id is not None and s.routine_day_id != routine_day_id:
            return None
        if category is not None and routine_id is None and s.category != category:
            return None
        return s

    async def create_session(self, **kwargs):
        self.created_payload = kwargs
        exercises = kwargs.pop("exercises", [])
        ex_objs = []
        for ex in exercises:
            ex_objs.append(SimpleNamespace(
                id=uuid4(),
                name=ex["name"],
                display_order=ex.get("display_order", 0),
                notes=ex.get("notes"),
                sets=[
                    SimpleNamespace(
                        id=uuid4(),
                        set_number=s["set_number"],
                        reps=s.get("reps"),
                        weight_kg=s.get("weight_kg"),
                        notes=s.get("notes"),
                    )
                    for s in ex.get("sets", [])
                ],
            ))
        self._created = SimpleNamespace(
            id=uuid4(),
            user_id="user-1",
            routine_id=kwargs.get("routine_id"),
            routine_day_id=kwargs.get("routine_day_id"),
            category=kwargs.get("category"),
            date=kwargs.get("date"),
            weekday=kwargs.get("weekday"),
            day_label=kwargs.get("day_label"),
            sport_type=kwargs.get("sport_type"),
            free_text=kwargs.get("free_text"),
            completed=kwargs.get("completed", False),
            notes=kwargs.get("notes"),
            exercises=ex_objs,
            created_at=datetime(2026, 5, 1),
            updated_at=None,
        )
        return self._created

    async def get_session(self, user_id, session_id):
        if self._created and self._created.id == session_id:
            return self._created
        if self.existing_session and self.existing_session.id == session_id:
            return self.existing_session
        return None


class FlushDb:
    async def flush(self):
        return None


# ---------------------------------------------------------------------------
# quick_complete_routine (gym)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_quick_complete_routine_creates_session_with_default_sets():
    today = date.today()
    routine = _make_routine(
        category="gym",
        days=[{
            "weekday": today.weekday(),
            "label": "Push",
            "exercises": [
                {"name": "Press banca", "default_sets": 3, "default_reps": "10"},
                {"name": "Press militar", "default_sets": 4, "default_reps": "8"},
            ],
        }],
    )
    service = WorkoutService(db=FlushDb())
    repo = FakeRepo(routine=routine)
    service.repo = repo

    result = await service.quick_complete_routine(
        "user-1",
        QuickCompleteRoutine(routine_id=routine.id),
    )

    assert result.completed is True
    assert result.routine_id == routine.id
    assert result.day_label == "Push"
    assert result.category == "gym"
    assert len(result.exercises) == 2
    assert len(result.exercises[0].sets) == 3
    assert len(result.exercises[1].sets) == 4
    # Sets se crean vacíos para que el usuario pueda editar pesos luego.
    assert all(s.reps is None and s.weight_kg is None for ex in result.exercises for s in ex.sets)


@pytest.mark.asyncio
async def test_quick_complete_routine_is_idempotent():
    today = date.today()
    routine = _make_routine(
        category="gym",
        days=[{"weekday": today.weekday(), "label": "Push", "exercises": []}],
    )
    routine_day_id = routine.days[0].id
    existing = _empty_session_record(
        routine_id=routine.id,
        routine_day_id=routine_day_id,
        category="gym",
        date=today,
        weekday=today.weekday(),
        completed=True,
    )
    service = WorkoutService(db=FlushDb())
    repo = FakeRepo(routine=routine, existing_session=existing)
    service.repo = repo

    result = await service.quick_complete_routine(
        "user-1",
        QuickCompleteRoutine(routine_id=routine.id),
    )

    assert result.id == existing.id
    assert result.completed is True
    assert repo.created_payload is None  # no se ha creado nada nuevo


@pytest.mark.asyncio
async def test_quick_complete_routine_completes_existing_draft():
    today = date.today()
    routine = _make_routine(
        category="gym",
        days=[{"weekday": today.weekday(), "label": "Push", "exercises": []}],
    )
    routine_day_id = routine.days[0].id
    draft = _empty_session_record(
        routine_id=routine.id,
        routine_day_id=routine_day_id,
        category="gym",
        date=today,
        weekday=today.weekday(),
        completed=False,
    )
    service = WorkoutService(db=FlushDb())
    repo = FakeRepo(routine=routine, existing_session=draft)
    service.repo = repo

    result = await service.quick_complete_routine(
        "user-1",
        QuickCompleteRoutine(routine_id=routine.id),
    )

    assert result.id == draft.id
    assert result.completed is True
    assert draft.completed is True


# ---------------------------------------------------------------------------
# quick_complete_other
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_quick_complete_other_serialises_duration_into_free_text():
    service = WorkoutService(db=FlushDb())
    service.repo = FakeRepo()

    result = await service.quick_complete_other(
        "user-1",
        QuickCompleteOther(sport_type="Running", duration_min=30, notes="zona 2"),
    )

    assert result.completed is True
    assert result.category == "other"
    assert result.sport_type == "Running"
    assert result.free_text == "30 min"
    assert result.notes == "zona 2"


@pytest.mark.asyncio
async def test_quick_complete_other_with_routine_uses_sport_and_day():
    today = date.today()
    routine = _make_routine(
        category="other",
        sport_type="Running",
        days=[{"weekday": today.weekday(), "label": "Tirada larga", "exercises": []}],
    )
    service = WorkoutService(db=FlushDb())
    service.repo = FakeRepo(routine=routine)

    result = await service.quick_complete_other(
        "user-1",
        QuickCompleteOther(routine_id=routine.id, duration_min=45, free_text="zona 2"),
    )

    assert result.routine_id == routine.id
    assert result.routine_day_id == routine.days[0].id
    assert result.sport_type == "Running"
    assert result.free_text == "45 min · zona 2"


# ---------------------------------------------------------------------------
# WeekSummary tras quick-complete: el día queda is_complete cuando se cubren
# todos los objetivos del weekday.
# ---------------------------------------------------------------------------

class FakeRepoForWeek:
    """Repo más completo para reproducir el flujo de get_week_summary."""

    def __init__(self, *, routines, sessions):
        self._routines = routines
        self._sessions = sessions

    async def list_routines_with_days(self, user_id):
        return list(self._routines)

    async def get_sessions_in_range(self, user_id, from_date, to_date):
        return [s for s in self._sessions if from_date <= s.date <= to_date]


@pytest.mark.asyncio
async def test_week_summary_marks_day_complete_when_all_objectives_done():
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    target_date = week_start + timedelta(days=2)  # un miércoles concreto

    gym = _make_routine(
        category="gym",
        is_active=True,
        days=[{"weekday": 2, "label": "Push", "exercises": []}],
    )
    running = _make_routine(
        category="other",
        sport_type="Running",
        is_active=True,
        days=[{"weekday": 2, "label": "Tirada", "exercises": []}],
    )

    sess_gym = _empty_session_record(
        routine_id=gym.id,
        routine_day_id=gym.days[0].id,
        category="gym",
        date=target_date,
        weekday=2,
        completed=True,
    )
    # Un día sin la sesión de running aún → debe quedar incompleto.
    service = WorkoutService(db=FlushDb())
    service.repo = FakeRepoForWeek(routines=[gym, running], sessions=[sess_gym])
    summary = await service.get_week_summary("user-1", today)
    day = next(d for d in summary.days if d.weekday == 2)
    assert day.total == 2
    assert day.completed_count == 1
    assert day.is_complete is False
    assert summary.completed_days == 0

    # Tras quick-complete del running, el día debe pasar a completado.
    sess_run = _empty_session_record(
        routine_id=running.id,
        routine_day_id=running.days[0].id,
        category="other",
        date=target_date,
        weekday=2,
        completed=True,
    )
    service.repo = FakeRepoForWeek(routines=[gym, running], sessions=[sess_gym, sess_run])
    summary = await service.get_week_summary("user-1", today)
    day = next(d for d in summary.days if d.weekday == 2)
    assert day.total == 2
    assert day.completed_count == 2
    assert day.is_complete is True
    assert summary.completed_days == 1
    assert summary.planned_days == 1
