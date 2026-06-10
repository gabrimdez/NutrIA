from types import SimpleNamespace

import pytest

from app.services.plan_shopping import (
    aggregate_plan_foods_for_shopping,
    canonical_shopping_name_and_raw_grams,
    normalize_plan_label,
    string_list_from_json_field,
    validate_atomic_food_item,
    validate_plan_meals_hard,
)


def test_canonical_shopping_name_normalizes_cooked_rice_label():
    name, grams = canonical_shopping_name_and_raw_grams("Arroz cocido", 200)
    assert name == "Arroz blanco (crudo)"
    assert grams == pytest.approx(200.0)


def test_canonical_shopping_name_skips_blocked_items():
    assert canonical_shopping_name_and_raw_grams("Almendras", 30) == ("", 0.0)
    assert canonical_shopping_name_and_raw_grams("Ensalada mixta", 180) == ("", 0.0)


def test_validate_atomic_food_item_rejects_non_gram_units():
    with pytest.raises(ValueError, match="quita unidades/piezas"):
        validate_atomic_food_item({"name": "2 huevos", "grams": 120}, "Plan")


def test_validate_plan_meals_hard_rejects_invalid_foods():
    with pytest.raises(ValueError, match="quita unidades/piezas"):
        validate_plan_meals_hard(
            [{"foods": [{"name": "1 taza de arroz", "grams": 90}]}],
            "Plan semanal",
        )


def test_aggregate_plan_foods_for_shopping_merges_duplicate_foods():
    plan = SimpleNamespace(
        days=[
            SimpleNamespace(
                meals=[
                    SimpleNamespace(foods=[{"name": "Arroz cocido", "grams": 200}]),
                    SimpleNamespace(foods=[{"name": "Arroz basmati cocido", "grams": 100}]),
                ]
            )
        ]
    )
    assert aggregate_plan_foods_for_shopping(plan) == {
        "Arroz blanco (crudo)": pytest.approx(200.0),
        "Arroz basmati (crudo)": pytest.approx(100.0),
    }


def test_string_list_from_json_field_normalizes_values():
    assert string_list_from_json_field(["  arroz  ", None, 42, ""]) == ["arroz", "42"]


def test_normalize_plan_label_trims_empty_values():
    assert normalize_plan_label("  Plan fuerza  ") == "Plan fuerza"
    assert normalize_plan_label("   ") is None
