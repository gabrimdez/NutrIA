"""Tests for LogMeal mapper."""
import pytest
from app.food_providers.mappers.logmeal_mapper import map_logmeal_recognition


SAMPLE_RECOGNITION = {
    "imageId": 123,
    "recognition_results": [
        {
            "id": "1",
            "name": "Pasta Carbonara",
            "prob": 0.85,
            "quantity": 250,
        },
        {
            "id": "2",
            "name": "Salad",
            "prob": 0.6,
            "quantity": 100,
        },
    ],
}

SAMPLE_NUTRITION = {
    "foodItems": [
        {
            "id": "1",
            "name": "Pasta Carbonara",
            "nutritional_info": {
                "totalNutrients": {
                    "calories": 400,
                    "protein": 15,
                    "totalCarbs": 50,
                    "totalFat": 18,
                    "dietaryFiber": 2,
                },
                "servingWeight": 250,
            },
        },
    ],
}


class TestLogMealMapper:
    def test_basic_recognition(self):
        candidates = map_logmeal_recognition(SAMPLE_RECOGNITION)
        assert len(candidates) == 2
        assert candidates[0].name == "Pasta Carbonara"
        assert abs(candidates[0].confidence - 0.85) < 0.1
        assert candidates[0].estimated_grams == 250

    def test_with_nutrition(self):
        candidates = map_logmeal_recognition(SAMPLE_RECOGNITION, SAMPLE_NUTRITION)
        pasta = candidates[0]
        assert pasta.per_serving is not None
        assert pasta.per_serving.calories == 400.0
        assert pasta.per_100g is not None
        assert pasta.per_100g.calories == 160.0

    def test_requires_confirmation_low_prob(self):
        candidates = map_logmeal_recognition(SAMPLE_RECOGNITION)
        salad = candidates[1]
        assert salad.requires_confirmation is True

    def test_requires_confirmation_high_prob(self):
        candidates = map_logmeal_recognition(SAMPLE_RECOGNITION)
        pasta = candidates[0]
        assert pasta.requires_confirmation is False

    def test_source_is_logmeal(self):
        candidates = map_logmeal_recognition(SAMPLE_RECOGNITION)
        assert all(c.source == "logmeal" for c in candidates)

    def test_empty_recognition(self):
        candidates = map_logmeal_recognition({"recognition_results": []})
        assert len(candidates) == 0

    def test_missing_name_skipped(self):
        data = {"recognition_results": [{"id": "x", "name": "", "prob": 0.9}]}
        candidates = map_logmeal_recognition(data)
        assert len(candidates) == 0
