"""Validación determinista de alérgenos/restricciones alimentarias.

Red de seguridad usada por:
- restriction_check_service: filtra alternativas sugeridas por el LLM en el modal de aviso.
- recipe_recommendation_service: descarta o sanea recetas generadas por el LLM cuyos
  ingredientes/nombre/descripción contengan algún alérgeno o alimento restringido.

El LLM puede equivocarse incluso con instrucciones claras, así que esta capa NO confía en él
y aplica una verificación textual normalizada con expansión de categorías comunes.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Iterable


# Mapa de categoría → miembros conocidos. Se aplica si el usuario tiene la categoría
# como restricción (p. ej. "frutos secos") para que sus miembros (almendras, nueces…)
# también queden bloqueados.
CATEGORY_EXPANSIONS: dict[str, tuple[str, ...]] = {
    "frutos secos": (
        "almendra", "almendras", "nuez", "nueces", "anacardo", "anacardos",
        "avellana", "avellanas", "pistacho", "pistachos", "cacahuete", "cacahuetes",
        "mani", "manies", "pinon", "pinones", "castana", "castanas",
        "pacana", "pacanas", "macadamia", "macadamias",
        "nuez de brasil", "nueces de brasil", "nuez pecana", "nuez de macadamia",
        "crema de cacahuete", "mantequilla de cacahuete", "mantequilla de almendras",
        "leche de almendras", "leche de almendra", "harina de almendras",
        "harina de almendra", "praline",
    ),
    "frutos secos de cascara": (
        "almendra", "almendras", "nuez", "nueces", "anacardo", "anacardos",
        "avellana", "avellanas", "pistacho", "pistachos",
        "pinon", "pinones", "pacana", "pacanas", "macadamia", "macadamias",
    ),
    "lacteos": (
        "leche", "queso", "yogur", "yogurt", "mantequilla", "nata", "crema de leche",
        "kefir", "requeson", "cuajada", "mascarpone", "ricotta", "mozzarella",
        "parmesano", "cheddar", "manchego", "feta", "burrata", "gouda", "brie",
        "camembert", "emmental", "gruyere", "edam", "provolone", "stracchino",
        "leche de vaca", "leche de cabra", "leche de oveja",
    ),
    "lacteo": (
        "leche", "queso", "yogur", "yogurt", "mantequilla", "nata", "crema de leche",
        "kefir", "requeson", "mascarpone", "ricotta", "mozzarella", "parmesano",
    ),
    "lactosa": (
        "leche", "queso fresco", "yogur", "yogurt", "nata", "mantequilla",
        "leche condensada", "leche evaporada", "kefir", "requeson",
    ),
    "mariscos": (
        "gamba", "gambas", "langostino", "langostinos", "mejillon", "mejillones",
        "almeja", "almejas", "pulpo", "calamar", "calamares", "cangrejo", "cangrejos",
        "langosta", "langostas", "cigala", "cigalas", "berberecho", "berberechos",
        "navaja", "navajas", "vieira", "vieiras", "centollo", "buey de mar",
        "nécora", "necora", "carabinero", "carabineros", "krill",
    ),
    "marisco": (
        "gamba", "gambas", "langostino", "langostinos", "mejillon", "mejillones",
        "almeja", "almejas", "pulpo", "calamar", "calamares", "cangrejo",
        "langosta", "cigala", "berberecho", "vieira",
    ),
    "pescado": (
        "atun", "salmon", "merluza", "bacalao", "lubina", "dorada", "sardina", "sardinas",
        "boqueron", "boquerones", "anchoa", "anchoas", "trucha", "rape", "lenguado",
        "caballa", "jurel", "pez espada", "rodaballo", "panga", "tilapia", "perca",
        "fletan", "abadejo", "gallo", "mero", "raya",
    ),
    "gluten": (
        "trigo", "cebada", "centeno", "espelta", "cuscus", "couscous", "bulgur",
        "seitan", "harina de trigo", "pan", "pasta", "macarrones", "espaguetis",
        "fideos", "tortilla de trigo", "galleta", "galletas", "pan rallado", "pan de molde",
        "kamut", "triticale", "salsa de soja",  # salsa de soja contiene trigo a menos que indique lo contrario
    ),
    "trigo": (
        "harina de trigo", "harina", "pan", "pasta", "macarrones", "espaguetis",
        "fideos", "couscous", "cuscus", "bulgur", "seitan", "pan rallado", "galletas",
    ),
    "legumbres": (
        "lenteja", "lentejas", "garbanzo", "garbanzos", "alubia", "alubias",
        "judia", "judias", "frijol", "frijoles", "haba", "habas", "soja",
        "guisante", "guisantes", "cacahuete", "cacahuetes", "altramuz", "altramuces",
        "judion", "judiones",
    ),
    "huevo": ("huevo", "huevos", "clara", "claras", "yema", "yemas", "tortilla francesa", "mayonesa"),
    "huevos": ("huevo", "huevos", "clara", "claras", "yema", "yemas", "tortilla francesa", "mayonesa"),
    "soja": ("soja", "tofu", "tempeh", "edamame", "salsa de soja", "leche de soja", "miso"),
    "cerdo": (
        "cerdo", "jamon", "jamón", "bacon", "panceta", "chorizo", "salchichon",
        "lomo embuchado", "morcilla", "cabezada", "papada", "tocino", "manteca",
        "salchicha fresca", "fuet", "sobrasada",
    ),
    "carne roja": (
        "ternera", "vacuno", "buey", "cordero", "cabrito", "cerdo", "jabali",
        "venado", "ciervo", "caballo",
    ),
    "azucar": (
        "azucar", "azúcar", "sacarosa", "azucar moreno", "azucar blanco",
        "miel", "sirope", "jarabe", "panela", "melaza", "fructosa", "glucosa",
    ),
    "fructosa": ("fructosa", "miel", "sirope de agave", "sirope de maiz",),
    "alcohol": (
        "vino", "cerveza", "ron", "vodka", "whisky", "ginebra", "tequila",
        "licor", "sidra", "champan", "cava",
    ),
}


def normalize_term(s: str) -> str:
    """Minúsculas, sin acentos, sin signos, espacios colapsados."""
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def build_forbidden_set(*term_lists: Iterable[str]) -> set[str]:
    """Conjunto normalizado con los términos del usuario y los miembros expandidos
    de cualquier categoría reconocida.

    Filtra términos demasiado cortos (<3 caracteres) y palabras genéricas (de, sin, con…)
    para evitar falsos positivos."""
    stopwords = {"de", "del", "la", "el", "los", "las", "y", "o", "u", "con", "sin", "en", "al"}
    forbidden: set[str] = set()
    for terms in term_lists:
        for raw in terms or []:
            norm = normalize_term(str(raw))
            if not norm or len(norm) < 3 or norm in stopwords:
                continue
            forbidden.add(norm)
            # singular/plural simple
            if norm.endswith("s") and len(norm) > 3:
                forbidden.add(norm[:-1])
            elif not norm.endswith("s"):
                forbidden.add(norm + "s")
            # expansión por categoría
            for member in CATEGORY_EXPANSIONS.get(norm, ()):
                m = normalize_term(member)
                if len(m) >= 3 and m not in stopwords:
                    forbidden.add(m)
    return {t for t in forbidden if t}


_NEGATION_PATTERNS = ("sin ", "libre de ", "no contiene ", "exento de ", "exenta de ")


def _strip_negated_mentions(norm: str, forbidden_norm: set[str]) -> str:
    """Elimina del texto las menciones explícitamente negadas (p. ej. 'sin gluten').

    Solo neutraliza la mención si el alimento aparece justo detrás del marcador de negación,
    para no permitir engañar al filtro escribiendo 'sin' en cualquier parte de la frase.
    """
    out = norm
    for marker in _NEGATION_PATTERNS:
        for bad in forbidden_norm:
            if not bad or len(bad) < 3:
                continue
            pattern = rf"{re.escape(marker)}{re.escape(bad)}\b"
            out = re.sub(pattern, " ", out)
    return re.sub(r"\s+", " ", out).strip()


def is_safe(text: str, forbidden_norm: set[str]) -> bool:
    """True si `text` no contiene ningún término prohibido.

    Detecta:
    - igualdad exacta normalizada
    - cualquier token del texto que sea un término prohibido (p. ej. "leche de almendras"
      → contiene "almendras", "leche")
    - subcadena con bordes de palabra (evita falsos positivos como "soja" en "asociar")

    Neutraliza menciones explícitamente negadas ("sin gluten", "libre de lactosa")
    porque indican AUSENCIA del alimento, no presencia.
    """
    if not forbidden_norm:
        return True
    norm = normalize_term(text)
    if not norm:
        return True
    norm = _strip_negated_mentions(norm, forbidden_norm)
    if not norm:
        return True
    if norm in forbidden_norm:
        return False
    tokens = set(norm.split())
    if tokens & forbidden_norm:
        return False
    for bad in forbidden_norm:
        if not bad or len(bad) < 3:
            continue
        if re.search(rf"\b{re.escape(bad)}\b", norm):
            return False
    return True


def find_violations(text: str, forbidden_norm: set[str]) -> list[str]:
    """Lista (sin duplicar) de términos prohibidos detectados en `text`.
    Útil para logging y para explicar al usuario qué falló."""
    if not forbidden_norm:
        return []
    norm = normalize_term(text)
    if not norm:
        return []
    norm = _strip_negated_mentions(norm, forbidden_norm)
    if not norm:
        return []
    hits: list[str] = []
    seen: set[str] = set()
    if norm in forbidden_norm and norm not in seen:
        hits.append(norm)
        seen.add(norm)
    for token in norm.split():
        if token in forbidden_norm and token not in seen:
            hits.append(token)
            seen.add(token)
    for bad in forbidden_norm:
        if not bad or len(bad) < 3 or bad in seen:
            continue
        if re.search(rf"\b{re.escape(bad)}\b", norm):
            hits.append(bad)
            seen.add(bad)
    return hits
