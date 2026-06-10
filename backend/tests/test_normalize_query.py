"""Tests for normalize_food_query and accent-insensitive equivalences."""
import pytest
from app.food_providers.search_normalize import normalize_food_query, fold_accents


class TestNormalizeFoodQuery:
    def test_lowercase(self):
        assert normalize_food_query("POLLO") == "pollo"

    def test_trim(self):
        assert normalize_food_query("  arroz  ") == "arroz"

    def test_collapse_spaces(self):
        assert normalize_food_query("pechuga  de   pollo") == "pechuga de pollo"

    def test_strip_accents(self):
        assert normalize_food_query("plátano") == "platano"
        assert normalize_food_query("atún") == "atun"
        assert normalize_food_query("brócoli") == "brocoli"

    def test_equivalences(self):
        assert normalize_food_query("plátano") == normalize_food_query("platano")
        assert normalize_food_query("Atún") == normalize_food_query("atun")
        assert normalize_food_query("BRÓCOLI") == normalize_food_query("brocoli")
        assert normalize_food_query("Café") == normalize_food_query("cafe")
        assert normalize_food_query("Jamón") == normalize_food_query("jamon")

    def test_empty_and_whitespace(self):
        assert normalize_food_query("") == ""
        assert normalize_food_query("   ") == ""

    def test_combined(self):
        assert normalize_food_query("  Pechuga DE  Pollo  ") == "pechuga de pollo"
        assert normalize_food_query("Salmón Ahumado") == "salmon ahumado"


class TestFoldAccents:
    def test_basic(self):
        assert fold_accents("café") == "cafe"
        assert fold_accents("NIÑO") == "nino"

    def test_no_accents(self):
        assert fold_accents("arroz") == "arroz"

    def test_multiple_accents(self):
        assert fold_accents("plátano fácil") == "platano facil"
