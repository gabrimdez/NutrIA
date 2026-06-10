"""Contexto de acción usuario para insignias (adaptador desde servicios)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Optional


class BadgeActionKind(str, Enum):
    MEAL_LOGGED = "meal_logged"
    FOOD_SEARCH = "food_search"
    NUTRITION_SEARCH = "nutrition_search"
    BARCODE_SCAN = "barcode_scan"
    PHOTO_ANALYZE = "photo_analyze"
    COACH_USER_MESSAGE = "coach_user_message"
    WEIGHT_LOGGED = "weight_logged"
    PLAN_GENERATED = "plan_generated"
    PLAN_EDITED = "plan_edited"
    WATER_OR_ACTIVITY = "water_or_activity_day"  # legado ledger; no emitir desde ProgressService
    WATER_LOGGED = "water_logged"
    ACTIVITY_DAY_LOGGED = "activity_day_logged"
    ONBOARDING_COMPLETED = "onboarding_completed"
    ACTIVE_GOAL_CONFIRMED = "active_goal_confirmed"
    PROGRESS_SUMMARY_VIEWED = "progress_summary_viewed"
    TEXT_ENTRY_MEAL = "text_entry_meal"
    SAVED_MEAL_CREATED = "saved_meal_created"
    RECIPE_LOGGED = "recipe_logged"
    GROCERY_LIST_MADE = "grocery_list_made"
    GROCERIES_ITEM_CHECKED = "groceries_item_checked"
    COACH_CHAT_PHOTO = "coach_chat_photo"
    COACH_INSIGHT_SAVED = "coach_insight_saved"


@dataclass
class BadgeActionContext:
    kind: BadgeActionKind
    occurred_at: datetime
    fingerprint: str = ""
    meta: dict[str, Any] = field(default_factory=dict)
    weight_log_date: Optional[date] = None
    coach_message_text: Optional[str] = None
    image_bytes_sha256: Optional[str] = None
