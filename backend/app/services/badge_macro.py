"""Validación anti-gaming de macros (extensible; por defecto no bloquea)."""
from __future__ import annotations

from app.models.models import MealEntry


def meal_entry_passes_macro_realism(entry: MealEntry, *, min_kcal_per_meal: float = 0.0) -> bool:
    """Evita micro-registros triviales si min_kcal_per_meal > 0."""
    if min_kcal_per_meal <= 0:
        return True
    return float(entry.total_kcal or 0) >= float(min_kcal_per_meal)
