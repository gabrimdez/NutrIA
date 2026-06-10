"""Tests for food substitution rules."""
from app.rules.swap_rules import find_swap_candidates, get_food_category, validate_swap


def test_get_category_chicken():
    assert get_food_category("Pechuga de pollo") == "protein_animal"


def test_get_category_rice():
    assert get_food_category("Arroz blanco") == "carbs_grain"


def test_get_category_unknown():
    assert get_food_category("Alimento desconocido") is None


def test_find_swap_excludes_disliked():
    catalog = [
        {"name": "Salmón", "kcal_per_100g": 208, "protein_per_100g": 20.4},
        {"name": "Atún fresco", "kcal_per_100g": 130, "protein_per_100g": 28.2},
        {"name": "Merluza", "kcal_per_100g": 82, "protein_per_100g": 17.9},
    ]
    candidates = find_swap_candidates(
        original_food="Salmón",
        original_kcal=208,
        original_protein=20.4,
        disliked_foods=["atún"],
        allergies=[],
        food_catalog=catalog,
    )
    names = [c["name"] for c in candidates]
    assert "Atún fresco" not in names


def test_find_swap_excludes_allergies():
    catalog = [
        {"name": "Leche entera", "kcal_per_100g": 61, "protein_per_100g": 3.2},
        {"name": "Yogur griego", "kcal_per_100g": 97, "protein_per_100g": 9.0},
    ]
    candidates = find_swap_candidates(
        original_food="Leche entera",
        original_kcal=61,
        original_protein=3.2,
        disliked_foods=[],
        allergies=["yogur"],
        food_catalog=catalog,
    )
    names = [c["name"] for c in candidates]
    assert "Yogur griego" not in names


def test_validate_swap_valid():
    ok, msg = validate_swap(
        {"kcal": 200, "protein_g": 25},
        {"kcal": 210, "protein_g": 23},
    )
    assert ok is True


def test_validate_swap_too_different():
    ok, msg = validate_swap(
        {"kcal": 200, "protein_g": 25},
        {"kcal": 400, "protein_g": 5},
    )
    assert ok is False
