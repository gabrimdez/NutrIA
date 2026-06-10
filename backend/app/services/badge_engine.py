"""Motor de evaluación y otorgamiento de insignias."""
from __future__ import annotations

import logging
import math
from datetime import date, datetime, timezone
from typing import Optional, Tuple

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import BadgeDefinition, BadgeSource, UserBadge
from app.repositories.badge_repo import BadgeRepository
from app.schemas.badge_rules import (
    RuleCoachMessages,
    RuleCompleteDays,
    RuleCountAction,
    RuleCountUniqueDays,
    RuleDiaryEntries,
    RuleExplorationActions,
    RuleHabitsCompleted,
    RuleMacroGoalDays,
    RuleManualOnly,
    RuleOnboardingComplete,
    RulePremiumActive,
    RuleActiveGoal,
    RuleBalancedWeek,
    RulePlanningActions,
    RulePremiumActive,
    RuleStreakDays,
    RuleVersatileLogger,
    RuleWaterDays,
    RuleWeightLogs,
    RuleWeightWeekStreak,
    UnlockRule,
    parse_unlock_rule,
)
from app.services.badge_action_context import BadgeActionKind
from app.services.badge_metrics import BadgeMetricsService

logger = logging.getLogger(__name__)

_EXPLORATION_KINDS = frozenset(
    {
        BadgeActionKind.FOOD_SEARCH,
        BadgeActionKind.NUTRITION_SEARCH,
        BadgeActionKind.BARCODE_SCAN,
        BadgeActionKind.PHOTO_ANALYZE,
    }
)

_VERSATILE_LOGGER_TRIGGER_KINDS = frozenset(
    {
        BadgeActionKind.FOOD_SEARCH,
        BadgeActionKind.NUTRITION_SEARCH,
        BadgeActionKind.BARCODE_SCAN,
        BadgeActionKind.PHOTO_ANALYZE,
        BadgeActionKind.TEXT_ENTRY_MEAL,
        BadgeActionKind.SAVED_MEAL_CREATED,
        BadgeActionKind.RECIPE_LOGGED,
    }
)


def rule_triggered_by_action(rule: UnlockRule, action: Optional[BadgeActionKind]) -> bool:
    if action is None:
        return True
    if isinstance(rule, RuleManualOnly):
        return False
    if isinstance(rule, RuleOnboardingComplete):
        return action in (BadgeActionKind.ONBOARDING_COMPLETED, None)
    if isinstance(rule, RuleActiveGoal):
        return action in (BadgeActionKind.ACTIVE_GOAL_CONFIRMED, None)
    if isinstance(rule, RuleCountAction):
        try:
            ak = BadgeActionKind(rule.action_kind)
        except ValueError:
            return True
        return ak == action
    if isinstance(rule, RuleMacroGoalDays):
        return action in (BadgeActionKind.MEAL_LOGGED, BadgeActionKind.ACTIVE_GOAL_CONFIRMED, None)
    if isinstance(rule, RuleBalancedWeek):
        return action in (
            BadgeActionKind.MEAL_LOGGED,
            BadgeActionKind.WATER_LOGGED,
            BadgeActionKind.ACTIVITY_DAY_LOGGED,
            BadgeActionKind.WATER_OR_ACTIVITY,
            BadgeActionKind.ACTIVE_GOAL_CONFIRMED,
            None,
        )
    if isinstance(rule, (RuleDiaryEntries, RuleCompleteDays, RuleStreakDays, RuleCountUniqueDays)):
        return action in (BadgeActionKind.MEAL_LOGGED, None)
    if isinstance(rule, RuleCoachMessages):
        return action == BadgeActionKind.COACH_USER_MESSAGE
    if isinstance(rule, (RuleWeightLogs, RuleWeightWeekStreak)):
        return action == BadgeActionKind.WEIGHT_LOGGED
    if isinstance(rule, RuleWaterDays):
        return action in (BadgeActionKind.WATER_LOGGED, BadgeActionKind.WATER_OR_ACTIVITY)
    if isinstance(rule, RulePlanningActions):
        return action == BadgeActionKind.PLAN_GENERATED
    if isinstance(rule, RuleExplorationActions):
        return action in _EXPLORATION_KINDS or action is None
    if isinstance(rule, RuleHabitsCompleted):
        return action in (
            BadgeActionKind.WATER_LOGGED,
            BadgeActionKind.ACTIVITY_DAY_LOGGED,
            BadgeActionKind.WATER_OR_ACTIVITY,
            BadgeActionKind.MEAL_LOGGED,
        )
    if isinstance(rule, RuleVersatileLogger):
        return action is None or action in _VERSATILE_LOGGER_TRIGGER_KINDS
    if isinstance(rule, RulePremiumActive):
        return True
    return False


class BadgeEngineService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = BadgeRepository(db)
        self.metrics = BadgeMetricsService(db)

    async def evaluate_user(
        self, user_id: str, *, triggered_action: Optional[BadgeActionKind] = None
    ) -> None:
        defs = await self.repo.list_definitions(active_only=True)
        today = date.today()
        for defn in defs:
            rule = parse_unlock_rule(defn.unlock_rule)
            if rule is None or isinstance(rule, RuleManualOnly):
                continue
            if not rule_triggered_by_action(rule, triggered_action):
                continue
            try:
                await self._process_definition(user_id, defn, rule, today)
            except Exception as e:
                logger.warning("badge engine skip %s: %s", defn.badge_id, e)

    async def _process_definition(
        self, user_id: str, defn: BadgeDefinition, rule: UnlockRule, today: date
    ) -> None:
        current, target, unit = await self._measure(user_id, rule, today)
        snap = {"current": current, "target": target, "unit": unit} if target else None

        ub = await self.repo.get_user_badge_row(user_id, defn.id)
        if ub and ub.revoked_at is None and ub.unlocked_at:
            if snap:
                await self.db.execute(
                    update(UserBadge)
                    .where(UserBadge.id == ub.id)
                    .values(progress_snapshot=snap)
                )
            return

        if target is None or current < target:
            return

        _, created = await self.repo.grant_user_badge(
            user_id,
            defn.id,
            source=BadgeSource.SYSTEM,
            progress_snapshot=snap,
            unlocked_at=datetime.now(timezone.utc),
        )
        if created:
            await self.repo.add_audit(
                "system",
                "grant",
                user_id=user_id,
                badge_definition_id=defn.id,
                details={"badge_id": defn.badge_id},
            )

    async def measure_rule(self, user_id: str, rule: UnlockRule, today: date) -> Tuple[int, Optional[int], str]:
        return await self._measure(user_id, rule, today)

    async def _measure(self, user_id: str, rule: UnlockRule, today: date) -> Tuple[int, Optional[int], str]:
        s = get_settings()
        if isinstance(rule, RuleOnboardingComplete):
            cur, tgt = await self.metrics.onboarding_complete_score(user_id)
            return cur, tgt, "completado"
        if isinstance(rule, RuleActiveGoal):
            cur, tgt = await self.metrics.active_goal_score(user_id)
            return cur, tgt, "objetivo"
        if isinstance(rule, RuleCountAction):
            n = await self.repo.count_ledger_all(user_id, rule.action_kind)
            return n, rule.target, "acciones"
        if isinstance(rule, RuleCountUniqueDays):
            grace = rule.grace_days_after_calendar_day
            if rule.action_kind == "meal_logged":
                days = await self.metrics.distinct_meal_days_with_grace(user_id, grace_days=grace)
                return len(days), rule.target, "dias"
            n = await self.metrics.count_unique_days_from_ledger(user_id, rule.action_kind)
            return n, rule.target, "dias"
        if isinstance(rule, RuleStreakDays):
            grace = rule.grace_days_after_calendar_day
            streak = await self.metrics.streak_meal_days(
                user_id,
                min_meals_per_day=rule.min_meals_per_day,
                grace_days=grace,
                today=today,
            )
            return streak, rule.target, "dias_racha"
        if isinstance(rule, RuleCompleteDays):
            gap = rule.min_minutes_between_meals or s.badge_complete_day_min_minutes_between_meals
            n = await self.metrics.count_complete_days(
                user_id,
                min_real_meals=rule.min_real_meals,
                min_minutes_between_meals=gap,
                min_kcal_per_meal=rule.min_kcal_per_meal,
            )
            return n, rule.target, "dias_completos"
        if isinstance(rule, RuleCoachMessages):
            n = await self.metrics.count_coach_user_messages(user_id)
            return n, rule.target, "mensajes"
        if isinstance(rule, RuleWeightLogs):
            n = await self.metrics.count_weight_distinct_days(user_id)
            return n, rule.target, "dias_peso"
        if isinstance(rule, RuleWeightWeekStreak):
            n = await self.metrics.max_weight_consecutive_weeks(user_id)
            return n, rule.target, "semanas_peso"
        if isinstance(rule, RuleWaterDays):
            n = await self.metrics.count_distinct_water_days(
                user_id, min_glasses_per_day=rule.min_glasses_per_day
            )
            return n, rule.target, "dias_agua"
        if isinstance(rule, RuleDiaryEntries):
            n = await self.metrics.count_meal_entries(user_id)
            return n, rule.target, "registros"
        if isinstance(rule, RuleHabitsCompleted):
            n = await self.metrics.count_habit_proxy_days(user_id)
            return n, rule.target, "dias"
        if isinstance(rule, RulePlanningActions):
            n = await self.metrics.count_plan_generations(user_id)
            return n, rule.target, "planes"
        if isinstance(rule, RuleExplorationActions):
            n = await self.repo.count_ledger_exploration(user_id)
            return n, rule.target, "exploraciones"
        if isinstance(rule, RuleMacroGoalDays):
            n = await self.metrics.count_days_macros_within_margin(user_id, rule.margin_pct)
            return n, rule.target, "dias_macros"
        if isinstance(rule, RuleBalancedWeek):
            min_good = max(1, math.ceil(rule.window_days * rule.min_day_fraction - 1e-9))
            n = await self.metrics.count_balanced_days_in_window(
                user_id,
                end_day=today,
                window_days=rule.window_days,
                macro_margin_pct=rule.macro_margin_pct,
                min_glasses=rule.water_glasses_goal,
            )
            return n, min_good, "dias_balance"
        if isinstance(rule, RulePremiumActive):
            cur, tgt = await self.metrics.premium_active_score(user_id)
            return cur, tgt, "premium"
        if isinstance(rule, RuleVersatileLogger):
            n = await self.repo.count_distinct_ledger_action_kinds(user_id, rule.action_kinds)
            return n, rule.target, "metodos_registro"
        return 0, None, ""
