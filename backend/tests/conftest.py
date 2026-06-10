"""Shared test fixtures."""
import os

# Evitar 429 en tests masivos; `slowapi` respeta `rate_limit_enabled`.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

import pytest

from app.core.config import get_settings

get_settings.cache_clear()


@pytest.fixture
def sample_profile():
    return {
        "user_id": "test-user-123",
        "sex": "male",
        "birth_year": 1995,
        "height_cm": 180,
        "current_weight_kg": 80,
    }


@pytest.fixture
def sample_onboarding():
    return {
        "sex": "male",
        "birth_year": 1995,
        "height_cm": 180,
        "current_weight_kg": 80,
        "goal_type": "lose_fat",
        "activity_level": "moderate",
        "training_days_per_week": 4,
        "training_type": "hypertrophy",
        "dietary_preferences": [],
        "disliked_foods": ["hígado"],
        "allergies": [],
        "preferred_meals_per_day": 4,
    }


@pytest.fixture
def sample_food_catalog():
    return [
        {"name": "Pechuga de pollo", "kcal_per_100g": 165, "protein_per_100g": 31, "carbs_per_100g": 0, "fat_per_100g": 3.6},
        {"name": "Salmón", "kcal_per_100g": 208, "protein_per_100g": 20.4, "carbs_per_100g": 0, "fat_per_100g": 13.4},
        {"name": "Atún fresco", "kcal_per_100g": 130, "protein_per_100g": 28.2, "carbs_per_100g": 0, "fat_per_100g": 1.3},
        {"name": "Merluza", "kcal_per_100g": 82, "protein_per_100g": 17.9, "carbs_per_100g": 0, "fat_per_100g": 0.8},
        {"name": "Arroz blanco", "kcal_per_100g": 360, "protein_per_100g": 6.6, "carbs_per_100g": 79.3, "fat_per_100g": 0.6},
    ]
