"""Anti-abuso centralizado para insignias (dedupe minuto, caps diarios, validaciones)."""
from __future__ import annotations

import hashlib
import logging
from datetime import date, datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.repositories.badge_repo import BadgeRepository
from app.services.badge_action_context import BadgeActionContext, BadgeActionKind

logger = logging.getLogger(__name__)


def truncate_to_minute_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)
    return dt.replace(second=0, microsecond=0)


def day_start_utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day)


def coach_text_eligible(text: Optional[str]) -> bool:
    s = (text or "").strip()
    return len(s) > 1


def fingerprint_for_search(query: str) -> str:
    q = " ".join((query or "").lower().split())
    return hashlib.sha256(q.encode("utf-8")).hexdigest()[:48]


def fingerprint_for_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class BadgeAntiFraudService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = BadgeRepository(db)

    async def try_record(self, user_id: str, ctx: BadgeActionContext) -> Tuple[bool, Optional[str]]:
        """Si la acción cuenta para insignias, inserta ledger. Devuelve (True, None) o (False, motivo)."""
        s = get_settings()
        now = ctx.occurred_at
        if now.tzinfo is not None:
            now = now.replace(tzinfo=None)
        day_utc = now.date()
        minute_bucket = truncate_to_minute_utc(now)

        kind = ctx.kind.value

        if ctx.kind == BadgeActionKind.COACH_USER_MESSAGE:
            if not coach_text_eligible(ctx.coach_message_text):
                return False, "coach_text_too_short"

        cap = self._daily_cap_for(kind, s)
        if cap is not None:
            used = await self.repo.count_ledger_day(user_id, kind, day_utc)
            if used >= cap:
                await self._maybe_flag_spam(user_id, kind, used, cap)
                return False, "daily_cap"

        fingerprint = ctx.fingerprint or ""
        if ctx.kind == BadgeActionKind.WEIGHT_LOGGED and ctx.weight_log_date:
            minute_bucket = day_start_utc(ctx.weight_log_date)
            fingerprint = "weight_day"
            day_utc = ctx.weight_log_date

        if ctx.kind in (
            BadgeActionKind.WATER_OR_ACTIVITY,
            BadgeActionKind.WATER_LOGGED,
            BadgeActionKind.ACTIVITY_DAY_LOGGED,
        ):
            raw_d = (ctx.meta or {}).get("date")
            if isinstance(raw_d, str):
                try:
                    dwa = date.fromisoformat(raw_d)
                    minute_bucket = day_start_utc(dwa)
                    day_utc = dwa
                    if ctx.kind == BadgeActionKind.WATER_LOGGED:
                        fingerprint = "water_day"
                    elif ctx.kind == BadgeActionKind.ACTIVITY_DAY_LOGGED:
                        fingerprint = "activity_day"
                    else:
                        fingerprint = "water_activity_day"
                except ValueError:
                    pass

        if ctx.kind == BadgeActionKind.PROGRESS_SUMMARY_VIEWED:
            minute_bucket = day_start_utc(day_utc)
            fingerprint = "progress_summary_7d"

        if ctx.kind == BadgeActionKind.GROCERY_LIST_MADE:
            minute_bucket = day_start_utc(date(2000, 1, 1))
            fingerprint = "grocery_list_once"

        if ctx.kind == BadgeActionKind.COACH_CHAT_PHOTO:
            minute_bucket = day_start_utc(date(2000, 1, 1))
            fingerprint = "coach_chat_photo_once"

        if ctx.kind == BadgeActionKind.GROCERIES_ITEM_CHECKED:
            minute_bucket = day_start_utc(date(2000, 1, 1))
            if not fingerprint:
                fingerprint = str((ctx.meta or {}).get("plan_item_fp", ""))

        if ctx.kind in (BadgeActionKind.FOOD_SEARCH, BadgeActionKind.NUTRITION_SEARCH) and not fingerprint:
            fingerprint = fingerprint_for_search(ctx.meta.get("query", "") if ctx.meta else "")

        if ctx.kind == BadgeActionKind.PHOTO_ANALYZE and ctx.image_bytes_sha256:
            fingerprint = ctx.image_bytes_sha256[:64]

        if ctx.kind == BadgeActionKind.BARCODE_SCAN and not fingerprint:
            fingerprint = fingerprint_for_search(ctx.meta.get("barcode", "") if ctx.meta else "")

        if ctx.kind == BadgeActionKind.MEAL_LOGGED and not fingerprint and ctx.meta.get("meal_entry_id"):
            fingerprint = str(ctx.meta["meal_entry_id"])

        if ctx.kind == BadgeActionKind.COACH_INSIGHT_SAVED and not fingerprint and ctx.meta.get("insight_id"):
            fingerprint = str(ctx.meta["insight_id"])

        inserted = await self.repo.try_insert_ledger(
            user_id, kind, minute_bucket, day_utc, fingerprint, ctx.meta or None
        )
        if not inserted:
            return False, "dedupe_or_conflict"
        return True, None

    def _daily_cap_for(self, action_kind: str, s) -> Optional[int]:
        caps = {
            "barcode_scan": s.badge_daily_cap_barcode_scan,
            "photo_analyze": s.badge_daily_cap_photo_analyze,
            "food_search": s.badge_daily_cap_food_search,
            "nutrition_search": s.badge_daily_cap_nutrition_search,
        }
        v = caps.get(action_kind)
        return v if v is not None and v >= 0 else None

    async def _maybe_flag_spam(self, user_id: str, kind: str, used: int, cap: int) -> None:
        if used >= cap * 3:
            await self.repo.add_review_flag(
                user_id,
                "exploration_cap_exceeded",
                details={"action_kind": kind, "used": used, "cap": cap},
            )


def meal_spacing_complete(
    meal_times: list[datetime],
    *,
    min_meals: int,
    min_gap_minutes: int,
) -> bool:
    """Al menos min_meals marcas de tiempo con separación >= min_gap_minutes entre consecutivas ordenadas."""
    if len(meal_times) < min_meals:
        return False
    ts = sorted(meal_times)
    ok = 1
    last = ts[0]
    for t in ts[1:]:
        delta = (t - last).total_seconds() / 60.0
        if delta >= min_gap_minutes:
            ok += 1
            last = t
        if ok >= min_meals:
            return True
    return ok >= min_meals


def streak_from_day_flags(flags_by_day: dict[date, bool], *, today: date) -> int:
    """flags_by_day[d]=True si el día cumple; cuenta hacia atrás desde today."""
    streak = 0
    d = today
    while True:
        if flags_by_day.get(d):
            streak += 1
            d = d - timedelta(days=1)
        else:
            if d == today:
                d = d - timedelta(days=1)
                continue
            break
    return streak
