"""Post-generation validation: ensure AI-generated plans respect food restrictions."""
from __future__ import annotations

import re
from typing import List, Sequence

SYNONYM_MAP: dict[str, list[str]] = {
    "gluten": [
        "trigo", "cebada", "centeno", "espelta", "kamut", "bulgur", "cuscús",
        "cuscus", "seitán", "seitan", "pan", "pasta", "galleta", "bizcocho",
        "harina", "cerveza", "rebozado", "empanado", "tostada", "croissant",
        "wrap", "tortilla de trigo", "copos de trigo", "muesli",
    ],
    "lactosa": [
        "leche", "nata", "crema", "yogur", "yogurt", "queso", "requesón",
        "requeson", "mantequilla", "helado", "flan", "natillas", "bechamel",
        "cottage", "skyr", "kéfir", "kefir", "cuajada",
    ],
    "huevo": [
        "huevo", "huevos", "tortilla", "revuelto", "clara", "claras", "yema",
        "yemas", "merengue", "mayonesa", "bizcocho", "flan",
    ],
    "frutos secos": [
        "almendra", "almendras", "nuez", "nueces", "avellana", "avellanas",
        "anacardo", "anacardos", "pistacho", "pistachos", "cacahuete",
        "cacahuetes", "maní", "mani", "crema de cacahuete",
        "mantequilla de cacahuete", "crema de almendras", "tahini",
        "frutos secos",
    ],
    "cacahuete": [
        "cacahuete", "cacahuetes", "maní", "mani", "crema de cacahuete",
        "mantequilla de cacahuete",
    ],
    "marisco": [
        "gamba", "gambas", "langostino", "langostinos", "mejillón",
        "mejillones", "almeja", "almejas", "calamar", "calamares",
        "pulpo", "sepia", "cangrejo", "bogavante", "langosta", "percebe",
        "berberecho", "navaja", "ostra", "ostras", "vieira", "marisco",
    ],
    "pescado": [
        "merluza", "bacalao", "salmón", "salmon", "atún", "atun",
        "sardina", "sardinas", "caballa", "dorada", "lubina", "trucha",
        "rape", "lenguado", "pez espada", "anchoa", "anchoas", "boquerón",
        "boqueron", "pescado",
    ],
    "soja": [
        "soja", "tofu", "tempeh", "edamame", "salsa de soja", "miso",
        "leche de soja", "proteína de soja",
    ],
    "cerdo": [
        "cerdo", "jamón", "jamon", "bacon", "beicon", "panceta",
        "chorizo", "salchichón", "salchichon", "lomo de cerdo",
        "costilla", "costillas", "chicharrón", "chicharron",
        "fiambre de cerdo", "morcilla",
    ],
    "ternera": [
        "ternera", "vaca", "buey", "carne picada", "hamburguesa",
        "solomillo", "entrecot", "chuletón", "chuleton", "filete de ternera",
    ],
    "fructosa": [
        "miel", "agave", "sirope", "mermelada",
    ],
    "mostaza": ["mostaza"],
    "apio": ["apio"],
    "sésamo": ["sésamo", "sesamo", "tahini"],
    "altramuz": ["altramuz", "altramuces"],
    "moluscos": [
        "mejillón", "mejillones", "almeja", "almejas", "ostra", "ostras",
        "calamar", "calamares", "pulpo", "sepia", "berberecho", "navaja",
        "vieira",
    ],
}

_WORD_BOUNDARY = re.compile(r"[a-záéíóúüñ]+", re.IGNORECASE)


def _normalize(text: str) -> str:
    return text.strip().lower()


def _expand_restrictions(restrictions: Sequence[str]) -> set[str]:
    """Expand user-supplied restriction labels into all known synonyms."""
    terms: set[str] = set()
    for r in restrictions:
        key = _normalize(r)
        terms.add(key)
        if key in SYNONYM_MAP:
            terms.update(SYNONYM_MAP[key])
        for syn_key, syn_list in SYNONYM_MAP.items():
            if key in syn_list or key == syn_key:
                terms.add(syn_key)
                terms.update(syn_list)
    return terms


def check_food_against_restrictions(
    food_name: str,
    restrictions: Sequence[str],
) -> str | None:
    """Return the matched restriction term if food_name violates any, else None."""
    if not restrictions:
        return None
    banned = _expand_restrictions(restrictions)
    name_lower = _normalize(food_name)
    for term in banned:
        if term in name_lower:
            return term
    return None


def validate_plan_restrictions(
    plan_days: list,
    allergies: Sequence[str],
    intolerances: Sequence[str],
    forbidden_foods: Sequence[str],
) -> list[dict]:
    """
    Validate all foods in a generated plan against combined restrictions.
    Returns list of violations: [{day, meal_title, food_name, matched_term, restriction_type}]
    """
    restriction_groups = [
        ("alergia", list(allergies)),
        ("intolerancia", list(intolerances)),
        ("alimento prohibido", list(forbidden_foods)),
    ]
    has_any = any(items for _, items in restriction_groups)
    if not has_any:
        return []

    violations: list[dict] = []
    seen: set[tuple] = set()
    for day in plan_days:
        day_num = getattr(day, "day_number", None) or day.get("day_number", "?")
        meals = getattr(day, "meals", None) or day.get("meals", [])
        for meal in meals:
            title = getattr(meal, "title", "") or meal.get("title", "")
            foods = getattr(meal, "foods", None) or meal.get("foods", [])
            for food in foods:
                fname = getattr(food, "name", "") or food.get("name", "")
                for rtype, rlist in restriction_groups:
                    if not rlist:
                        continue
                    match = check_food_against_restrictions(fname, rlist)
                    if match:
                        key = (day_num, title, fname, rtype)
                        if key not in seen:
                            seen.add(key)
                            violations.append({
                                "day": day_num,
                                "meal_title": title,
                                "food_name": fname,
                                "matched_term": match,
                                "restriction_type": rtype,
                            })
    return violations
