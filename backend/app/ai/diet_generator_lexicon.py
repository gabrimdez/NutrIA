from __future__ import annotations

from typing import Any

DAY_LABELS_ES = (
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
)

GOAL_TYPE_LABEL_ES = {
    "lose_fat": "perder grasa",
    "maintain": "mantener peso",
    "gain_muscle": "ganar músculo",
    "recomposition": "recomposición corporal",
}

_PROTEIN_WORDS = (
    "pollo",
    "pavo",
    "ternera",
    "cerdo",
    "solomillo",
    "lomo",
    "merluza",
    "bacalao",
    "salmón",
    "salmon",
    "atún",
    "atun",
    "sardina",
    "sardinas",
    "caballa",
    "dorada",
    "lubina",
    "huevo",
    "huevos",
    "clara",
    "claras",
    "yema",
    "yemas",
    "queso fresco",
    "queso batido",
    "requesón",
    "requeson",
    "skyr",
    "yogur griego",
    "yogurt griego",
    "tofu",
    "tempeh",
    "seitán",
    "seitan",
    "legumbres",
    "lentejas",
    "garbanzos",
    "judías",
    "judias",
    "alubias",
    "edamame",
    "proteína",
    "proteina",
)
_CARB_WORDS = (
    "pan",
    "tostada",
    "tostadas",
    "arroz",
    "pasta",
    "avena",
    "copos",
    "granola",
    "muesli",
    "cereal",
    "cereales",
    "quinoa",
    "cuscús",
    "cuscus",
    "patata",
    "patatas",
    "boniato",
    "batata",
    "tortilla de trigo",
    "wrap",
    "maíz",
    "maiz",
    "plátano",
    "platano",
    "banana",
    "manzana",
    "pera",
    "kiwi",
    "naranja",
    "mandarina",
    "fruta",
    "frutos rojos",
)
_VEG_WORDS = (
    "lechuga",
    "tomate",
    "pepino",
    "zanahoria",
    "pimiento",
    "pimientos",
    "cebolla",
    "brócoli",
    "brocoli",
    "coliflor",
    "espinaca",
    "espinacas",
    "judías verdes",
    "judias verdes",
    "calabacín",
    "calabacin",
    "berenjena",
    "ensalada",
    "verdura",
    "verduras",
    "menestra",
    "gazpacho",
    "salmorejo",
    "champiñón",
    "champiñones",
    "setas",
    "calabaza",
    "alcachofa",
)
_FRUIT_WORDS = (
    "plátano",
    "platano",
    "banana",
    "manzana",
    "pera",
    "kiwi",
    "naranja",
    "mandarina",
    "melocotón",
    "melocoton",
    "piña",
    "pina",
    "fruta",
    "frutos rojos",
    "arándano",
    "arandano",
    "uvas",
)
_FAT_WORDS = (
    "aceite",
    "aove",
    "aguacate",
    "almendra",
    "almendras",
    "nuez",
    "nueces",
    "avellana",
    "avellanas",
    "cacahuete",
    "cacahuetes",
    "crema de cacahuete",
    "mantequilla de cacahuete",
    "pipas",
    "semillas",
    "chía",
    "chia",
    "lino",
    "tahini",
    "aceitunas",
)
_DAIRY_WORDS = (
    "yogur",
    "yogurt",
    "skyr",
    "leche",
    "queso",
    "requesón",
    "requeson",
    "queso fresco",
    "queso batido",
    "kéfir",
    "kefir",
)
_FIBER_WORDS = (
    "verdura",
    "verduras",
    "ensalada",
    "fruta",
    "frutos rojos",
    "plátano",
    "platano",
    "manzana",
    "pera",
    "kiwi",
    "naranja",
    "mandarina",
    "avena",
    "copos",
    "pan integral",
    "arroz integral",
    "pasta integral",
    "legumbres",
    "lentejas",
    "garbanzos",
    "judías",
    "judias",
    "alubias",
    "chía",
    "chia",
    "lino",
    "semillas",
    "brócoli",
    "brocoli",
    "espinaca",
    "espinacas",
    "judías verdes",
    "judias verdes",
)
_HIGH_SODIUM_WORDS = (
    "bacon",
    "beicon",
    "jamón serrano",
    "jamon serrano",
    "jamón curado",
    "jamon curado",
    "embutido",
    "salchicha",
    "salchichas",
    "chorizo",
    "queso curado",
    "queso azul",
    "salsa soja",
    "soja",
    "fiambre",
)


def food_name_lower(value: Any) -> str:
    return str(value or "").strip().lower()


def contains_any(text: str, words: tuple[str, ...]) -> bool:
    return any(word in text for word in words)


def food_groups(name: str) -> set[str]:
    text = food_name_lower(name)
    groups: set[str] = set()
    if contains_any(text, _PROTEIN_WORDS):
        groups.add("protein")
    if contains_any(text, _CARB_WORDS):
        groups.add("carb")
    if contains_any(text, _VEG_WORDS):
        groups.add("veg")
    if contains_any(text, _FRUIT_WORDS):
        groups.add("fruit")
    if contains_any(text, _FAT_WORDS):
        groups.add("fat")
    if contains_any(text, _DAIRY_WORDS):
        groups.add("dairy")
    if contains_any(text, _FIBER_WORDS):
        groups.add("fiber")
    if contains_any(text, _HIGH_SODIUM_WORDS):
        groups.add("salty")
    if "integral" in text:
        groups.add("fiber")
    return groups
