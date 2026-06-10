import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.workout_estimate import estimate_workout_from_text
from app.repositories.progress_repo import ProgressRepository
from app.repositories.profile_repo import ProfileRepository
from app.rules.plateau_rules import analyze_plateau
from app.schemas.progress import ActivityDayResponse, EstimateTrainingResponse
from app.services.meal_service import MealService

logger = logging.getLogger(__name__)


class ProgressService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.progress_repo = ProgressRepository(db)
        self.profile_repo = ProfileRepository(db)

    async def log_weight(self, user_id: str, weight_kg: float,
                          log_date: date, notes: Optional[str] = None):
        log = await self.progress_repo.log_weight(user_id, weight_kg, log_date, notes)

        profile = await self.profile_repo.get_by_user_id(user_id)
        if profile:
            await self.profile_repo.update_profile(user_id, current_weight_kg=weight_kg)

        from app.services.badge_integration import fire_weight_logged

        await fire_weight_logged(self.db, user_id, log_date)
        return log

    async def get_weight_history(self, user_id: str, days: int = 90):
        return await self.progress_repo.get_weight_history(user_id, days)

    async def log_activity(self, user_id: str, log_date: date, **kwargs):
        row = await self.progress_repo.log_activity(user_id, log_date, **kwargs)
        steps = kwargs.get("steps")
        dur = kwargs.get("training_duration_min")
        if (steps is not None and int(steps or 0) > 0) or (dur is not None and int(dur or 0) > 0):
            from app.services.badge_integration import fire_activity_day_logged

            await fire_activity_day_logged(self.db, user_id, log_date)
        return row

    async def get_activity_day(self, user_id: str, log_date: date) -> ActivityDayResponse:
        row = await self.progress_repo.get_latest_activity(user_id, log_date)
        if not row:
            return ActivityDayResponse(date=log_date)
        return ActivityDayResponse(
            date=row.date,
            steps=row.steps,
            training_type=row.training_type,
            training_duration_min=row.training_duration_min,
            notes=row.notes,
            estimated_burn_kcal=row.estimated_burn_kcal,
        )

    async def estimate_training(self, text: str) -> Optional[EstimateTrainingResponse]:
        ai = await estimate_workout_from_text(text)
        if not ai:
            return None
        return EstimateTrainingResponse(
            estimated_kcal=float(ai.estimated_kcal),
            duration_min=ai.duration_min,
            summary_es=(ai.summary_es or "").strip(),
            confidence=ai.confidence,
        )

    async def get_progress_summary(self, user_id: str) -> dict:
        weight_history = await self.progress_repo.get_weight_history(user_id, days=30)
        since_7d = date.today() - timedelta(days=7)
        totals = await self.progress_repo.get_daily_totals(user_id, since_7d)
        target = await self.profile_repo.get_active_target(user_id)

        current_weight = weight_history[-1].weight_kg if weight_history else None

        adherence = None
        if target and totals.get("avg_daily_kcal"):
            diff = abs(totals["avg_daily_kcal"] - target.calories_kcal)
            adherence = round(max(0, 100 - (diff / target.calories_kcal * 100)), 1)

        meal_service = MealService(self.db)
        nutrition_streak_days = await meal_service.get_nutrition_streak_days(user_id)

        return {
            "current_weight_kg": current_weight,
            "weight_trend": weight_history,
            "avg_daily_kcal_7d": totals.get("avg_daily_kcal"),
            "avg_daily_protein_7d": totals.get("avg_daily_protein"),
            "adherence_percentage_7d": adherence,
            "days_logged_7d": totals.get("days_logged", 0),
            "total_meals_7d": totals.get("total_meals", 0),
            "nutrition_streak_days": nutrition_streak_days,
        }

    async def set_water(self, user_id: str, log_date: date, glasses: int):
        row = await self.progress_repo.upsert_water(user_id, log_date, glasses)
        if glasses > 0:
            from app.services.badge_integration import fire_water_logged_day

            await fire_water_logged_day(self.db, user_id, log_date)
        return row

    async def get_water_today(self, user_id: str, log_date: date | None = None):
        d = log_date or date.today()
        row = await self.progress_repo.get_water(user_id, d)
        if row:
            return row
        return {"date": d, "glasses": 0, "updated_at": None}

    async def analyze_plateau(self, user_id: str) -> dict:
        weight_history = await self.progress_repo.get_weight_history(user_id, days=60)
        since_7d = date.today() - timedelta(days=7)
        totals = await self.progress_repo.get_daily_totals(user_id, since_7d)
        target = await self.profile_repo.get_active_target(user_id)

        weight_logs = [
            {"date": str(w.date), "weight_kg": w.weight_kg}
            for w in weight_history
        ]

        adherence = None
        if target and totals.get("avg_daily_kcal"):
            diff = abs(totals["avg_daily_kcal"] - target.calories_kcal)
            adherence = max(0, 100 - (diff / target.calories_kcal * 100))

        return analyze_plateau(
            weight_logs=weight_logs,
            avg_daily_kcal=totals.get("avg_daily_kcal"),
            target_kcal=target.calories_kcal if target else None,
            adherence_pct=adherence,
            days_logged=totals.get("days_logged", 0),
            current_steps=target.steps_target if target else None,
            goal_type="lose_fat",
        )
