"""Tests for allergy / intolerance / forbidden food post-generation validation."""
import pytest

from app.rules.allergy_validation import (
    check_food_against_restrictions,
    validate_plan_restrictions,
    _expand_restrictions,
)


class TestExpandRestrictions:
    def test_gluten_expands(self):
        terms = _expand_restrictions(["gluten"])
        assert "pan" in terms
        assert "pasta" in terms
        assert "seitán" in terms
        assert "gluten" in terms

    def test_lactosa_expands(self):
        terms = _expand_restrictions(["lactosa"])
        assert "leche" in terms
        assert "yogur" in terms
        assert "queso" in terms

    def test_synonym_lookup_reverse(self):
        terms = _expand_restrictions(["tofu"])
        assert "soja" in terms
        assert "tempeh" in terms

    def test_unknown_restriction_stays(self):
        terms = _expand_restrictions(["kiwi"])
        assert "kiwi" in terms
        assert len(terms) == 1

    def test_empty(self):
        assert _expand_restrictions([]) == set()


class TestCheckFoodAgainstRestrictions:
    def test_direct_match(self):
        assert check_food_against_restrictions("Leche entera", ["lactosa"]) is not None

    def test_synonym_match(self):
        assert check_food_against_restrictions("Tostada integral", ["gluten"]) is not None

    def test_no_match(self):
        assert check_food_against_restrictions("Pollo a la plancha", ["lactosa"]) is None

    def test_case_insensitive(self):
        assert check_food_against_restrictions("PASTA INTEGRAL", ["gluten"]) is not None

    def test_no_restrictions(self):
        assert check_food_against_restrictions("Leche", []) is None

    def test_pork_cerdo(self):
        assert check_food_against_restrictions("Solomillo de cerdo", ["cerdo"]) is not None

    def test_jamon_via_cerdo(self):
        assert check_food_against_restrictions("Jamón serrano", ["cerdo"]) is not None


class TestValidatePlanRestrictions:
    @pytest.fixture
    def sample_plan_days(self):
        return [
            {
                "day_number": 1,
                "meals": [
                    {
                        "title": "Desayuno",
                        "foods": [
                            {"name": "Tostada integral con tomate"},
                            {"name": "Yogur griego natural"},
                        ],
                    },
                    {
                        "title": "Comida",
                        "foods": [
                            {"name": "Pasta con pollo"},
                            {"name": "Ensalada mixta"},
                        ],
                    },
                ],
            },
        ]

    def test_no_violations_when_no_restrictions(self, sample_plan_days):
        result = validate_plan_restrictions(sample_plan_days, [], [], [])
        assert result == []

    def test_gluten_violation(self, sample_plan_days):
        result = validate_plan_restrictions(sample_plan_days, ["gluten"], [], [])
        food_names = [v["food_name"] for v in result]
        assert any("Tostada" in n for n in food_names)
        assert any("Pasta" in n for n in food_names)

    def test_lactosa_violation(self, sample_plan_days):
        result = validate_plan_restrictions(sample_plan_days, [], ["lactosa"], [])
        food_names = [v["food_name"] for v in result]
        assert any("Yogur" in n for n in food_names)

    def test_forbidden_food(self, sample_plan_days):
        result = validate_plan_restrictions(sample_plan_days, [], [], ["pollo"])
        food_names = [v["food_name"] for v in result]
        assert any("pollo" in n.lower() for n in food_names)

    def test_restriction_type_labels(self, sample_plan_days):
        result = validate_plan_restrictions(
            sample_plan_days,
            allergies=["gluten"],
            intolerances=["lactosa"],
            forbidden_foods=["pollo"],
        )
        types = {v["restriction_type"] for v in result}
        assert "alergia" in types
        assert "intolerancia" in types
        assert "alimento prohibido" in types
