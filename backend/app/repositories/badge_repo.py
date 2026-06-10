from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Optional, Sequence, Collection
from uuid import UUID

from sqlalchemy import delete, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    BadgeActionLedger,
    BadgeAuditLog,
    BadgeDefinition,
    BadgeReviewFlag,
    BadgeSource,
    UserBadge,
    UserFeaturedBadge,
)


def _naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


class BadgeRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_definition_by_badge_id(self, badge_id: str) -> Optional[BadgeDefinition]:
        r = await self.db.execute(select(BadgeDefinition).where(BadgeDefinition.badge_id == badge_id))
        return r.scalar_one_or_none()

    async def get_definition_by_pk(self, pk: UUID) -> Optional[BadgeDefinition]:
        r = await self.db.execute(select(BadgeDefinition).where(BadgeDefinition.id == pk))
        return r.scalar_one_or_none()

    async def list_definitions(self, active_only: bool = False) -> Sequence[BadgeDefinition]:
        stmt = select(BadgeDefinition).order_by(BadgeDefinition.created_at)
        if active_only:
            stmt = stmt.where(BadgeDefinition.is_active.is_(True))
        r = await self.db.execute(stmt)
        return r.scalars().all()

    async def create_definition(self, row: BadgeDefinition) -> BadgeDefinition:
        self.db.add(row)
        await self.db.flush()
        return row

    async def update_definition(self, pk: UUID, values: dict) -> Optional[BadgeDefinition]:
        await self.db.execute(update(BadgeDefinition).where(BadgeDefinition.id == pk).values(**values))
        await self.db.flush()
        return await self.get_definition_by_pk(pk)

    async def get_user_badge_row(self, user_id: str, badge_definition_id: UUID) -> Optional[UserBadge]:
        r = await self.db.execute(
            select(UserBadge).where(
                UserBadge.user_id == user_id,
                UserBadge.badge_definition_id == badge_definition_id,
            )
        )
        return r.scalar_one_or_none()

    async def get_user_badges_batch(self, user_id: str, definition_ids: list[UUID]) -> dict[UUID, UserBadge]:
        if not definition_ids:
            return {}
        r = await self.db.execute(
            select(UserBadge).where(
                UserBadge.user_id == user_id,
                UserBadge.badge_definition_id.in_(definition_ids),
            )
        )
        return {ub.badge_definition_id: ub for ub in r.scalars().all()}

    async def list_user_badges_unlocked_since(
        self, user_id: str, since: datetime, limit: int = 10
    ) -> Sequence[tuple[UserBadge, BadgeDefinition]]:
        """Insignias desbloqueadas después de `since` (excl. revocadas), más recientes primero."""
        stmt = (
            select(UserBadge, BadgeDefinition)
            .join(BadgeDefinition, BadgeDefinition.id == UserBadge.badge_definition_id)
            .where(
                UserBadge.user_id == user_id,
                UserBadge.revoked_at.is_(None),
                UserBadge.unlocked_at.is_not(None),
                UserBadge.unlocked_at > since,
            )
            .order_by(UserBadge.unlocked_at.desc())
            .limit(limit)
        )
        r = await self.db.execute(stmt)
        return r.all()

    async def grant_user_badge(
        self,
        user_id: str,
        badge_definition_id: UUID,
        *,
        source: BadgeSource,
        progress_snapshot: Optional[dict],
        unlocked_at: datetime,
    ) -> tuple[UserBadge, bool]:
        """Idempotente: si ya activa, devuelve existente y created=False."""
        existing = await self.get_user_badge_row(user_id, badge_definition_id)
        unlocked_at = _naive_utc(unlocked_at)
        if existing and existing.revoked_at is None and existing.unlocked_at:
            return existing, False
        if existing:
            existing.revoked_at = None
            existing.revoke_reason = None
            existing.unlocked_at = unlocked_at
            existing.source = source
            existing.progress_snapshot = progress_snapshot
            await self.db.flush()
            return existing, True
        row = UserBadge(
            user_id=user_id,
            badge_definition_id=badge_definition_id,
            unlocked_at=unlocked_at,
            source=source,
            progress_snapshot=progress_snapshot,
        )
        self.db.add(row)
        await self.db.flush()
        return row, True

    async def revoke_user_badge(
        self, user_id: str, badge_definition_id: UUID, reason: str, revoked_at: datetime
    ) -> None:
        revoked_at = _naive_utc(revoked_at)
        await self.db.execute(
            update(UserBadge)
            .where(
                UserBadge.user_id == user_id,
                UserBadge.badge_definition_id == badge_definition_id,
                UserBadge.revoked_at.is_(None),
            )
            .values(revoked_at=revoked_at, revoke_reason=reason)
        )
        await self.db.execute(
            delete(UserFeaturedBadge).where(
                UserFeaturedBadge.user_id == user_id,
                UserFeaturedBadge.badge_definition_id == badge_definition_id,
            )
        )
        await self.db.flush()

    async def remove_featured_invalid(self, user_id: str) -> None:
        """Quita destacadas sin unlock activo o con definición desactivada."""
        has_active_unlock = exists(
            select(UserBadge.id).where(
                UserBadge.user_id == user_id,
                UserBadge.badge_definition_id == UserFeaturedBadge.badge_definition_id,
                UserBadge.revoked_at.is_(None),
            )
        )
        def_inactive = exists(
            select(BadgeDefinition.id).where(
                BadgeDefinition.id == UserFeaturedBadge.badge_definition_id,
                BadgeDefinition.is_active.is_(False),
            )
        )
        await self.db.execute(
            delete(UserFeaturedBadge).where(
                UserFeaturedBadge.user_id == user_id,
                or_(~has_active_unlock, def_inactive),
            )
        )
        await self.db.flush()

    async def list_featured(self, user_id: str) -> Sequence[UserFeaturedBadge]:
        await self.remove_featured_invalid(user_id)
        r = await self.db.execute(
            select(UserFeaturedBadge)
            .where(UserFeaturedBadge.user_id == user_id)
            .order_by(UserFeaturedBadge.position)
        )
        return r.scalars().all()

    async def set_featured(self, user_id: str, ordered_badge_definition_ids: list[UUID]) -> None:
        await self.db.execute(delete(UserFeaturedBadge).where(UserFeaturedBadge.user_id == user_id))
        await self.db.flush()
        for pos, bid in enumerate(ordered_badge_definition_ids[:3], start=1):
            self.db.add(
                UserFeaturedBadge(user_id=user_id, badge_definition_id=bid, position=pos)
            )
        await self.db.flush()

    async def try_insert_ledger(
        self,
        user_id: str,
        action_kind: str,
        minute_bucket: datetime,
        day_utc: date,
        fingerprint: str,
        meta: Optional[dict],
    ) -> bool:
        stmt = (
            pg_insert(BadgeActionLedger)
            .values(
                user_id=user_id,
                action_kind=action_kind,
                minute_bucket=minute_bucket,
                day_utc=day_utc,
                fingerprint=fingerprint or "",
                meta=meta,
            )
            .on_conflict_do_nothing(constraint="uq_badge_action_ledger_dedupe")
        )
        res = await self.db.execute(stmt)
        return res.rowcount is not None and res.rowcount > 0

    async def count_ledger_day(self, user_id: str, action_kind: str, day_utc: date) -> int:
        r = await self.db.execute(
            select(func.count())
            .select_from(BadgeActionLedger)
            .where(
                BadgeActionLedger.user_id == user_id,
                BadgeActionLedger.action_kind == action_kind,
                BadgeActionLedger.day_utc == day_utc,
            )
        )
        return int(r.scalar_one() or 0)

    async def count_ledger_all(self, user_id: str, action_kind: str) -> int:
        r = await self.db.execute(
            select(func.count())
            .select_from(BadgeActionLedger)
            .where(BadgeActionLedger.user_id == user_id, BadgeActionLedger.action_kind == action_kind)
        )
        return int(r.scalar_one() or 0)

    async def count_distinct_ledger_action_kinds(self, user_id: str, kinds: Collection[str]) -> int:
        kinds_l = [k for k in kinds if k]
        if not kinds_l:
            return 0
        r = await self.db.execute(
            select(func.count(func.distinct(BadgeActionLedger.action_kind))).where(
                BadgeActionLedger.user_id == user_id,
                BadgeActionLedger.action_kind.in_(kinds_l),
            )
        )
        return int(r.scalar_one() or 0)

    async def count_ledger_exploration(self, user_id: str) -> int:
        kinds = ("food_search", "nutrition_search", "barcode_scan", "photo_analyze")
        r = await self.db.execute(
            select(func.count())
            .select_from(BadgeActionLedger)
            .where(BadgeActionLedger.user_id == user_id, BadgeActionLedger.action_kind.in_(kinds))
        )
        return int(r.scalar_one() or 0)

    async def add_audit(
        self,
        actor: str,
        action: str,
        *,
        user_id: Optional[str] = None,
        badge_definition_id: Optional[UUID] = None,
        details: Optional[dict] = None,
    ) -> None:
        self.db.add(
            BadgeAuditLog(
                actor=actor,
                action=action,
                user_id=user_id,
                badge_definition_id=badge_definition_id,
                details=details,
            )
        )
        await self.db.flush()

    async def add_review_flag(
        self,
        user_id: str,
        reason: str,
        *,
        badge_definition_id: Optional[UUID] = None,
        details: Optional[dict] = None,
    ) -> None:
        self.db.add(
            BadgeReviewFlag(
                user_id=user_id,
                badge_definition_id=badge_definition_id,
                reason=reason,
                details=details,
            )
        )
        await self.db.flush()
