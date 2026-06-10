from typing import List, Optional
from datetime import date, timedelta
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models.models import WeightLog, ActivityLog, MealEntry, WaterLog


class ProgressRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log_weight(self, user_id: str, weight_kg: float,
                          log_date: date, notes: Optional[str] = None) -> WeightLog:
        log = WeightLog(user_id=user_id, weight_kg=weight_kg, date=log_date, notes=notes)
        self.db.add(log)
        await self.db.flush()
        return log

    async def get_weight_history(self, user_id: str, days: int = 90) -> List[WeightLog]:
        since = date.today() - timedelta(days=days)
        stmt = (
            select(WeightLog)
            .where(WeightLog.user_id == user_id, WeightLog.date >= since)
            .order_by(WeightLog.date)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def log_activity(self, user_id: str, log_date: date, **kwargs) -> ActivityLog:
        log = ActivityLog(user_id=user_id, date=log_date, **kwargs)
        self.db.add(log)
        await self.db.flush()
        return log

    async def get_latest_activity(self, user_id: str, log_date: date) -> Optional[ActivityLog]:
        stmt = (
            select(ActivityLog)
            .where(ActivityLog.user_id == user_id, ActivityLog.date == log_date)
            .order_by(desc(ActivityLog.created_at))
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_daily_totals(self, user_id: str, since: date) -> dict:
        stmt = (
            select(
                func.count(func.distinct(MealEntry.date)).label("days_logged"),
                func.count(MealEntry.id).label("total_meals"),
                func.avg(MealEntry.total_kcal).label("avg_meal_kcal"),
            )
            .where(MealEntry.user_id == user_id, MealEntry.date >= since)
        )
        result = await self.db.execute(stmt)
        row = result.one()

        daily_kcal_stmt = (
            select(
                MealEntry.date,
                func.sum(MealEntry.total_kcal).label("daily_kcal"),
                func.sum(MealEntry.total_protein_g).label("daily_protein"),
            )
            .where(MealEntry.user_id == user_id, MealEntry.date >= since)
            .group_by(MealEntry.date)
        )
        daily_result = await self.db.execute(daily_kcal_stmt)
        daily_rows = daily_result.all()

        avg_kcal = sum(r.daily_kcal for r in daily_rows) / len(daily_rows) if daily_rows else None
        avg_protein = sum(r.daily_protein for r in daily_rows) / len(daily_rows) if daily_rows else None

        return {
            "days_logged": row.days_logged or 0,
            "total_meals": row.total_meals or 0,
            "avg_daily_kcal": round(avg_kcal, 1) if avg_kcal else None,
            "avg_daily_protein": round(avg_protein, 1) if avg_protein else None,
        }

    async def upsert_water(self, user_id: str, log_date: date, glasses: int) -> WaterLog:
        stmt = (
            pg_insert(WaterLog)
            .values(user_id=user_id, date=log_date, glasses=glasses)
            .on_conflict_do_update(
                index_elements=["user_id", "date"],
                set_={"glasses": glasses, "updated_at": func.now()},
            )
            .returning(WaterLog)
        )
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.scalars().one()

    async def get_water(self, user_id: str, log_date: date) -> Optional[WaterLog]:
        stmt = select(WaterLog).where(
            WaterLog.user_id == user_id, WaterLog.date == log_date,
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()
