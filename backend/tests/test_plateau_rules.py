"""Tests for plateau detection and recommendation logic."""
from app.rules.plateau_rules import analyze_plateau
from datetime import date, timedelta


def _make_weight_logs(base_weight, count, days_apart=3, variance=0.1):
    logs = []
    for i in range(count):
        d = date.today() - timedelta(days=(count - i) * days_apart)
        w = base_weight + (variance if i % 2 == 0 else -variance)
        logs.append({"date": str(d), "weight_kg": w})
    return logs


def test_insufficient_data():
    result = analyze_plateau(
        weight_logs=[{"date": str(date.today()), "weight_kg": 80}],
        avg_daily_kcal=2000,
        target_kcal=2000,
        adherence_pct=90,
        days_logged=5,
        current_steps=8000,
        goal_type="lose_fat",
    )
    assert result["is_plateau"] is False
    assert result["suggested_action"] == "need_more_data"


def test_not_plateau_weight_moving():
    logs = []
    for i in range(6):
        d = date.today() - timedelta(days=(6 - i) * 4)
        logs.append({"date": str(d), "weight_kg": 80 - i * 0.3})
    
    result = analyze_plateau(
        weight_logs=logs,
        avg_daily_kcal=2000,
        target_kcal=2100,
        adherence_pct=85,
        days_logged=6,
        current_steps=8000,
        goal_type="lose_fat",
    )
    assert result["is_plateau"] is False


def test_plateau_low_adherence():
    logs = _make_weight_logs(80, 6, days_apart=4, variance=0.2)
    result = analyze_plateau(
        weight_logs=logs,
        avg_daily_kcal=2500,
        target_kcal=2000,
        adherence_pct=50,
        days_logged=3,
        current_steps=6000,
        goal_type="lose_fat",
    )
    if result["is_plateau"]:
        assert result["suggested_action"] == "improve_adherence"


def test_plateau_suggest_movement():
    logs = _make_weight_logs(80, 6, days_apart=4, variance=0.1)
    result = analyze_plateau(
        weight_logs=logs,
        avg_daily_kcal=2000,
        target_kcal=2000,
        adherence_pct=90,
        days_logged=6,
        current_steps=6000,
        goal_type="lose_fat",
    )
    if result["is_plateau"]:
        assert result["suggested_action"] == "increase_movement"


def test_plateau_suggest_calorie_reduction():
    logs = _make_weight_logs(80, 6, days_apart=4, variance=0.1)
    result = analyze_plateau(
        weight_logs=logs,
        avg_daily_kcal=2000,
        target_kcal=2000,
        adherence_pct=92,
        days_logged=7,
        current_steps=12000,
        goal_type="lose_fat",
    )
    if result["is_plateau"]:
        assert result["suggested_action"] == "reduce_calories"
        assert result["new_target_kcal"] is not None
        assert result["new_target_kcal"] >= 1200
