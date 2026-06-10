"""Rules for food substitution logic."""
from typing import List, Optional, Dict

FOOD_CATEGORIES = {
    "protein_animal": ["pollo", "pavo", "ternera", "cerdo", "salmón", "atún", "merluza", "bacalao", "huevo", "gambas", "sepia", "calamar"],
    "protein_vegetal": ["tofu", "tempeh", "seitán", "legumbres", "lentejas", "garbanzos", "edamame"],
    "dairy": ["leche", "yogur", "queso", "requesón", "cottage", "skyr"],
    "carbs_grain": ["arroz", "pasta", "pan", "avena", "quinoa", "cuscús", "patata", "boniato"],
    "carbs_fruit": ["plátano", "manzana", "naranja", "fresas", "arándanos", "kiwi", "pera"],
    "fats_healthy": ["aceite de oliva", "aguacate", "frutos secos", "almendras", "nueces", "cacahuetes"],
    "vegetables": ["brócoli", "espinacas", "judías verdes", "calabacín", "pimiento", "tomate", "zanahoria", "lechuga"],
}


def get_food_category(food_name: str) -> Optional[str]:
    food_lower = food_name.lower()
    for category, foods in FOOD_CATEGORIES.items():
        for f in foods:
            if f in food_lower:
                return category
    return None


def find_swap_candidates(
    original_food: str,
    original_kcal: float,
    original_protein: float,
    disliked_foods: List[str],
    allergies: List[str],
    food_catalog: List[Dict],
    max_candidates: int = 3,
    intolerances: Optional[List[str]] = None,
    forbidden_foods: Optional[List[str]] = None,
) -> List[Dict]:
    category = get_food_category(original_food)
    disliked_lower = [d.lower() for d in disliked_foods]
    all_restricted = list(allergies) + (intolerances or []) + (forbidden_foods or [])
    restricted_lower = [a.lower() for a in all_restricted]
    
    candidates = []
    for food in food_catalog:
        name_lower = food["name"].lower()
        
        if name_lower == original_food.lower():
            continue
        if any(d in name_lower for d in disliked_lower):
            continue
        if any(a in name_lower for a in restricted_lower):
            continue
        
        food_cat = get_food_category(food["name"])
        if category and food_cat != category:
            continue
        
        kcal_diff = abs(food["kcal_per_100g"] - original_kcal)
        protein_diff = abs(food["protein_per_100g"] - original_protein)
        score = kcal_diff * 0.5 + protein_diff * 2.0
        
        candidates.append({**food, "_score": score})
    
    candidates.sort(key=lambda x: x["_score"])
    return candidates[:max_candidates]


MACRO_TOLERANCE_PERCENT = 0.25

def validate_swap(original_macros: dict, replacement_macros: dict) -> tuple[bool, str]:
    for key in ["kcal", "protein_g"]:
        orig = original_macros.get(key, 0)
        repl = replacement_macros.get(key, 0)
        if orig > 0:
            diff_pct = abs(repl - orig) / orig
            if diff_pct > MACRO_TOLERANCE_PERCENT:
                return False, f"Diferencia en {key} demasiado grande: {diff_pct*100:.0f}%"
    return True, "Sustitución válida"
