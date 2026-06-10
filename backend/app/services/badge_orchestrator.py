"""Orquestación: hook tras acción, destacadas, catálogo, admin grant/revoke, recompute."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import BadgeDefinition, BadgeSource
from app.repositories.badge_repo import BadgeRepository
from app.services.badge_action_context import BadgeActionContext, BadgeActionKind
from app.services.badge_antifraud import BadgeAntiFraudService
from app.schemas.badge_rules import parse_unlock_rule
from app.services.badge_engine import BadgeEngineService

logger = logging.getLogger(__name__)

_KINDS_WITH_LEDGER = frozenset(
    m.value
    for m in (
        BadgeActionKind.MEAL_LOGGED,
        BadgeActionKind.FOOD_SEARCH,
        BadgeActionKind.NUTRITION_SEARCH,
        BadgeActionKind.BARCODE_SCAN,
        BadgeActionKind.PHOTO_ANALYZE,
        BadgeActionKind.COACH_USER_MESSAGE,
        BadgeActionKind.WEIGHT_LOGGED,
        BadgeActionKind.PLAN_GENERATED,
        BadgeActionKind.PLAN_EDITED,
        BadgeActionKind.WATER_OR_ACTIVITY,
        BadgeActionKind.WATER_LOGGED,
        BadgeActionKind.ACTIVITY_DAY_LOGGED,
        BadgeActionKind.PROGRESS_SUMMARY_VIEWED,
        BadgeActionKind.TEXT_ENTRY_MEAL,
        BadgeActionKind.SAVED_MEAL_CREATED,
        BadgeActionKind.RECIPE_LOGGED,
        BadgeActionKind.GROCERY_LIST_MADE,
        BadgeActionKind.GROCERIES_ITEM_CHECKED,
        BadgeActionKind.COACH_CHAT_PHOTO,
        BadgeActionKind.COACH_INSIGHT_SAVED,
    )
)


class BadgeOrchestrator:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = BadgeRepository(db)
        self.antifraud = BadgeAntiFraudService(db)
        self.engine = BadgeEngineService(db)

    async def on_user_action(self, user_id: str, ctx: BadgeActionContext) -> None:
        try:
            # Los hooks de insignias son secundarios: nunca deben romper la acción
            # principal (crear receta, registrar comida, etc.). Si una operación de
            # insignias falla durante un flush/execute, SQLAlchemy deja la
            # transacción en estado fallido aunque capturemos la excepción. Un
            # SAVEPOINT permite revertir solo el trabajo de insignias y mantener
            # intacta la transacción exterior de la acción del usuario.
            async with self.db.begin_nested():
                skip_engine = False
                if ctx.kind.value in _KINDS_WITH_LEDGER:
                    ok, reason = await self.antifraud.try_record(user_id, ctx)
                    if (
                        not ok
                        and reason == "daily_cap"
                        and ctx.kind
                        in (
                            BadgeActionKind.FOOD_SEARCH,
                            BadgeActionKind.NUTRITION_SEARCH,
                            BadgeActionKind.BARCODE_SCAN,
                            BadgeActionKind.PHOTO_ANALYZE,
                        )
                    ):
                        skip_engine = True
                if not skip_engine:
                    await self.engine.evaluate_user(user_id, triggered_action=ctx.kind)
        except Exception as e:
            logger.warning("badge on_user_action: %s", e)

    async def recompute_user(self, user_id: str) -> None:
        await self.engine.evaluate_user(user_id, triggered_action=None)

    async def grant_manual(self, user_id: str, badge_definition_id: UUID, *, actor: str = "admin") -> bool:
        row, created = await self.repo.grant_user_badge(
            user_id,
            badge_definition_id,
            source=BadgeSource.MANUAL,
            progress_snapshot=None,
            unlocked_at=datetime.now(timezone.utc),
        )
        await self.repo.add_audit(
            actor, "grant_manual", user_id=user_id, badge_definition_id=badge_definition_id, details={"created": created}
        )
        return created

    async def revoke_manual(
        self, user_id: str, badge_definition_id: UUID, reason: str, *, actor: str = "admin"
    ) -> None:
        await self.repo.revoke_user_badge(user_id, badge_definition_id, reason, datetime.now(timezone.utc))
        await self.repo.add_audit(
            actor,
            "revoke_manual",
            user_id=user_id,
            badge_definition_id=badge_definition_id,
            details={"reason": reason},
        )

    async def build_catalog_item(
        self, user_id: str, defn: BadgeDefinition, ub: Any | None
    ) -> dict[str, Any]:
        rule = parse_unlock_rule(defn.unlock_rule)
        current, target, unit = 0, None, ""
        if rule:
            current, target, unit = await self.engine.measure_rule(user_id, rule, datetime.now(timezone.utc).date())
        unlocked = ub is not None and ub.revoked_at is None and ub.unlocked_at is not None
        return {
            "badge_id": defn.badge_id,
            "name": defn.name,
            "description": defn.description,
            "unlock_criteria_text": defn.unlock_criteria_text,
            "image_url": defn.image_url,
            "rarity": defn.rarity.value if hasattr(defn.rarity, "value") else str(defn.rarity),
            "category": defn.category.value if hasattr(defn.category, "value") else str(defn.category),
            "is_active": defn.is_active,
            "unlocked": unlocked,
            "unlocked_at": ub.unlocked_at.isoformat() if unlocked and ub.unlocked_at else None,
            "revoked_at": ub.revoked_at.isoformat() if ub and ub.revoked_at else None,
            "progress": {"current": current, "target": target, "unit": unit} if target else None,
            "source": ub.source.value if ub and ub.source and unlocked else None,
        }
