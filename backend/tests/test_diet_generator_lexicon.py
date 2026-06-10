from app.ai.diet_generator_lexicon import (
    DAY_LABELS_ES,
    GOAL_TYPE_LABEL_ES,
    contains_any,
    food_groups,
    food_name_lower,
)


def test_food_name_lower_handles_empty_values():
    assert food_name_lower(None) == ""
    assert food_name_lower("  Yogur  ") == "yogur"


def test_contains_any_matches_known_tokens():
    assert contains_any("yogur griego con avena", ("avena", "arroz"))
    assert not contains_any("merluza", ("avena", "arroz"))


def test_food_groups_detects_multiple_categories():
    groups = food_groups("Yogur griego con avena y platano")
    assert {"protein", "carb", "fruit", "dairy"}.issubset(groups)


def test_translated_labels_are_available():
    assert DAY_LABELS_ES[0] == "Lunes"
    assert GOAL_TYPE_LABEL_ES["gain_muscle"] == "ganar músculo"
