from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import CoachSavedInsight


class CoachInsightRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self, user_id: str, body: str, source_chat_message_id: Optional[UUID]
    ) -> CoachSavedInsight:
        row = CoachSavedInsight(
            user_id=user_id,
            body=body,
            source_chat_message_id=source_chat_message_id,
        )
        self.db.add(row)
        await self.db.flush()
        return row

    async def list_for_user(self, user_id: str, limit: int = 50) -> List[CoachSavedInsight]:
        stmt = (
            select(CoachSavedInsight)
            .where(CoachSavedInsight.user_id == user_id)
            .order_by(CoachSavedInsight.created_at.desc())
            .limit(limit)
        )
        r = await self.db.execute(stmt)
        return list(r.scalars().all())

    async def delete(self, insight_id: str, user_id: str) -> bool:
        try:
            uid = UUID(insight_id)
        except (ValueError, AttributeError):
            return False
        stmt = (
            delete(CoachSavedInsight)
            .where(CoachSavedInsight.id == uid)
            .where(CoachSavedInsight.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.rowcount > 0
