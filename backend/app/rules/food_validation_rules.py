"""Validation rules for food and nutrition data."""

MIN_KCAL_PER_100G = 0
MAX_KCAL_PER_100G = 900  # Pure fat is ~900
MAX_PROTEIN_PER_100G = 100
MAX_CARBS_PER_100G = 100
MAX_FAT_PER_100G = 100

MIN_MEAL_KCAL = 0
MAX_MEAL_KCAL = 5000
MAX_SINGLE_ITEM_GRAMS = 2000

MIN_DAILY_KCAL_TARGET = 1200
MAX_DAILY_KCAL_TARGET = 6000
MIN_PROTEIN_G_TARGET = 40
MAX_PROTEIN_G_TARGET = 400


def validate_food_macros(kcal: float, protein: float, carbs: float, fat: float,
                         per_100g: bool = True) -> list[str]:
    errors = []
    suffix = " por 100g" if per_100g else ""
    
    if kcal < MIN_KCAL_PER_100G:
        errors.append(f"Calorías negativas{suffix}")
    if per_100g and kcal > MAX_KCAL_PER_100G:
        errors.append(f"Calorías excesivas{suffix}: {kcal}")
    if protein < 0 or (per_100g and protein > MAX_PROTEIN_PER_100G):
        errors.append(f"Proteína fuera de rango{suffix}: {protein}")
    if carbs < 0 or (per_100g and carbs > MAX_CARBS_PER_100G):
        errors.append(f"Carbohidratos fuera de rango{suffix}: {carbs}")
    if fat < 0 or (per_100g and fat > MAX_FAT_PER_100G):
        errors.append(f"Grasas fuera de rango{suffix}: {fat}")
    
    if per_100g:
        calculated_kcal = protein * 4 + carbs * 4 + fat * 9
        if abs(calculated_kcal - kcal) > kcal * 0.20 + 10:
            errors.append(
                f"Las calorías ({kcal}) no coinciden con los macros calculados ({calculated_kcal:.0f})"
            )
    
    return errors


def validate_meal_total(total_kcal: float) -> list[str]:
    errors = []
    if total_kcal > MAX_MEAL_KCAL:
        errors.append(f"Comida con {total_kcal:.0f} kcal parece excesiva")
    return errors


def validate_daily_targets(kcal: float, protein_g: float, carbs_g: float,
                           fat_g: float) -> list[str]:
    errors = []
    if kcal < MIN_DAILY_KCAL_TARGET:
        errors.append(f"Objetivo calórico demasiado bajo: {kcal:.0f} kcal")
    if kcal > MAX_DAILY_KCAL_TARGET:
        errors.append(f"Objetivo calórico demasiado alto: {kcal:.0f} kcal")
    if protein_g < MIN_PROTEIN_G_TARGET:
        errors.append(f"Proteína objetivo demasiado baja: {protein_g:.0f}g")
    if protein_g > MAX_PROTEIN_G_TARGET:
        errors.append(f"Proteína objetivo demasiado alta: {protein_g:.0f}g")
    return errors


def validate_item_grams(grams: float) -> list[str]:
    errors = []
    if grams <= 0:
        errors.append("Los gramos deben ser positivos")
    if grams > MAX_SINGLE_ITEM_GRAMS:
        errors.append(f"Cantidad excesiva: {grams:.0f}g")
    return errors
