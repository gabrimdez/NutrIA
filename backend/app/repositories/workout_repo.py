"""
Acceso a datos de entrenamiento. Todas las consultas filtran por ``user_id``;
ese valor debe provenir solo del JWT (servicios), nunca de entrada arbitraria del cliente.
"""

from typing import List, Optional
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select, func, desc, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import (
    WorkoutRoutine, WorkoutRoutineDay, WorkoutRoutineExercise,
    WorkoutSession, WorkoutSessionExercise, WorkoutExerciseSet,
)


class WorkoutRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Routines
    # ------------------------------------------------------------------

    async def list_routines(self, user_id: str) -> List[WorkoutRoutine]:
        stmt = (
            select(WorkoutRoutine)
            .where(WorkoutRoutine.user_id == user_id)
            .order_by(desc(WorkoutRoutine.updated_at))
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_routines_with_days(self, user_id: str) -> List[WorkoutRoutine]:
        """Lista rutinas precargando `days` (sin ejercicios) para el resumen semanal."""
        stmt = (
            select(WorkoutRoutine)
            .options(selectinload(WorkoutRoutine.days))
            .where(WorkoutRoutine.user_id == user_id)
            .order_by(desc(WorkoutRoutine.updated_at))
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_routine(self, user_id: str, routine_id: UUID) -> Optional[WorkoutRoutine]:
        stmt = (
            select(WorkoutRoutine)
            .options(
                selectinload(WorkoutRoutine.days)
                .selectinload(WorkoutRoutineDay.exercises)
            )
            .where(WorkoutRoutine.id == routine_id, WorkoutRoutine.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create_routine(self, user_id: str, **kwargs) -> WorkoutRoutine:
        routine = WorkoutRoutine(user_id=user_id, **kwargs)
        self.db.add(routine)
        await self.db.flush()
        return routine

    async def update_routine(self, routine: WorkoutRoutine, **kwargs) -> WorkoutRoutine:
        for k, v in kwargs.items():
            if v is not None:
                setattr(routine, k, v)
        await self.db.flush()
        return routine

    async def delete_routine(self, routine: WorkoutRoutine) -> None:
        await self.db.delete(routine)
        await self.db.flush()

    async def deactivate_all_routines(self, user_id: str, category: str) -> None:
        stmt = (
            select(WorkoutRoutine)
            .where(WorkoutRoutine.user_id == user_id, WorkoutRoutine.category == category, WorkoutRoutine.is_active == True)
        )
        result = await self.db.execute(stmt)
        for r in result.scalars().all():
            r.is_active = False
        await self.db.flush()

    async def replace_routine_days(self, routine: WorkoutRoutine, days_data: list) -> None:
        await self.db.execute(
            delete(WorkoutRoutineDay).where(WorkoutRoutineDay.routine_id == routine.id)
        )
        await self.db.flush()
        for d in days_data:
            exercises = d.pop("exercises", [])
            day = WorkoutRoutineDay(routine_id=routine.id, **d)
            self.db.add(day)
            await self.db.flush()
            for ex in exercises:
                self.db.add(WorkoutRoutineExercise(routine_day_id=day.id, **ex))
        await self.db.flush()

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    async def list_sessions(
        self, user_id: str, category: Optional[str] = None,
        from_date: Optional[date] = None, to_date: Optional[date] = None,
        limit: int = 50,
    ) -> List[WorkoutSession]:
        stmt = select(WorkoutSession).where(WorkoutSession.user_id == user_id)
        if category:
            stmt = stmt.where(WorkoutSession.category == category)
        if from_date:
            stmt = stmt.where(WorkoutSession.date >= from_date)
        if to_date:
            stmt = stmt.where(WorkoutSession.date <= to_date)
        stmt = stmt.order_by(desc(WorkoutSession.date), desc(WorkoutSession.created_at)).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_session(self, user_id: str, session_id: UUID) -> Optional[WorkoutSession]:
        stmt = (
            select(WorkoutSession)
            .options(
                selectinload(WorkoutSession.exercises)
                .selectinload(WorkoutSessionExercise.sets)
            )
            .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create_session(self, user_id: str, **kwargs) -> WorkoutSession:
        exercises_data = kwargs.pop("exercises", [])
        session = WorkoutSession(user_id=user_id, **kwargs)
        self.db.add(session)
        await self.db.flush()
        await self._add_session_exercises(session.id, exercises_data)
        return session

    async def update_session(self, session: WorkoutSession, **kwargs) -> WorkoutSession:
        exercises_data = kwargs.pop("exercises", None)
        for k, v in kwargs.items():
            if v is not None:
                setattr(session, k, v)
        if exercises_data is not None:
            await self.db.execute(
                delete(WorkoutSessionExercise).where(WorkoutSessionExercise.session_id == session.id)
            )
            await self.db.flush()
            await self._add_session_exercises(session.id, exercises_data)
        await self.db.flush()
        return session

    async def delete_session(self, session: WorkoutSession) -> None:
        await self.db.delete(session)
        await self.db.flush()

    async def _add_session_exercises(self, session_id: UUID, exercises: list) -> None:
        for ex_data in exercises:
            sets_data = ex_data.pop("sets", [])
            exercise = WorkoutSessionExercise(session_id=session_id, **ex_data)
            self.db.add(exercise)
            await self.db.flush()
            for s in sets_data:
                self.db.add(WorkoutExerciseSet(exercise_id=exercise.id, **s))
        await self.db.flush()

    # ------------------------------------------------------------------
    # Copy previous session
    # ------------------------------------------------------------------

    async def find_session_for_day(
        self,
        user_id: str,
        *,
        on_date: date,
        routine_id: Optional[UUID] = None,
        routine_day_id: Optional[UUID] = None,
        category: Optional[str] = None,
    ) -> Optional[WorkoutSession]:
        """Devuelve la sesión existente para idempotencia de quick-complete.

        Empareja por `(user, date, routine_id, routine_day_id)`. Cuando no hay
        ``routine_id`` (registro libre), permite filtrar por categoría para
        evitar duplicados accidentales del mismo deporte el mismo día.
        """
        stmt = select(WorkoutSession).where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.date == on_date,
        )
        if routine_id is not None:
            stmt = stmt.where(WorkoutSession.routine_id == routine_id)
        if routine_day_id is not None:
            stmt = stmt.where(WorkoutSession.routine_day_id == routine_day_id)
        if category is not None and routine_id is None:
            stmt = stmt.where(WorkoutSession.category == category)
        stmt = stmt.order_by(desc(WorkoutSession.created_at)).limit(1)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def find_previous_session(self, user_id: str, weekday: int, before_date: date, category: str = "gym") -> Optional[WorkoutSession]:
        stmt = (
            select(WorkoutSession)
            .options(
                selectinload(WorkoutSession.exercises)
                .selectinload(WorkoutSessionExercise.sets)
            )
            .where(
                WorkoutSession.user_id == user_id,
                WorkoutSession.weekday == weekday,
                WorkoutSession.date < before_date,
                WorkoutSession.category == category,
                WorkoutSession.exercises.any(),
            )
            .order_by(desc(WorkoutSession.date))
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    # ------------------------------------------------------------------
    # Distinct exercise names
    # ------------------------------------------------------------------

    async def get_distinct_exercise_names(self, user_id: str) -> List[str]:
        stmt = (
            select(func.min(WorkoutSessionExercise.name))
            .join(WorkoutSession, WorkoutSession.id == WorkoutSessionExercise.session_id)
            .where(WorkoutSession.user_id == user_id, WorkoutSession.completed == True)
            .group_by(func.lower(WorkoutSessionExercise.name))
            .order_by(func.lower(WorkoutSessionExercise.name))
        )
        result = await self.db.execute(stmt)
        return [r[0] for r in result.all()]

    # ------------------------------------------------------------------
    # Exercise history (detailed)
    # ------------------------------------------------------------------

    async def get_exercise_history(self, user_id: str, exercise_name: str, limit: int = 30) -> list:
        stmt = (
            select(
                WorkoutSession.date,
                WorkoutSession.day_label,
                WorkoutSessionExercise.display_order,
                WorkoutSessionExercise.id.label("exercise_id"),
            )
            .join(WorkoutSessionExercise, WorkoutSessionExercise.session_id == WorkoutSession.id)
            .where(
                WorkoutSession.user_id == user_id,
                func.lower(WorkoutSessionExercise.name) == exercise_name.lower(),
            )
            .order_by(desc(WorkoutSession.date))
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        exercise_ids = [r.exercise_id for r in rows]
        sets_stmt = (
            select(WorkoutExerciseSet)
            .where(WorkoutExerciseSet.exercise_id.in_(exercise_ids))
            .order_by(WorkoutExerciseSet.set_number)
        )
        sets_result = await self.db.execute(sets_stmt)
        all_sets = sets_result.scalars().all()

        sets_by_exercise: dict = {}
        for s in all_sets:
            sets_by_exercise.setdefault(s.exercise_id, []).append(s)

        history = []
        for r in rows:
            ex_sets = sets_by_exercise.get(r.exercise_id, [])
            weights = [s.weight_kg for s in ex_sets if s.weight_kg is not None]
            reps_vals = [s.reps for s in ex_sets if s.reps is not None]
            volume = sum((s.weight_kg or 0) * (s.reps or 0) for s in ex_sets)
            history.append({
                "date": r.date,
                "day_label": r.day_label,
                "display_order": r.display_order,
                "max_weight_kg": max(weights) if weights else None,
                "total_volume": volume if volume > 0 else None,
                "best_set_reps": max(reps_vals) if reps_vals else None,
                "sets_count": len(ex_sets),
                "sets": [
                    {"set_number": s.set_number, "reps": s.reps, "weight_kg": s.weight_kg}
                    for s in ex_sets
                ],
            })
        return history

    # ------------------------------------------------------------------
    # Week summary
    # ------------------------------------------------------------------

    async def count_completed_sessions(self, user_id: str, from_date: date, to_date: date) -> int:
        stmt = (
            select(func.count(WorkoutSession.id))
            .where(
                WorkoutSession.user_id == user_id,
                WorkoutSession.date >= from_date,
                WorkoutSession.date <= to_date,
                WorkoutSession.completed == True,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def get_sessions_in_range(self, user_id: str, from_date: date, to_date: date) -> List[WorkoutSession]:
        stmt = (
            select(WorkoutSession)
            .where(
                WorkoutSession.user_id == user_id,
                WorkoutSession.date >= from_date,
                WorkoutSession.date <= to_date,
            )
            .order_by(WorkoutSession.date)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
