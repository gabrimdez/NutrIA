"""Tests for FatSecret mapper."""
import pytest
from app.food_providers.mappers.fatsecret_mapper import map_fatsecret_food, map_fatsecret_search_results


SAMPLE_FOOD = {
    "food_id": "12345",
    "food_name": "Chicken Breast",
    "brand_name": "",
    "food_type": "Generic",
    "food_description": "Per 100g - Calories: 165kcal | Fat: 3.57g | Carbs: 0g | Protein: 31.02g",
    "servings": {
        "serving": [
            {
                "serving_description": "100 g",
                "metric_serving_amount": "100.000",
                "metric_serving_unit": "g",
                "number_of_units": "1.000",
                "calories": "165",
                "protein": "31.02",
                "carbohydrate": "0",
                "fat": "3.57",
                "fiber": "0",
            },
            {
                "serving_description": "1 breast (approx 170g)",
                "metric_serving_amount": "170.000",
                "metric_serving_unit": "g",
                "number_of_units": "1.000",
                "calories": "280",
                "protein": "52.73",
                "carbohydrate": "0",
                "fat": "6.07",
                "fiber": "0",
            },
        ]
    },
}


class TestFatSecretMapper:
    def test_basic_mapping(self):
        item = map_fatsecret_food(SAMPLE_FOOD)
        assert item is not None
        assert item.source == "fatsecret"
        assert item.source_id == "12345"
        assert item.name == "Chicken Breast"

    def test_per_100g_from_exact_serving(self):
        item = map_fatsecret_food(SAMPLE_FOOD)
        assert item.per_100g is not None
        assert item.per_100g.calories == 165.0
        assert item.per_100g.protein == 31.0

    def test_per_serving(self):
        item = map_fatsecret_food(SAMPLE_FOOD)
        assert item.per_serving is not None
        assert item.per_serving.calories == 280.0

    def test_type_generic(self):
        item = map_fatsecret_food(SAMPLE_FOOD)
        assert item.type == "generic"

    def test_type_branded(self):
        food = {**SAMPLE_FOOD, "brand_name": "Tyson"}
        item = map_fatsecret_food(food)
        assert item.type == "branded"
        assert item.brand == "Tyson"

    def test_empty_name_returns_none(self):
        food = {**SAMPLE_FOOD, "food_name": ""}
        assert map_fatsecret_food(food) is None

    def test_search_results_mapping(self):
        data = {"foods": {"food": [SAMPLE_FOOD]}}
        results = map_fatsecret_search_results(data)
        assert len(results) == 1
        assert results[0].name == "Chicken Breast"

    def test_search_results_single_food(self):
        data = {"foods": {"food": SAMPLE_FOOD}}
        results = map_fatsecret_search_results(data)
        assert len(results) == 1

    def test_search_results_empty(self):
        data = {"foods": {}}
        results = map_fatsecret_search_results(data)
        assert len(results) == 0

    def test_scale_to_100g_when_missing(self):
        food = {
            "food_id": "99",
            "food_name": "Yogurt",
            "servings": {
                "serving": {
                    "serving_description": "1 cup",
                    "metric_serving_amount": "200.000",
                    "metric_serving_unit": "g",
                    "number_of_units": "1.000",
                    "calories": "200",
                    "protein": "10",
                    "carbohydrate": "30",
                    "fat": "5",
                }
            },
        }
        item = map_fatsecret_food(food)
        assert item is not None
        assert item.per_100g is not None
        assert item.per_100g.calories == 100.0
        assert item.per_100g.protein == 5.0
