"""Tests for deterministic nutrition calculations."""
import pytest
from app.rules.nutrition_rules import (
    calculate_bmr,
    calculate_tdee,
    calculate_target_calories,
    adjust_target_calories_for_overweight_deficit,
    calculate_bmi,
    calculate_macros,
    calculate_food_macros,
    calculate_steps_target,
    resolve_protein_per_kg,
)


def test_bmr_male():
    bmr = calculate_bmr("male", 80, 180, 30)
    assert 1700 < bmr < 1900


def test_bmr_female():
    bmr = calculate_bmr("female", 60, 165, 25)
    assert 1300 < bmr < 1500


def test_tdee_moderate():
    tdee = calculate_tdee(1800, "moderate")
    assert tdee == round(1800 * 1.55)


def test_target_calories_lose_fat():
    target = calculate_target_calories(2500, "lose_fat")
    assert target == round(2500 * 0.85)


def test_target_calories_gain_muscle():
    target = calculate_target_calories(2500, "gain_muscle")
    assert target == round(2500 * 1.10)


def test_target_calories_minimum_floor():
    target = calculate_target_calories(1000, "lose_fat")
    assert target >= 1200


def test_bmi_calculation():
    bmi = calculate_bmi(90, 175)
    assert 29.0 < bmi < 30.0


def test_overweight_deficit_caps_high_tdee():
    """IMC ~29, déficit: no dejar ~2700 si el TDEE declarado es muy alto."""
    bmr = calculate_bmr("male", 90, 175, 30)
    tdee = calculate_tdee(bmr, "active")
    raw = calculate_target_calories(tdee, "lose_fat")
    capped = adjust_target_calories_for_overweight_deficit(
        raw, float(tdee), float(bmr), 90.0, 175.0, "lose_fat"
    )
    assert capped < raw
    assert capped >= 1200


def test_overweight_cap_skipped_for_maintain():
    bmr = calculate_bmr("male", 90, 175, 30)
    tdee = calculate_tdee(bmr, "active")
    raw = calculate_target_calories(tdee, "maintain")
    capped = adjust_target_calories_for_overweight_deficit(
        raw, float(tdee), float(bmr), 90.0, 175.0, "maintain"
    )
    assert capped == raw


def test_macros_lose_fat():
    macros = calculate_macros(2000, 80, "lose_fat", activity_level="sedentary")
    assert macros["protein_g"] == round(80 * 1.2)
    assert macros["fat_g"] > 0
    assert macros["carbs_g"] > 0
    total_kcal = macros["protein_g"] * 4 + macros["carbs_g"] * 4 + macros["fat_g"] * 9
    assert abs(total_kcal - 2000) < 50


def test_macros_active_more_carbs_than_sedentary():
    base = calculate_macros(2500, 85, "maintain", activity_level="light")
    active = calculate_macros(2500, 85, "maintain", activity_level="active")
    assert active["protein_g"] > base["protein_g"]
    assert active["fat_g"] <= base["fat_g"]


def test_macros_gain_muscle():
    macros = calculate_macros(3000, 90, "gain_muscle", activity_level="moderate")
    assert macros["protein_g"] == round(90 * 1.6)
    assert macros["carbs_g"] > macros["fat_g"]


def test_resolve_protein_per_kg_sedentary_maintain():
    assert resolve_protein_per_kg("maintain", "sedentary", None) == pytest.approx(0.8)


def test_resolve_protein_per_kg_training_days_boosts_base():
    """4+ días de fuerza acerca el objetivo al rango hipertrofia aunque la actividad sea moderada."""
    low = resolve_protein_per_kg("maintain", "moderate", 2)
    high = resolve_protein_per_kg("maintain", "moderate", 5)
    assert high > low


def test_food_macros_calculation():
    result = calculate_food_macros(165, 31, 0, 3.6, 150)
    assert result["kcal"] == pytest.approx(247.5, abs=0.1)
    assert result["protein_g"] == pytest.approx(46.5, abs=0.1)
    assert result["carbs_g"] == pytest.approx(0, abs=0.1)
    assert result["fat_g"] == pytest.approx(5.4, abs=0.1)


def test_food_macros_zero_grams():
    result = calculate_food_macros(100, 10, 20, 5, 0)
    assert result["kcal"] == 0
    assert result["protein_g"] == 0


def test_steps_target_lose_fat_sedentary():
    steps = calculate_steps_target("sedentary", "lose_fat")
    assert steps == 7500


def test_steps_target_active_maintain():
    steps = calculate_steps_target("active", "maintain")
    assert steps == 10000
