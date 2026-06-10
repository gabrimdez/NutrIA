"""Hooks mínimos hacia el orquestador de insignias (evita imports circulares)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.badge_action_context import BadgeActionContext, BadgeActionKind
from app.services.badge_orchestrator import BadgeOrchestrator


async def fire_meal_logged(db: AsyncSession, user_id: str, meal_entry_id: UUID) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.MEAL_LOGGED,
            occurred_at=datetime.now(timezone.utc),
            meta={"meal_entry_id": str(meal_entry_id)},
        ),
    )


async def fire_coach_message(db: AsyncSession, user_id: str, text: str) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.COACH_USER_MESSAGE,
            occurred_at=datetime.now(timezone.utc),
            coach_message_text=text,
        ),
    )


async def fire_coach_chat_photo(db: AsyncSession, user_id: str) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.COACH_CHAT_PHOTO,
            occurred_at=datetime.now(timezone.utc),
        ),
    )


async def fire_coach_insight_saved(db: AsyncSession, user_id: str, insight_id: UUID) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.COACH_INSIGHT_SAVED,
            occurred_at=datetime.now(timezone.utc),
            meta={"insight_id": str(insight_id)},
        ),
    )


async def fire_weight_logged(db: AsyncSession, user_id: str, log_date: date) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.WEIGHT_LOGGED,
            occurred_at=datetime.now(timezone.utc),
            weight_log_date=log_date,
        ),
    )


async def fire_food_search(db: AsyncSession, user_id: str, query: str) -> None:
    from app.services.badge_antifraud import fingerprint_for_search

    q = (query or "").strip()
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.FOOD_SEARCH,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=fingerprint_for_search(q),
            meta={"query_len": len(q)},
        ),
    )


async def fire_nutrition_search(db: AsyncSession, user_id: str, query: str) -> None:
    from app.services.badge_antifraud import fingerprint_for_search

    q = (query or "").strip()
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.NUTRITION_SEARCH,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=fingerprint_for_search(q),
            meta={"query_len": len(q)},
        ),
    )


async def fire_barcode_scan(db: AsyncSession, user_id: str, code: str) -> None:
    from app.services.badge_antifraud import fingerprint_for_search

    c = (code or "").strip()
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.BARCODE_SCAN,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=fingerprint_for_search(c),
            meta={"barcode_len": len(c)},
        ),
    )


async def fire_photo_analyze(db: AsyncSession, user_id: str, image_bytes: Optional[bytes]) -> None:
    from app.services.badge_antifraud import fingerprint_for_bytes

    fp = fingerprint_for_bytes(image_bytes) if image_bytes else ""
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.PHOTO_ANALYZE,
            occurred_at=datetime.now(timezone.utc),
            image_bytes_sha256=fp,
        ),
    )


async def fire_plan_generated(db: AsyncSession, user_id: str, plan_id: UUID) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.PLAN_GENERATED,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=str(plan_id),
            meta={"plan_id": str(plan_id)},
        ),
    )


async def fire_plan_edited(db: AsyncSession, user_id: str, *, op: str, fingerprint_material: str) -> None:
    from app.services.badge_antifraud import fingerprint_for_search

    fp = fingerprint_for_search(f"{op}:{fingerprint_material}")
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.PLAN_EDITED,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=fp,
            meta={"op": op[:40]},
        ),
    )


async def fire_onboarding_completed(db: AsyncSession, user_id: str) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.ONBOARDING_COMPLETED,
            occurred_at=datetime.now(timezone.utc),
            fingerprint="onboarding",
        ),
    )


async def fire_active_goal_confirmed(db: AsyncSession, user_id: str) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.ACTIVE_GOAL_CONFIRMED,
            occurred_at=datetime.now(timezone.utc),
            fingerprint="goal",
        ),
    )


async def fire_water_logged_day(db: AsyncSession, user_id: str, log_date: date) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.WATER_LOGGED,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=f"day:{log_date.isoformat()}",
            meta={"date": log_date.isoformat()},
        ),
    )


async def fire_activity_day_logged(db: AsyncSession, user_id: str, log_date: date) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.ACTIVITY_DAY_LOGGED,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=f"day:{log_date.isoformat()}",
            meta={"date": log_date.isoformat()},
        ),
    )


async def fire_water_or_activity_day(db: AsyncSession, user_id: str, log_date: date) -> None:
    """Legado: emite agua + actividad por separado (compat. llamadas antiguas)."""
    await fire_water_logged_day(db, user_id, log_date)
    await fire_activity_day_logged(db, user_id, log_date)


async def fire_progress_summary_viewed(db: AsyncSession, user_id: str) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.PROGRESS_SUMMARY_VIEWED,
            occurred_at=datetime.now(timezone.utc),
        ),
    )


async def fire_text_entry_meal(db: AsyncSession, user_id: str, text: str) -> None:
    from app.services.badge_antifraud import fingerprint_for_search

    t = (text or "").strip()
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.TEXT_ENTRY_MEAL,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=fingerprint_for_search(t),
            meta={"text_len": len(t)},
        ),
    )


async def fire_saved_meal_created(db: AsyncSession, user_id: str, saved_meal_id: UUID) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.SAVED_MEAL_CREATED,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=str(saved_meal_id),
            meta={"saved_meal_id": str(saved_meal_id)},
        ),
    )


async def fire_recipe_logged(db: AsyncSession, user_id: str, recipe_id: UUID) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.RECIPE_LOGGED,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=str(recipe_id),
            meta={"recipe_id": str(recipe_id)},
        ),
    )


async def fire_grocery_list_made(db: AsyncSession, user_id: str) -> None:
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.GROCERY_LIST_MADE,
            occurred_at=datetime.now(timezone.utc),
        ),
    )


async def fire_groceries_item_checked(
    db: AsyncSession, user_id: str, *, plan_id: UUID, item_id: UUID
) -> None:
    fp = f"{plan_id}:{item_id}"
    orch = BadgeOrchestrator(db)
    await orch.on_user_action(
        user_id,
        BadgeActionContext(
            kind=BadgeActionKind.GROCERIES_ITEM_CHECKED,
            occurred_at=datetime.now(timezone.utc),
            fingerprint=fp,
            meta={"plan_id": str(plan_id), "item_id": str(item_id), "plan_item_fp": fp},
        ),
    )
