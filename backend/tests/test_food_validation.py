"""Tests for food and nutrition validation rules."""
from app.rules.food_validation_rules import (
    validate_food_macros, validate_meal_total,
    validate_daily_targets, validate_item_grams,
)


def test_valid_food_macros():
    errors = validate_food_macros(165, 31, 0, 3.6)
    assert len(errors) == 0


def test_excessive_calories():
    errors = validate_food_macros(1500, 10, 10, 10)
    assert any("excesivas" in e for e in errors)


def test_negative_protein():
    errors = validate_food_macros(100, -5, 20, 5)
    assert any("Proteína" in e for e in errors)


def test_macro_mismatch():
    errors = validate_food_macros(500, 10, 10, 10)
    assert any("no coinciden" in e for e in errors)


def test_valid_meal_total():
    errors = validate_meal_total(800)
    assert len(errors) == 0


def test_excessive_meal():
    errors = validate_meal_total(6000)
    assert len(errors) > 0


def test_valid_daily_targets():
    errors = validate_daily_targets(2200, 160, 250, 70)
    assert len(errors) == 0


def test_too_low_calories():
    errors = validate_daily_targets(800, 60, 100, 20)
    assert any("bajo" in e for e in errors)


def test_too_high_protein():
    errors = validate_daily_targets(3000, 500, 200, 80)
    assert any("alta" in e for e in errors)


def test_valid_grams():
    errors = validate_item_grams(150)
    assert len(errors) == 0


def test_zero_grams():
    errors = validate_item_grams(0)
    assert len(errors) > 0


def test_excessive_grams():
    errors = validate_item_grams(5000)
    assert len(errors) > 0
