"""Tests anti-abuso y helpers de insignias (sin BD)."""
from datetime import date, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.badges import FeaturedBadgesUpdateDTO
from app.services.badge_antifraud import (
    coach_text_eligible,
    fingerprint_for_search,
    meal_spacing_complete,
    streak_from_day_flags,
)


def test_coach_text_too_short():
    assert coach_text_eligible("") is False
    assert coach_text_eligible(" ") is False
    assert coach_text_eligible("a") is False
    assert coach_text_eligible("  x  ") is False
    assert coach_text_eligible("  ok  ") is True


def test_fingerprint_search_stable():
    assert fingerprint_for_search("  Arroz  ") == fingerprint_for_search("arroz")


def test_meal_spacing_three_meals_requires_gap():
    base = datetime(2026, 4, 23, 8, 0, 0)
    t1 = base
    t2 = base + timedelta(minutes=30)
    t3 = base + timedelta(minutes=60)
    assert meal_spacing_complete([t1, t2, t3], min_meals=3, min_gap_minutes=90) is False

    ok2 = base + timedelta(minutes=100)
    ok3 = base + timedelta(minutes=220)
    assert meal_spacing_complete([t1, ok2, ok3], min_meals=3, min_gap_minutes=90) is True


def test_streak_requires_consecutive_days():
    today = date(2026, 4, 23)
    flags = {
        date(2026, 4, 23): True,
        date(2026, 4, 22): True,
        date(2026, 4, 20): True,
    }
    assert streak_from_day_flags(flags, today=today) == 2


def test_featured_max_three():
    FeaturedBadgesUpdateDTO(badge_ids=["a", "b", "c"])
    with pytest.raises(ValidationError):
        FeaturedBadgesUpdateDTO(badge_ids=["a", "b", "c", "d"])


def test_parse_unlock_rule_manual_and_streak():
    from app.schemas.badge_rules import parse_unlock_rule

    m = parse_unlock_rule({"type": "manual_only"})
    assert m is not None and getattr(m, "type", None) == "manual_only"
    s = parse_unlock_rule({"type": "streak_days", "target": 7, "min_meals_per_day": 1})
    assert s is not None and s.type == "streak_days"  # type: ignore[attr-defined]
    o = parse_unlock_rule({"type": "onboarding_complete"})
    assert o is not None and o.type == "onboarding_complete"  # type: ignore[attr-defined]
    ag = parse_unlock_rule({"type": "active_goal"})
    assert ag is not None and ag.type == "active_goal"  # type: ignore[attr-defined]
    mg = parse_unlock_rule({"type": "macro_goal_days", "target": 1, "margin_pct": 10})
    assert mg is not None and mg.type == "macro_goal_days"  # type: ignore[attr-defined]
    mg7 = parse_unlock_rule({"type": "macro_goal_days", "target": 7, "margin_pct": 10})
    assert mg7 is not None and mg7.type == "macro_goal_days" and mg7.target == 7  # type: ignore[attr-defined]
    wd = parse_unlock_rule({"type": "water_days", "target": 1})
    assert wd is not None and wd.type == "water_days"  # type: ignore[attr-defined]
    wd7 = parse_unlock_rule({"type": "water_days", "target": 7})
    assert wd7 is not None and wd7.type == "water_days" and wd7.target == 7  # type: ignore[attr-defined]
    wd14 = parse_unlock_rule({"type": "water_days", "target": 14, "min_glasses_per_day": 2})
    assert wd14 is not None and wd14.type == "water_days" and wd14.min_glasses_per_day == 2  # type: ignore[attr-defined]
    wl = parse_unlock_rule({"type": "weight_logs", "target": 1})
    assert wl is not None and wl.type == "weight_logs"  # type: ignore[attr-defined]
    wws = parse_unlock_rule({"type": "weight_week_streak", "target": 4})
    assert wws is not None and wws.type == "weight_week_streak" and wws.target == 4  # type: ignore[attr-defined]
    pr = parse_unlock_rule(
        {"type": "count_action", "action_kind": "progress_summary_viewed", "target": 1}
    )
    assert pr is not None and pr.type == "count_action"  # type: ignore[attr-defined]
    fs = parse_unlock_rule({"type": "count_action", "action_kind": "food_search", "target": 5})
    assert fs is not None and fs.type == "count_action" and fs.target == 5  # type: ignore[attr-defined]
    bc = parse_unlock_rule({"type": "count_action", "action_kind": "barcode_scan", "target": 3})
    assert bc is not None and bc.type == "count_action" and bc.action_kind == "barcode_scan"  # type: ignore[attr-defined]
    ph = parse_unlock_rule({"type": "count_action", "action_kind": "photo_analyze", "target": 3})
    assert ph is not None and ph.type == "count_action" and ph.action_kind == "photo_analyze"  # type: ignore[attr-defined]
    te = parse_unlock_rule({"type": "count_action", "action_kind": "text_entry_meal", "target": 5})
    assert te is not None and te.type == "count_action" and te.action_kind == "text_entry_meal"  # type: ignore[attr-defined]
    sm = parse_unlock_rule({"type": "count_action", "action_kind": "saved_meal_created", "target": 1})
    assert sm is not None and sm.type == "count_action" and sm.action_kind == "saved_meal_created"  # type: ignore[attr-defined]
    rl = parse_unlock_rule({"type": "count_action", "action_kind": "recipe_logged", "target": 3})
    assert rl is not None and rl.type == "count_action" and rl.action_kind == "recipe_logged"  # type: ignore[attr-defined]
    pg = parse_unlock_rule({"type": "count_action", "action_kind": "plan_generated", "target": 1})
    assert pg is not None and pg.type == "count_action" and pg.action_kind == "plan_generated"  # type: ignore[attr-defined]
    pe = parse_unlock_rule({"type": "count_action", "action_kind": "plan_edited", "target": 3})
    assert pe is not None and pe.type == "count_action" and pe.action_kind == "plan_edited"  # type: ignore[attr-defined]
    gl = parse_unlock_rule({"type": "count_action", "action_kind": "grocery_list_made", "target": 1})
    assert gl is not None and gl.type == "count_action" and gl.action_kind == "grocery_list_made"  # type: ignore[attr-defined]
    gc = parse_unlock_rule({"type": "count_action", "action_kind": "groceries_item_checked", "target": 10})
    assert gc is not None and gc.type == "count_action" and gc.action_kind == "groceries_item_checked" and gc.target == 10  # type: ignore[attr-defined]
    cf = parse_unlock_rule({"type": "coach_messages", "target": 1})
    assert cf is not None and cf.type == "coach_messages" and cf.target == 1  # type: ignore[attr-defined]
    c7 = parse_unlock_rule({"type": "coach_messages", "target": 7})
    assert c7 is not None and c7.type == "coach_messages" and c7.target == 7  # type: ignore[attr-defined]
    cwp = parse_unlock_rule({"type": "count_action", "action_kind": "coach_chat_photo", "target": 1})
    assert cwp is not None and cwp.type == "count_action" and cwp.action_kind == "coach_chat_photo"  # type: ignore[attr-defined]
    ins = parse_unlock_rule({"type": "count_action", "action_kind": "coach_insight_saved", "target": 3})
    assert ins is not None and ins.type == "count_action" and ins.action_kind == "coach_insight_saved" and ins.target == 3  # type: ignore[attr-defined]
    pr = parse_unlock_rule({"type": "premium_active"})
    assert pr is not None and pr.type == "premium_active"  # type: ignore[attr-defined]
    vl = parse_unlock_rule({"type": "versatile_logger", "target": 5})
    assert vl is not None and vl.type == "versatile_logger" and vl.target == 5  # type: ignore[attr-defined]
    bw = parse_unlock_rule(
        {
            "type": "balanced_week",
            "window_days": 7,
            "macro_margin_pct": 10,
            "min_day_fraction": 0.8,
            "water_glasses_goal": 12,
        }
    )
    assert bw is not None and bw.type == "balanced_week" and bw.window_days == 7  # type: ignore[attr-defined]
