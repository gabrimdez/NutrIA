from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import ChatMessage, ChatSession, UserFeatureUsage

METRIC_VISION_MONTH = "vision_month"
METRIC_REGEN_WEEK = "plan_regen_week"
# parse_text_day: legado; cupo Free NutriCoach usa parse_text_month.
METRIC_PARSE_DAY = "parse_text_day"
METRIC_PARSE_MONTH = "parse_text_month"
METRIC_RECIPE_RECOMMEND_DAY = "recipe_recommend_day"


class SubscriptionUsageRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def utc_day_start() -> datetime:
        # Columnas SQLAlchemy DateTime sin timezone: asyncpg no mezcla aware/naive.
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        return now.replace(hour=0, minute=0, second=0, microsecond=0)

    @staticmethod
    def utc_month_start() -> datetime:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    @staticmethod
    def month_key() -> str:
        return datetime.now(timezone.utc).date().strftime("%Y-%m")

    @staticmethod
    def week_key() -> str:
        d = datetime.now(timezone.utc).date()
        y, w, _ = d.isocalendar()
        return f"{y}-W{w:02d}"

    @staticmethod
    def day_key() -> str:
        return datetime.now(timezone.utc).date().strftime("%Y-%m-%d")

    @staticmethod
    def _advisory_lock_key(user_id: str, metric: str, period_key: str) -> int:
        raw = f"{user_id}:{metric}:{period_key}".encode("utf-8")
        digest = hashlib.sha256(raw).digest()[:8]
        return int.from_bytes(digest, byteorder="big", signed=True)

    def _is_postgresql(self) -> bool:
        try:
            return self.db.get_bind().dialect.name == "postgresql"
        except Exception:
            return False

    async def acquire_quota_lock(self, user_id: str, metric: str, period_key: str) -> None:
        """Serialize quota checks per user/metric/period on Postgres.

        The lock is transaction-scoped and is released by the request commit/rollback.
        Non-Postgres test DBs skip it because SQLite has no equivalent advisory lock.
        """
        if not self._is_postgresql():
            return
        key = self._advisory_lock_key(user_id, metric, period_key)
        await self.db.execute(select(func.pg_advisory_xact_lock(key)))

    async def count_user_messages_since(self, user_id: str, since: datetime) -> int:
        stmt = (
            select(func.count())
            .select_from(ChatMessage)
            .join(ChatSession, ChatMessage.session_id == ChatSession.id)
            .where(
                ChatSession.user_id == user_id,
                ChatMessage.role == "user",
                ChatMessage.created_at >= since,
            )
        )
        r = await self.db.execute(stmt)
        return int(r.scalar() or 0)

    async def get_usage(self, user_id: str, metric: str, period_key: str) -> int:
        stmt = select(UserFeatureUsage.used).where(
            UserFeatureUsage.user_id == user_id,
            UserFeatureUsage.metric == metric,
            UserFeatureUsage.period_key == period_key,
        )
        r = await self.db.execute(stmt)
        val = r.scalar_one_or_none()
        return int(val or 0)

    async def increment_usage(self, user_id: str, metric: str, period_key: str) -> None:
        tbl = UserFeatureUsage.__table__
        stmt = (
            pg_insert(tbl)
            .values(user_id=user_id, metric=metric, period_key=period_key, used=1)
            .on_conflict_do_update(
                index_elements=[tbl.c.user_id, tbl.c.metric, tbl.c.period_key],
                set_={"used": tbl.c.used + 1},
            )
        )
        await self.db.execute(stmt)
        await self.db.flush()
