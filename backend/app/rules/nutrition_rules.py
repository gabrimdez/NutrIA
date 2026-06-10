"""Deterministic nutrition calculation rules.
All calorie/macro calculations happen here, NOT in AI prompts.
"""
from typing import Optional
import math


def calculate_bmi(weight_kg: float, height_cm: float) -> float:
    h_m = height_cm / 100.0
    if h_m <= 0 or weight_kg <= 0:
        return 0.0
    return weight_kg / (h_m * h_m)


def adjust_target_calories_for_overweight_deficit(
    target_kcal: float,
    tdee: float,
    bmr: float,
    weight_kg: float,
    height_cm: float,
    goal_type: str,
) -> float:
    """
    Con sobrepeso u obesidad y objetivo de déficit, evita que un TDEE muy alto
    (p. ej. actividad declarada exagerada) deje un objetivo calórico tan elevado
    que contradiga la intención de perder grasa.
    """
    if goal_type not in ("lose_fat", "recomposition"):
        return round(target_kcal)
    bmi = calculate_bmi(weight_kg, height_cm)
    if bmi < 25.0:
        return round(target_kcal)

    moderate_ref = bmr * ACTIVITY_MULTIPLIERS["moderate"]
    if bmi < 30.0:
        tdee_cap = tdee * 0.78
        metabolic_cap = moderate_ref * 0.88
    elif bmi < 35.0:
        tdee_cap = tdee * 0.74
        metabolic_cap = moderate_ref * 0.84
    else:
        tdee_cap = tdee * 0.70
        metabolic_cap = moderate_ref * 0.80

    capped = min(float(target_kcal), tdee_cap, metabolic_cap)
    return round(max(capped, 1200.0))


# Mifflin-St Jeor equation
def calculate_bmr(sex: str, weight_kg: float, height_cm: float, age: int) -> float:
    if height_cm <= 0 or weight_kg <= 0 or age < 1 or age > 150:
        return 0.0
    if sex == "male":
        return 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    return 10 * weight_kg + 6.25 * height_cm - 5 * age - 161


ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}


def calculate_tdee(bmr: float, activity_level: str) -> float:
    multiplier = ACTIVITY_MULTIPLIERS.get(activity_level, 1.55)
    return round(bmr * multiplier)


GOAL_ADJUSTMENTS = {
    "lose_fat": -0.15,
    "maintain": 0.0,
    "gain_muscle": 0.10,
    "recomposition": -0.05,
}

# Proteína (g/kg/día) según actividad declarada, con toques por objetivo y días de fuerza.
# Referencia clínica habitual: sedentario ~0,8; moderado ~1,0–1,2; fuerza/hipertrofia ~1,6–2,0.
ACTIVITY_PROTEIN_PER_KG = {
    "sedentary": 0.8,
    "light": 1.0,
    "moderate": 1.1,
    "active": 1.45,
    "very_active": 1.75,
}


def resolve_protein_per_kg(
    goal_type: str,
    activity_level: Optional[str],
    training_days_per_week: Optional[int] = None,
) -> float:
    act_key = activity_level if activity_level in ACTIVITY_PROTEIN_PER_KG else "moderate"
    base = ACTIVITY_PROTEIN_PER_KG[act_key]

    if training_days_per_week is not None and int(training_days_per_week) >= 4:
        base = max(base, 1.65)

    if goal_type in ("lose_fat", "recomposition"):
        base = max(base, 1.2)
    elif goal_type == "gain_muscle":
        base = max(base, 1.6)

    return min(base, 2.0)


def calculate_target_calories(tdee: float, goal_type: str) -> float:
    adjustment = GOAL_ADJUSTMENTS.get(goal_type, 0.0)
    target = tdee * (1 + adjustment)
    return round(max(target, 1200))  # Never below 1200 kcal


def calculate_macros(
    target_kcal: float,
    weight_kg: float,
    goal_type: str,
    activity_level: Optional[str] = None,
    training_days_per_week: Optional[int] = None,
) -> dict:
    p_per_kg = resolve_protein_per_kg(goal_type, activity_level, training_days_per_week)
    protein_g = round(weight_kg * p_per_kg)
    protein_kcal = protein_g * 4

    # Con actividad alta o varios días de fuerza, bajar un poco el % fijo en grasa
    # deja más margen a carbohidratos (rendimiento, energía, gimnasio).
    fat_pct = 0.25
    if activity_level in ("active", "very_active"):
        fat_pct = 0.22
    elif training_days_per_week is not None and int(training_days_per_week) >= 4:
        fat_pct = 0.23

    fat_kcal = target_kcal * fat_pct
    fat_g = round(fat_kcal / 9)
    
    remaining_kcal = target_kcal - protein_kcal - fat_kcal
    carbs_g = round(max(remaining_kcal / 4, 50))
    
    return {
        "protein_g": protein_g,
        "carbs_g": carbs_g,
        "fat_g": fat_g,
    }


def calculate_steps_target(activity_level: str, goal_type: str) -> Optional[int]:
    base_steps = {
        "sedentary": 6000,
        "light": 7500,
        "moderate": 8500,
        "active": 10000,
        "very_active": 12000,
    }
    base = base_steps.get(activity_level, 8000)
    if goal_type in ("lose_fat", "recomposition"):
        base += 1500
    return base


def calculate_food_macros(kcal_per_100g: float, protein_per_100g: float,
                          carbs_per_100g: float, fat_per_100g: float,
                          grams: float) -> dict:
    factor = grams / 100.0
    return {
        "kcal": round(kcal_per_100g * factor, 1),
        "protein_g": round(protein_per_100g * factor, 1),
        "carbs_g": round(carbs_per_100g * factor, 1),
        "fat_g": round(fat_per_100g * factor, 1),
    }


def generate_onboarding_summary(
    sex: str, age: int, height_cm: float, weight_kg: float,
    goal_type: str, target_kcal: float, macros: dict,
    steps: Optional[int],
) -> str:
    goal_labels = {
        "lose_fat": "perder grasa",
        "maintain": "mantener peso",
        "gain_muscle": "ganar músculo",
        "recomposition": "recomposición corporal",
    }
    goal_label = goal_labels.get(goal_type, goal_type)
    
    summary = (
        f"Perfil: {'Hombre' if sex == 'male' else 'Mujer'}, {age} años, "
        f"{height_cm:.0f} cm, {weight_kg:.1f} kg.\n"
        f"Objetivo: {goal_label}.\n"
        f"Calorías diarias: {target_kcal:.0f} kcal.\n"
        f"Proteína: {macros['protein_g']}g | "
        f"Carbohidratos: {macros['carbs_g']}g | "
        f"Grasas: {macros['fat_g']}g"
    )
    if steps:
        summary += f"\nPasos recomendados: {steps}/día"
    return summary
