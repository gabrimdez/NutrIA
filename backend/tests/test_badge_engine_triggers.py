"""Disparadores incrementales del motor de insignias (sin BD)."""
from app.schemas.badge_rules import parse_unlock_rule
from app.services.badge_action_context import BadgeActionKind
from app.services.badge_engine import rule_triggered_by_action


def test_water_days_triggers_on_water_not_activity():
    rule = parse_unlock_rule({"type": "water_days", "target": 1})
    assert rule is not None
    assert rule_triggered_by_action(rule, BadgeActionKind.WATER_LOGGED) is True
    assert rule_triggered_by_action(rule, BadgeActionKind.WATER_OR_ACTIVITY) is True
    assert rule_triggered_by_action(rule, BadgeActionKind.ACTIVITY_DAY_LOGGED) is False
    assert rule_triggered_by_action(rule, BadgeActionKind.MEAL_LOGGED) is False


def test_water_days_recompute():
    rule = parse_unlock_rule({"type": "water_days", "target": 1})
    assert rule is not None
    assert rule_triggered_by_action(rule, None) is True


def test_habits_completed_triggers_water_activity_meal():
    rule = parse_unlock_rule({"type": "habits_completed", "target": 7})
    assert rule is not None
    assert rule_triggered_by_action(rule, BadgeActionKind.WATER_LOGGED) is True
    assert rule_triggered_by_action(rule, BadgeActionKind.ACTIVITY_DAY_LOGGED) is True
    assert rule_triggered_by_action(rule, BadgeActionKind.WATER_OR_ACTIVITY) is True
    assert rule_triggered_by_action(rule, BadgeActionKind.MEAL_LOGGED) is True
    assert rule_triggered_by_action(rule, BadgeActionKind.WEIGHT_LOGGED) is False


def test_balanced_week_triggers_water_and_activity():
    rule = parse_unlock_rule(
        {
            "type": "balanced_week",
            "window_days": 7,
            "macro_margin_pct": 10,
            "min_day_fraction": 0.8,
            "water_glasses_goal": 12,
        }
    )
    assert rule is not None
    assert rule_triggered_by_action(rule, BadgeActionKind.WATER_LOGGED) is True
    assert rule_triggered_by_action(rule, BadgeActionKind.ACTIVITY_DAY_LOGGED) is True
    assert rule_triggered_by_action(rule, BadgeActionKind.MEAL_LOGGED) is True
    assert rule_triggered_by_action(rule, BadgeActionKind.COACH_USER_MESSAGE) is False


def test_premium_active_triggers_on_any_action():
    rule = parse_unlock_rule({"type": "premium_active"})
    assert rule is not None
    assert rule_triggered_by_action(rule, BadgeActionKind.COACH_USER_MESSAGE) is True


def test_unknown_count_action_string_still_handled():
    """count_action con action_kind inválido: motor reevalúa (comportamiento existente)."""
    rule = parse_unlock_rule({"type": "count_action", "action_kind": "not_a_real_kind", "target": 1})
    assert rule is not None
    assert rule_triggered_by_action(rule, BadgeActionKind.MEAL_LOGGED) is True
