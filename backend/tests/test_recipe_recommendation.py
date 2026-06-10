"""Tests for recipe recommendation engine."""
import pytest
from types import SimpleNamespace

from app.services.recipe_recommendation import recommend_recipes, _current_meal_type


def _make_recipe(name, kcal, protein, items=None, servings=1, recipe_id="abc"):
    return SimpleNamespace(
        id=recipe_id,
        name=name,
        total_kcal=kcal,
        total_protein_g=protein,
        servings=servings,
        items=items or [],
    )


class TestRecommendRecipes:
    def test_empty_recipes(self):
        result = recommend_recipes([], 2000, 120)
        assert result == []

    def test_basic_ranking(self):
        recipes = [
            _make_recipe("Pollo con arroz", 500, 40, recipe_id="1"),
            _make_recipe("Ensalada enorme", 200, 10, recipe_id="2"),
            _make_recipe("Tostada simple", 150, 5, recipe_id="3"),
        ]
        result = recommend_recipes(
            recipes, target_kcal=2000, target_protein_g=120, meals_per_day=4,
        )
        assert len(result) <= 6
        assert result[0]["name"] == "Pollo con arroz"

    def test_excludes_allergies(self):
        recipes = [
            _make_recipe("Pasta boloñesa", 600, 30,
                         items=[{"custom_name": "Pasta integral"}, {"custom_name": "Carne picada"}]),
            _make_recipe("Arroz con pollo", 500, 35,
                         items=[{"custom_name": "Arroz basmati"}, {"custom_name": "Pollo"}]),
        ]
        result = recommend_recipes(
            recipes, target_kcal=2000, target_protein_g=120,
            allergies=["gluten"],
        )
        names = [r["name"] for r in result]
        assert "Pasta boloñesa" not in names
        assert "Arroz con pollo" in names

    def test_excludes_forbidden_foods(self):
        recipes = [
            _make_recipe("Solomillo de cerdo", 400, 35,
                         items=[{"custom_name": "cerdo"}]),
            _make_recipe("Pechuga de pollo", 350, 40,
                         items=[{"custom_name": "pollo"}]),
        ]
        result = recommend_recipes(
            recipes, target_kcal=2000, target_protein_g=120,
            forbidden_foods=["cerdo"],
        )
        names = [r["name"] for r in result]
        assert "Solomillo de cerdo" not in names

    def test_max_results(self):
        recipes = [_make_recipe(f"R{i}", 400, 30, recipe_id=str(i)) for i in range(20)]
        result = recommend_recipes(recipes, target_kcal=2000, target_protein_g=120, max_results=3)
        assert len(result) == 3

    def test_reasons_populated(self):
        recipes = [_make_recipe("Pollo fit", 500, 35, recipe_id="1")]
        result = recommend_recipes(recipes, target_kcal=2000, target_protein_g=120, meals_per_day=4)
        assert len(result) == 1
        assert len(result[0]["reasons"]) >= 1

    def test_servings_division(self):
        recipes = [_make_recipe("Batch cook", 2000, 120, servings=4, recipe_id="1")]
        result = recommend_recipes(recipes, target_kcal=2000, target_protein_g=120, meals_per_day=4)
        assert result[0]["kcal_per_serving"] == 500.0
        assert result[0]["protein_per_serving"] == 30.0

    def test_meal_type_suggestion(self):
        recipes = [_make_recipe("Test", 400, 30, recipe_id="1")]
        result = recommend_recipes(
            recipes, target_kcal=2000, target_protein_g=120, meal_type_hint="breakfast",
        )
        assert result[0]["meal_type_suggestion"] == "breakfast"
