"""Métricas desde BD para motor de insignias."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import (
    ActivityLog,
    ChatMessage,
    ChatSession,
    DietPlan,
    Goal,
    MealEntry,
    Profile,
    WaterLog,
    WeightLog,
)
from app.repositories.profile_repo import ProfileRepository
from app.services.badge_antifraud import meal_spacing_complete
from app.services.badge_macro import meal_entry_passes_macro_realism
from app.services.subscription_quota_service import SubscriptionQuotaService


class BadgeMetricsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _meal_created_naive_utc(created_at: datetime) -> datetime:
        """Postgres timestamptz → naive UTC para comparar con cutoffs naive (misma semántica que antes)."""
        if created_at.tzinfo is None:
            return created_at
        return created_at.astimezone(timezone.utc).replace(tzinfo=None)

    async def onboarding_complete_score(self, user_id: str) -> tuple[int, int]:
        """(current, target) con target=1 si onboarding hecho y hay goal activo."""
        r = await self.db.execute(select(Profile).where(Profile.user_id == user_id))
        p = r.scalar_one_or_none()
        if not p or not p.onboarding_completed:
            return 0, 1
        r2 = await self.db.execute(
            select(Goal.id).where(Goal.profile_id == p.id, Goal.is_active.is_(True)).limit(1)
        )
        if r2.scalar_one_or_none() is None:
            return 0, 1
        return 1, 1

    async def premium_active_score(self, user_id: str) -> tuple[int, int]:
        """(1, 1) si el usuario tiene Premium efectivo; si no (0, 1)."""
        repo = ProfileRepository(self.db)
        profile = await repo.get_by_user_id(user_id)
        premium, _ = await SubscriptionQuotaService(self.db).premium_status(user_id, profile=profile)
        if premium:
            return 1, 1
        return 0, 1

    async def active_goal_score(self, user_id: str) -> tuple[int, int]:
        """(1,1) si existe goal activo para el usuario."""
        repo = ProfileRepository(self.db)
        g = await repo.get_active_goal_by_user_id(user_id)
        return (1, 1) if g else (0, 1)

    async def count_meal_entries(self, user_id: str) -> int:
        r = await self.db.execute(select(func.count()).select_from(MealEntry).where(MealEntry.user_id == user_id))
        return int(r.scalar_one() or 0)

    async def count_weight_distinct_days(self, user_id: str) -> int:
        r = await self.db.execute(
            select(func.count(func.distinct(WeightLog.date))).where(WeightLog.user_id == user_id)
        )
        return int(r.scalar_one() or 0)

    @staticmethod
    def _monday_week_start(d: date) -> date:
        return d - timedelta(days=d.weekday())

    async def max_weight_consecutive_weeks(self, user_id: str) -> int:
        """Longest run of calendar weeks (Mon start) each with ≥1 weight log."""
        r = await self.db.execute(select(func.distinct(WeightLog.date)).where(WeightLog.user_id == user_id))
        dates = [row[0] for row in r.all() if row[0] is not None]
        if not dates:
            return 0
        mondays = sorted({BadgeMetricsService._monday_week_start(d) for d in dates})
        best = 1
        cur = 1
        for i in range(1, len(mondays)):
            if mondays[i] == mondays[i - 1] + timedelta(days=7):
                cur += 1
            else:
                cur = 1
            best = max(best, cur)
        return best

    async def count_distinct_water_days(self, user_id: str, *, min_glasses_per_day: int = 1) -> int:
        m = max(1, int(min_glasses_per_day))
        r = await self.db.execute(
            select(func.count(func.distinct(WaterLog.date))).where(
                WaterLog.user_id == user_id, WaterLog.glasses >= m
            )
        )
        return int(r.scalar_one() or 0)

    async def count_coach_user_messages(self, user_id: str) -> int:
        r = await self.db.execute(
            select(func.count())
            .select_from(ChatMessage)
            .join(ChatSession, ChatSession.id == ChatMessage.session_id)
            .where(ChatSession.user_id == user_id, ChatMessage.role == "user", func.length(func.trim(ChatMessage.content)) > 1)
        )
        return int(r.scalar_one() or 0)

    async def count_plan_generations(self, user_id: str) -> int:
        r = await self.db.execute(select(func.count()).select_from(DietPlan).where(DietPlan.user_id == user_id))
        return int(r.scalar_one() or 0)

    async def count_habit_proxy_days(self, user_id: str) -> int:
        """Días únicos con agua>0 o actividad registrada."""
        w = await self.db.execute(
            select(func.distinct(WaterLog.date)).where(WaterLog.user_id == user_id, WaterLog.glasses > 0)
        )
        water_days = {row[0] for row in w.all()}
        a = await self.db.execute(
            select(func.distinct(ActivityLog.date)).where(
                ActivityLog.user_id == user_id,
                or_(
                    ActivityLog.steps > 0,
                    ActivityLog.training_duration_min > 0,
                ),
            )
        )
        act_days = {row[0] for row in a.all()}
        return len(water_days | act_days)

    def _grace_cutoff(self, calendar_day: date, grace_days: int) -> datetime:
        end = datetime(calendar_day.year, calendar_day.month, calendar_day.day) + timedelta(days=grace_days + 1)
        return end

    async def distinct_meal_days_with_grace(self, user_id: str, *, grace_days: int) -> set[date]:
        r = await self.db.execute(
            select(MealEntry.date, MealEntry.created_at).where(MealEntry.user_id == user_id)
        )
        ok: set[date] = set()
        for meal_date, created_at in r.all():
            if created_at is None:
                continue
            cutoff = self._grace_cutoff(meal_date, grace_days)
            if self._meal_created_naive_utc(created_at) < cutoff:
                ok.add(meal_date)
        return ok

    async def streak_meal_days(
        self, user_id: str, *, min_meals_per_day: int, grace_days: int, today: date
    ) -> int:
        days_with_meals: dict[date, int] = defaultdict(int)
        r = await self.db.execute(
            select(MealEntry.date, MealEntry.created_at).where(MealEntry.user_id == user_id)
        )
        for meal_date, created_at in r.all():
            if created_at is None:
                continue
            if self._meal_created_naive_utc(created_at) >= self._grace_cutoff(meal_date, grace_days):
                continue
            days_with_meals[meal_date] += 1

        flags = {d: (days_with_meals[d] >= min_meals_per_day) for d in days_with_meals}
        from app.services.badge_antifraud import streak_from_day_flags

        return streak_from_day_flags(flags, today=today)

    async def count_complete_days(
        self,
        user_id: str,
        *,
        min_real_meals: int,
        min_minutes_between_meals: int,
        min_kcal_per_meal: float,
    ) -> int:
        r = await self.db.execute(
            select(MealEntry)
            .where(MealEntry.user_id == user_id)
            .order_by(MealEntry.date, MealEntry.created_at)
        )
        rows = list(r.scalars().all())
        by_day: dict[date, list[MealEntry]] = defaultdict(list)
        for m in rows:
            by_day[m.date].append(m)

        count = 0
        for day, meals in by_day.items():
            eligible = [m for m in meals if meal_entry_passes_macro_realism(m, min_kcal_per_meal=min_kcal_per_meal)]
            if len(eligible) < min_real_meals:
                continue
            distinct_types = {str(m.meal_type) for m in eligible}
            if len(distinct_types) < min_real_meals:
                continue
            times = [
                self._meal_created_naive_utc(m.created_at) if m.created_at else datetime(day.year, day.month, day.day)
                for m in eligible
            ]
            if meal_spacing_complete(
                times, min_meals=min_real_meals, min_gap_minutes=min_minutes_between_meals
            ):
                count += 1
        return count

    def _within_macro_margin(self, actual: float, target: float, margin_pct: float) -> bool:
        if target <= 0:
            return actual <= 0
        lo = target * (1 - margin_pct / 100.0)
        hi = target * (1 + margin_pct / 100.0)
        return lo <= actual <= hi

    async def count_days_macros_within_margin(self, user_id: str, margin_pct: float) -> int:
        """Días con suma de comidas dentro del margen respecto al DailyTarget activo (mismo target para todo el histórico)."""
        repo = ProfileRepository(self.db)
        dt = await repo.get_active_target(user_id)
        if not dt:
            return 0
        t_k = float(dt.calories_kcal)
        t_p = float(dt.protein_g)
        t_c = float(dt.carbs_g)
        t_f = float(dt.fat_g)
        r = await self.db.execute(
            select(
                MealEntry.date,
                func.coalesce(func.sum(MealEntry.total_kcal), 0.0),
                func.coalesce(func.sum(MealEntry.total_protein_g), 0.0),
                func.coalesce(func.sum(MealEntry.total_carbs_g), 0.0),
                func.coalesce(func.sum(MealEntry.total_fat_g), 0.0),
            )
            .where(MealEntry.user_id == user_id)
            .group_by(MealEntry.date)
        )
        n = 0
        for _d, kcal, prot, carbs, fat in r.all():
            if self._within_macro_margin(float(kcal), t_k, margin_pct) and self._within_macro_margin(
                float(prot), t_p, margin_pct
            ) and self._within_macro_margin(float(carbs), t_c, margin_pct) and self._within_macro_margin(
                float(fat), t_f, margin_pct
            ):
                n += 1
        return n

    async def count_balanced_days_in_window(
        self,
        user_id: str,
        *,
        end_day: date,
        window_days: int,
        macro_margin_pct: float,
        min_glasses: int,
    ) -> int:
        """Días en [end_day - window_days + 1, end_day] con totales diarios en margen de macros y vasos de agua ≥ meta."""
        if window_days < 1:
            return 0
        start = end_day - timedelta(days=window_days - 1)
        repo = ProfileRepository(self.db)
        dt = await repo.get_active_target(user_id)
        if not dt:
            return 0
        t_k = float(dt.calories_kcal)
        t_p = float(dt.protein_g)
        t_c = float(dt.carbs_g)
        t_f = float(dt.fat_g)
        r = await self.db.execute(
            select(
                MealEntry.date,
                func.coalesce(func.sum(MealEntry.total_kcal), 0.0),
                func.coalesce(func.sum(MealEntry.total_protein_g), 0.0),
                func.coalesce(func.sum(MealEntry.total_carbs_g), 0.0),
                func.coalesce(func.sum(MealEntry.total_fat_g), 0.0),
            )
            .where(
                MealEntry.user_id == user_id,
                MealEntry.date >= start,
                MealEntry.date <= end_day,
            )
            .group_by(MealEntry.date)
        )
        macro_by_day: dict[date, tuple[float, float, float, float]] = {}
        for d, kcal, prot, carbs, fat in r.all():
            macro_by_day[d] = (float(kcal), float(prot), float(carbs), float(fat))

        wr = await self.db.execute(
            select(WaterLog.date, WaterLog.glasses).where(
                WaterLog.user_id == user_id,
                WaterLog.date >= start,
                WaterLog.date <= end_day,
            )
        )
        water_by_day = {row[0]: int(row[1] or 0) for row in wr.all()}

        good = 0
        d = start
        while d <= end_day:
            kcal, prot, carbs, fat = macro_by_day.get(d, (0.0, 0.0, 0.0, 0.0))
            macro_ok = (
                self._within_macro_margin(kcal, t_k, macro_margin_pct)
                and self._within_macro_margin(prot, t_p, macro_margin_pct)
                and self._within_macro_margin(carbs, t_c, macro_margin_pct)
                and self._within_macro_margin(fat, t_f, macro_margin_pct)
            )
            water_ok = water_by_day.get(d, 0) >= min_glasses
            if macro_ok and water_ok:
                good += 1
            d += timedelta(days=1)
        return good

    async def count_unique_days_from_ledger(self, user_id: str, action_kind: str) -> int:
        from app.models.models import BadgeActionLedger

        r = await self.db.execute(
            select(func.count(func.distinct(BadgeActionLedger.day_utc))).where(
                BadgeActionLedger.user_id == user_id, BadgeActionLedger.action_kind == action_kind
            )
        )
        return int(r.scalar_one() or 0)
