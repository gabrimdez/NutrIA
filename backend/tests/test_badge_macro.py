"""Reglas de realismo de comidas para insignias."""
from types import SimpleNamespace

from app.services.badge_macro import meal_entry_passes_macro_realism


def test_macro_realism_respects_min_kcal_threshold():
    low = SimpleNamespace(total_kcal=17.0)
    assert meal_entry_passes_macro_realism(low, min_kcal_per_meal=0) is True
    assert meal_entry_passes_macro_realism(low, min_kcal_per_meal=80) is False
    high = SimpleNamespace(total_kcal=702.0)
    assert meal_entry_passes_macro_realism(high, min_kcal_per_meal=80) is True
