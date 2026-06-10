import logging
from datetime import date, timedelta
from typing import Optional, List
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.workout_repo import WorkoutRepository
from app.schemas.workout import (
    RoutineCreate, RoutineUpdate, RoutineOut,
    SessionCreate, SessionUpdate, SessionOut,
    QuickCompleteRoutine, QuickCompleteOther,
    ExerciseHistoryPoint, ExerciseHistorySet, PreviousSessionTemplate,
    WeekSummary, WeekDayPlan, WeekDayObjective, SessionListItem,
)

logger = logging.getLogger(__name__)


class WorkoutService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = WorkoutRepository(db)

    # ------------------------------------------------------------------
    # Routines
    # ------------------------------------------------------------------

    async def list_routines(self, user_id: str):
        return await self.repo.list_routines(user_id)

    async def get_routine(self, user_id: str, routine_id: UUID) -> RoutineOut:
        routine = await self.repo.get_routine(user_id, routine_id)
        if not routine:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rutina no encontrada.")
        return RoutineOut.model_validate(routine)

    async def create_routine(self, user_id: str, data: RoutineCreate) -> RoutineOut:
        routine = await self.repo.create_routine(
            user_id=user_id,
            name=data.name,
            category=data.category.value,
            sport_type=data.sport_type,
            days_per_week=data.days_per_week,
            is_active=True,
        )
        await self.repo.deactivate_all_routines(user_id, data.category.value)
        routine.is_active = True
        await self.db.flush()

        if data.days:
            days_payload = [
                {
                    "weekday": d.weekday,
                    "label": d.label,
                    "display_order": d.display_order,
                    "exercises": [ex.model_dump() for ex in d.exercises],
                }
                for d in data.days
            ]
            await self.repo.replace_routine_days(routine, days_payload)

        full = await self.repo.get_routine(user_id, routine.id)
        return RoutineOut.model_validate(full)

    async def update_routine(self, user_id: str, routine_id: UUID, data: RoutineUpdate) -> RoutineOut:
        routine = await self.repo.get_routine(user_id, routine_id)
        if not routine:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rutina no encontrada.")

        update_fields = {}
        if data.name is not None:
            update_fields["name"] = data.name
        if data.sport_type is not None:
            update_fields["sport_type"] = data.sport_type
        if data.days_per_week is not None:
            update_fields["days_per_week"] = data.days_per_week

        if update_fields:
            await self.repo.update_routine(routine, **update_fields)

        if data.days is not None:
            days_payload = [
                {
                    "weekday": d.weekday,
                    "label": d.label,
                    "display_order": d.display_order,
                    "exercises": [ex.model_dump() for ex in d.exercises],
                }
                for d in data.days
            ]
            await self.repo.replace_routine_days(routine, days_payload)

        full = await self.repo.get_routine(user_id, routine.id)
        return RoutineOut.model_validate(full)

    async def delete_routine(self, user_id: str, routine_id: UUID) -> None:
        routine = await self.repo.get_routine(user_id, routine_id)
        if not routine:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rutina no encontrada.")
        await self.repo.delete_routine(routine)

    async def activate_routine(self, user_id: str, routine_id: UUID) -> RoutineOut:
        routine = await self.repo.get_routine(user_id, routine_id)
        if not routine:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rutina no encontrada.")
        await self.repo.deactivate_all_routines(user_id, routine.category.value if hasattr(routine.category, 'value') else routine.category)
        routine.is_active = True
        await self.db.flush()
        full = await self.repo.get_routine(user_id, routine.id)
        return RoutineOut.model_validate(full)

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    async def list_sessions(self, user_id: str, category: Optional[str] = None,
                            from_date: Optional[date] = None, to_date: Optional[date] = None):
        return await self.repo.list_sessions(user_id, category, from_date, to_date)

    async def get_session(self, user_id: str, session_id: UUID) -> SessionOut:
        session = await self.repo.get_session(user_id, session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada.")
        return SessionOut.model_validate(session)

    async def create_session(self, user_id: str, data: SessionCreate) -> SessionOut:
        exercises_payload = [
            {
                "name": ex.name,
                "display_order": ex.display_order,
                "notes": ex.notes,
                "sets": [s.model_dump() for s in ex.sets],
            }
            for ex in data.exercises
        ]
        session = await self.repo.create_session(
            user_id=user_id,
            routine_id=data.routine_id,
            routine_day_id=data.routine_day_id,
            category=data.category.value,
            date=data.date,
            weekday=data.weekday,
            day_label=data.day_label,
            sport_type=data.sport_type,
            free_text=data.free_text,
            completed=data.completed,
            notes=data.notes,
            exercises=exercises_payload,
        )
        full = await self.repo.get_session(user_id, session.id)
        return SessionOut.model_validate(full)

    async def update_session(self, user_id: str, session_id: UUID, data: SessionUpdate) -> SessionOut:
        session = await self.repo.get_session(user_id, session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada.")

        update_kwargs: dict = {}
        for field in ("day_label", "sport_type", "free_text", "completed", "notes"):
            val = getattr(data, field)
            if val is not None:
                update_kwargs[field] = val

        if data.exercises is not None:
            update_kwargs["exercises"] = [
                {
                    "name": ex.name,
                    "display_order": ex.display_order,
                    "notes": ex.notes,
                    "sets": [s.model_dump() for s in ex.sets],
                }
                for ex in data.exercises
            ]

        await self.repo.update_session(session, **update_kwargs)
        full = await self.repo.get_session(user_id, session.id)
        return SessionOut.model_validate(full)

    async def delete_session(self, user_id: str, session_id: UUID) -> None:
        session = await self.repo.get_session(user_id, session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada.")
        await self.repo.delete_session(session)

    async def quick_complete_routine(self, user_id: str, data: QuickCompleteRoutine) -> SessionOut:
        """Crea (o devuelve) una sesión completed=true para una rutina hoy.

        - Idempotente por `(user, date, routine_id, routine_day_id)`.
        - Toma `default_sets`/`default_reps` de los ejercicios para que la sesión
          quede precargada con los huecos de cada serie (vacíos), de modo que
          luego el usuario pueda editar pesos sin tener que reconstruir nada.
        """
        target_date = data.date or date.today()
        weekday = target_date.weekday()

        routine = await self.repo.get_routine(user_id, data.routine_id)
        if not routine:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rutina no encontrada.")

        # Resolver el día de la rutina aplicable.
        chosen_day = None
        if data.routine_day_id is not None:
            chosen_day = next((d for d in routine.days if d.id == data.routine_day_id), None)
            if chosen_day is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Día de rutina no encontrado.")
        else:
            chosen_day = next((d for d in routine.days if d.weekday == weekday), None)

        # Idempotencia: ya existe una sesión para ese (rutina, día) hoy.
        existing = await self.repo.find_session_for_day(
            user_id,
            on_date=target_date,
            routine_id=routine.id,
            routine_day_id=chosen_day.id if chosen_day else None,
        )
        if existing is not None:
            if not existing.completed:
                existing.completed = True
                await self.db.flush()
            full = await self.repo.get_session(user_id, existing.id)
            return SessionOut.model_validate(full)

        # Construir ejercicios precargados con sets vacíos.
        exercises_payload: list[dict] = []
        if chosen_day is not None:
            for ex in chosen_day.exercises:
                sets_count = ex.default_sets or 3
                sets_count = max(1, min(int(sets_count), 30))
                exercises_payload.append({
                    "name": ex.name,
                    "display_order": ex.display_order,
                    "notes": ex.notes,
                    "sets": [
                        {"set_number": i + 1, "reps": None, "weight_kg": None, "notes": None}
                        for i in range(sets_count)
                    ],
                })

        category_value = routine.category.value if hasattr(routine.category, "value") else routine.category
        session = await self.repo.create_session(
            user_id=user_id,
            routine_id=routine.id,
            routine_day_id=chosen_day.id if chosen_day else None,
            category=category_value,
            date=target_date,
            weekday=weekday,
            day_label=chosen_day.label if chosen_day else None,
            sport_type=routine.sport_type,
            free_text=None,
            completed=True,
            notes=data.notes,
            exercises=exercises_payload,
        )
        full = await self.repo.get_session(user_id, session.id)
        return SessionOut.model_validate(full)

    async def quick_complete_other(self, user_id: str, data: QuickCompleteOther) -> SessionOut:
        """Crea (o devuelve) una sesión completed=true de otro deporte hoy."""
        target_date = data.date or date.today()
        weekday = target_date.weekday()

        routine = None
        sport_type = (data.sport_type or "").strip() or None
        category_value = "other"
        routine_day_id = None

        if data.routine_id is not None:
            routine = await self.repo.get_routine(user_id, data.routine_id)
            if not routine:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rutina no encontrada.")
            category_value = routine.category.value if hasattr(routine.category, "value") else routine.category
            if not sport_type:
                sport_type = routine.sport_type
            day_match = next((d for d in routine.days if d.weekday == weekday), None)
            if day_match is not None:
                routine_day_id = day_match.id

        existing = await self.repo.find_session_for_day(
            user_id,
            on_date=target_date,
            routine_id=routine.id if routine else None,
            routine_day_id=routine_day_id,
            category=category_value,
        )
        if existing is not None:
            if not existing.completed:
                existing.completed = True
                await self.db.flush()
            full = await self.repo.get_session(user_id, existing.id)
            return SessionOut.model_validate(full)

        free_text_parts: list[str] = []
        if data.duration_min is not None:
            free_text_parts.append(f"{data.duration_min} min")
        if data.free_text and data.free_text.strip():
            free_text_parts.append(data.free_text.strip())
        free_text = " · ".join(free_text_parts) if free_text_parts else None

        session = await self.repo.create_session(
            user_id=user_id,
            routine_id=routine.id if routine else None,
            routine_day_id=routine_day_id,
            category=category_value,
            date=target_date,
            weekday=weekday,
            day_label=None,
            sport_type=sport_type,
            free_text=free_text,
            completed=True,
            notes=data.notes,
            exercises=[],
        )
        full = await self.repo.get_session(user_id, session.id)
        return SessionOut.model_validate(full)

    async def complete_session(self, user_id: str, session_id: UUID) -> SessionOut:
        session = await self.repo.get_session(user_id, session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada.")
        session.completed = True
        await self.db.flush()
        full = await self.repo.get_session(user_id, session.id)
        return SessionOut.model_validate(full)

    async def copy_previous_session(self, user_id: str, session_id: UUID) -> SessionOut:
        session = await self.repo.get_session(user_id, session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada.")

        previous = await self.repo.find_previous_session(
            user_id, session.weekday, session.date, session.category.value if hasattr(session.category, 'value') else session.category
        )
        if not previous:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No hay sesión anterior del mismo día de la semana.")

        exercises_payload = []
        for ex in previous.exercises:
            sets_payload = [
                {"set_number": s.set_number, "reps": s.reps, "weight_kg": s.weight_kg, "notes": s.notes}
                for s in ex.sets
            ]
            exercises_payload.append({
                "name": ex.name,
                "display_order": ex.display_order,
                "notes": ex.notes,
                "sets": sets_payload,
            })

        await self.repo.update_session(session, exercises=exercises_payload)
        full = await self.repo.get_session(user_id, session.id)
        return SessionOut.model_validate(full)

    async def get_previous_session_template(
        self,
        user_id: str,
        *,
        weekday: int,
        before_date: date,
        category: str = "gym",
    ) -> PreviousSessionTemplate:
        previous = await self.repo.find_previous_session(user_id, weekday, before_date, category)
        if not previous:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No hay entrenamiento anterior para copiar.")

        return PreviousSessionTemplate(
            source_session_id=previous.id,
            source_date=previous.date,
            day_label=previous.day_label,
            sport_type=previous.sport_type,
            notes=previous.notes,
            exercises=[
                {
                    "name": ex.name,
                    "display_order": ex.display_order,
                    "notes": ex.notes,
                    "sets": [
                        {
                            "set_number": s.set_number,
                            "reps": s.reps,
                            "weight_kg": s.weight_kg,
                            "notes": s.notes,
                        }
                        for s in ex.sets
                    ],
                }
                for ex in previous.exercises
            ],
        )

    # ------------------------------------------------------------------
    # Distinct exercise names
    # ------------------------------------------------------------------

    async def get_distinct_exercises(self, user_id: str) -> List[str]:
        return await self.repo.get_distinct_exercise_names(user_id)

    # ------------------------------------------------------------------
    # Exercise history
    # ------------------------------------------------------------------

    async def get_exercise_history(self, user_id: str, exercise_name: str, limit: int = 30) -> List[ExerciseHistoryPoint]:
        rows = await self.repo.get_exercise_history(user_id, exercise_name, limit)
        return [ExerciseHistoryPoint(**r) for r in reversed(rows)]

    # ------------------------------------------------------------------
    # Week summary
    # ------------------------------------------------------------------

    async def get_week_summary(self, user_id: str, ref_date: Optional[date] = None) -> WeekSummary:
        """
        Resumen semanal por día.

        Cada `weekday` puede tener varios objetivos (uno por cada rutina activa que
        defina ese día). Un día solo cuenta como completado cuando TODAS sus
        sesiones planificadas se han marcado como completadas. `planned_days` y
        `completed_days` cuentan días enteros, no sesiones sueltas.
        """
        d = ref_date or date.today()
        week_start = d - timedelta(days=d.weekday())
        week_end = week_start + timedelta(days=6)

        sessions = await self.repo.get_sessions_in_range(user_id, week_start, week_end)
        routines = await self.repo.list_routines_with_days(user_id)
        active = [r for r in routines if r.is_active]

        def _cat(value) -> str:
            return value.value if hasattr(value, "value") else value

        # Agrupar (rutina, día) por weekday.
        plans_by_weekday: dict[int, list[tuple]] = {wd: [] for wd in range(7)}
        for r in active:
            for rd in r.days:
                if 0 <= rd.weekday <= 6:
                    plans_by_weekday[rd.weekday].append((r, rd))

        used_session_ids: set = set()
        week_days: list[WeekDayPlan] = []

        for wd in range(7):
            day_date = week_start + timedelta(days=wd)
            objectives_in_day = plans_by_weekday[wd]
            objectives: list[WeekDayObjective] = []

            for (r, rd) in objectives_in_day:
                routine_cat = _cat(r.category)
                # 1) Match preferente: misma rutina + misma fecha + completada.
                matched = next(
                    (
                        s for s in sessions
                        if s.id not in used_session_ids
                        and s.date == day_date
                        and s.completed
                        and s.routine_id == r.id
                    ),
                    None,
                )
                # 2) Fallback: sesión sin rutina pero misma categoría/fecha completada.
                if matched is None:
                    matched = next(
                        (
                            s for s in sessions
                            if s.id not in used_session_ids
                            and s.date == day_date
                            and s.completed
                            and s.routine_id is None
                            and _cat(s.category) == routine_cat
                        ),
                        None,
                    )
                if matched is not None:
                    used_session_ids.add(matched.id)

                objectives.append(WeekDayObjective(
                    routine_id=r.id,
                    routine_name=r.name,
                    routine_day_id=rd.id,
                    day_label=rd.label,
                    category=routine_cat,
                    sport_type=r.sport_type,
                    weekday=wd,
                    completed=matched is not None,
                    session_id=matched.id if matched is not None else None,
                ))

            total = len(objectives)
            completed_count = sum(1 for o in objectives if o.completed)
            week_days.append(WeekDayPlan(
                weekday=wd,
                date=day_date,
                total=total,
                completed_count=completed_count,
                is_complete=total > 0 and completed_count == total,
                objectives=objectives,
            ))

        planned_days = sum(1 for wd in week_days if wd.total > 0)
        completed_days = sum(1 for wd in week_days if wd.is_complete)

        return WeekSummary(
            week_start=week_start,
            planned_days=planned_days,
            completed_days=completed_days,
            sessions=[SessionListItem.model_validate(s) for s in sessions],
            days=week_days,
        )
