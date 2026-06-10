"""Tests for scoring, deduplication and re-ranking of nutrition items."""
import pytest
from app.food_providers.search_normalize import (
    score_nutrition_item,
    deduplicate_nutrition_items,
    dedupe_key_nutrition,
)
from app.schemas.food import NutritionFoodItem, MacroBlock


def _item(name: str, source: str = "generic", kcal: float = 100, barcode: str = None,
          brand: str = None, source_id: str = None) -> NutritionFoodItem:
    return NutritionFoodItem(
        name=name,
        normalized_name=name.lower(),
        source=source,
        source_id=source_id,
        brand=brand,
        barcode=barcode,
        per_100g=MacroBlock(calories=kcal, protein=10, carbs=20, fat=5),
    )


class TestScoring:
    def test_exact_match_highest(self):
        item = _item("pollo")
        score = score_nutrition_item(item, "pollo")
        assert score > 100

    def test_starts_with(self):
        item = _item("pollo asado")
        score = score_nutrition_item(item, "pollo")
        assert 70 <= score < 110

    def test_contains(self):
        item = _item("pechuga de pollo")
        score = score_nutrition_item(item, "pollo")
        assert 40 <= score < 70

    def test_barcode_exact_boost(self):
        item = _item("producto", barcode="8410000001")
        score = score_nutrition_item(item, "8410000001")
        assert score >= 200

    def test_no_calories_penalty(self):
        item = _item("test", kcal=0)
        score = score_nutrition_item(item, "test")
        item_with = _item("test", kcal=100)
        score_with = score_nutrition_item(item_with, "test")
        assert score_with > score

    def test_generic_source_bonus(self):
        local = _item("arroz", source="generic")
        remote = _item("arroz", source="fatsecret")
        assert score_nutrition_item(local, "arroz") > score_nutrition_item(remote, "arroz")


class TestDeduplication:
    def test_same_item_deduped(self):
        items = [_item("pollo", source="generic"), _item("pollo", source="fatsecret")]
        result = deduplicate_nutrition_items(items)
        assert len(result) == 1

    def test_different_items_kept(self):
        items = [_item("pollo"), _item("arroz")]
        result = deduplicate_nutrition_items(items)
        assert len(result) == 2

    def test_barcode_differentiates(self):
        a = _item("leche", barcode="111")
        b = _item("leche", barcode="222")
        result = deduplicate_nutrition_items([a, b])
        assert len(result) == 2

    def test_brand_differentiates(self):
        a = _item("leche", brand="MarcaA")
        b = _item("leche", brand="MarcaB")
        result = deduplicate_nutrition_items([a, b])
        assert len(result) == 2
