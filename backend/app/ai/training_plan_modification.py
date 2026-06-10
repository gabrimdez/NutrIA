"""Modificación determinista de un training_plan ya generado.

El chat NO regenera la rutina con el LLM cuando el usuario pide cambios; se
aplican los cambios pedidos en servidor para garantizar que el resto de la
rutina queda intacto (sets, reps, días, focus_note).
"""

from __future__ import annotations

import copy
import re
import unicodedata
from typing import Optional

from app.ai.muscle_group_routines import _TEMPLATES as _MG_TEMPLATES


# ---------------------------------------------------------------------------
# Detección de intent
# ---------------------------------------------------------------------------

# Verbos típicos para pedir un cambio sobre la rutina anterior.
# Cubrimos imperativo ("quita"), indicativo ("quitas"), subjuntivo ("quites"),
# infinitivo ("quitar") y formas con pronombre enclítico ("quítame", "quitarlo").
_MODIFY_VERBS_RE = re.compile(
    r"\b("
    # cambiar
    r"c[aá]mbi(?:a|as|e|es|en|ame|emelo|alo|elo)|cambiar(?:lo|me|melo)?"
    # sustituir
    r"|sustitu(?:y[eo]|yes|ya|yas|imos|ir(?:lo|me|melo)?|y[ée]ndolo)|sustit[uú]yelo"
    # reemplazar
    r"|reempl[aá]z(?:a|as|e|es|alo|amelo|ar(?:lo|me|melo)?)"
    # quitar
    r"|quit(?:a|as|e|es|en|emos|ame|amelo|alo|arlo|arme|armelo)|qu[ií]tame|quitar(?:lo|me|melo)?"
    # eliminar / sacar / borrar / fuera
    r"|elimin(?:a|as|e|es|ar(?:lo|me|melo)?)|s[aá]ca(?:me|lo|melo)?|saca(?:s|r(?:lo|me)?)?"
    r"|fuera|borr(?:a|as|e|es|ar(?:lo|me)?)"
    # poner / meter / añadir
    r"|p[oó]n(?:me|le|lo|melo)?|pones|pongas|poner(?:lo|me|melo)?"
    r"|met(?:e|es|a|as|eme|elo|emelo|er(?:lo|me|melo)?)"
    r"|a[ñn][aá]d(?:e|es|a|as|eme|elo|emelo|ir(?:lo|me|melo)?)"
    # construcciones
    r"|sin\s+|en\s+vez\s+de|en\s+lugar\s+de|menos\s+"
    r"|haz(?:me)?\s+(?:la\s+)?(?:misma|igual)|misma\s+rutina|igual\s+pero"
    r")\b",
    re.IGNORECASE,
)

# "X por Y", "X en vez de Y", "en lugar de X (pon) Y"
_REPLACE_PAIR_RE = re.compile(
    r"(?P<from>[a-záéíóúñü0-9 ,/\-]+?)"
    r"\s+(?:por|x)\s+"
    r"(?P<to>[a-záéíóúñü0-9 ,/\-]+?)"
    r"(?=$|[.,;]|\s+(?:y|porque|para|que|en|con)\b)",
    re.IGNORECASE,
)

_REPLACE_PAIR_INV_RE = re.compile(
    r"\b(?:en\s+(?:vez|lugar)\s+de)\s+(?P<from>[a-záéíóúñü0-9 ,/\-]+?)"
    r"\s+(?:pon(?:me|le|gas)?\s+|mete(?:me|le|s)?\s+|a[ñn][aá]de(?:me|le|s)?\s+|usa\s+|met[eé]\s+|"
    r"prefiero\s+|quiero\s+)?(?P<to>[a-záéíóúñü0-9 ,/\-]+?)"
    r"(?=$|[.,;]|\s+(?:y|porque|para|que)\b)",
    re.IGNORECASE,
)

_REMOVE_RE = re.compile(
    r"\b(?:"
    # quitar (todas las flexiones)
    r"quit(?:a|as|e|es|en|ame|amelo|alo|emos|ar(?:lo|me|melo)?)|qu[ií]tame"
    # eliminar
    r"|elimin(?:a|as|e|es|ar(?:lo|me|melo)?)"
    # sacar
    r"|s[aá]ca(?:me|lo|melo)?|saca(?:s|r(?:lo|me)?)?"
    # borrar
    r"|borr(?:a|as|e|es|ar(?:lo|me)?)"
    # sin <X>
    r"|sin"
    r")\s+"
    r"(?:el|la|los|las|de|del)?\s*"
    r"(?P<target>[a-záéíóúñü0-9 ,/\-]+?)"
    r"(?=$|[.,;]|\s+(?:porque|para|que|y)\b)",
    re.IGNORECASE,
)

# "por dolor / lesión / molestia / me molesta" → preferir alternativa segura
_PAIN_REASON_RE = re.compile(
    r"(?:me\s+(?:duele|molesta|hace\s+da[ñn]o)|por\s+(?:dolor|lesi[oó]n|molestia)"
    r"|tengo\s+(?:dolor|molestia|lesi[oó]n)|me\s+lastima|m[aá]s\s+(?:f[aá]cil|seguro|suave)"
    r"|menos\s+(?:carga|impacto|exigente))",
    re.IGNORECASE,
)


# Mapa de palabras-clave → grupo muscular del catálogo.
_MUSCLE_KEYWORDS: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(p, re.I), k)
    for p, k in [
        (r"gl[uú]teo", "glutes"),
        (r"\bpecho\b", "chest"),
        (r"espalda|dorsal", "back"),
        (r"hombros?|delto", "shoulders"),
        (r"cu[aá]driceps|cuadri", "quadriceps"),
        (r"isquio|femoral", "hamstrings"),
        (r"b[ií]ceps", "biceps"),
        (r"tr[ií]ceps", "triceps"),
        (r"gemelos?|pantorrilla|s[oó]leo", "calves"),
        (r"\bcore\b|abdom", "core"),
    ]
)


# Palabras "vacías" que no aportan al matching de nombre de ejercicio.
# IMPORTANTE: NO incluir palabras que distinguen alias entre sí (ej. "predicador",
# "scott", "spider", "francés") porque son justo lo que diferencia un curl de otro.
_STOPWORDS = frozenset(
    {
        "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
        "en", "con", "sin", "para", "por", "y", "o", "u", "a", "al",
        "ese", "esa", "este", "esta", "esos", "esas",
        "mancuerna", "mancuernas", "barra", "polea", "poleas",
        "maquina", "máquina", "maquinas", "máquinas",
        "agarre", "pesado", "pesada", "ligero", "ligera", "ligeras",
    }
)


# Sinónimos (forma normalizada). Si un token de la query aparece como clave,
# también consideramos sus valores como hits al medir el score.
_SYNONYMS: dict[str, tuple[str, ...]] = {
    "femoral": ("isquio", "isquiotibial", "isquiotibiales"),
    "isquio": ("femoral",),
    "isquiotibial": ("femoral",),
    "isquiotibiales": ("femoral",),
    "gemelo": ("pantorrilla", "soleo"),
    "gemelos": ("pantorrilla", "soleo"),
    "pantorrilla": ("gemelo", "gemelos"),
    "soleo": ("gemelo", "gemelos"),
    "abdominal": ("core", "abdomen"),
    "abdominales": ("core", "abdomen"),
    "core": ("abdominal", "abdomen"),
    "abdomen": ("core", "abdominal"),
    "jalon": ("dominada", "dominadas"),
    "dominada": ("jalon",),
    "dominadas": ("jalon",),
    "prensa": ("hack", "press de pierna"),
    "hack": ("prensa",),
    "sentadilla": ("squat",),
    "squat": ("sentadilla",),
    "deadlift": ("muerto",),
    "muerto": ("deadlift",),
    "remo": ("row",),
    "row": ("remo",),
    "press": ("empuje",),
    "curl": ("flexion",),
    "kickback": ("patada",),
    "hipthrust": ("hip", "thrust"),
    "elevacion": ("elevaciones",),
    "elevaciones": ("elevacion",),
}


def _split_aliases(raw_name: str) -> list[str]:
    """Divide nombres con alternativas en alias independientes.

    Ej. "Curl predicador, curl en banco scott o spider curl"
        → ["Curl predicador", "curl en banco scott", "spider curl"]

    Ej. "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal"
        → 4 alias.
    """
    if not raw_name:
        return []
    # Reemplazamos " o " (con espacios) y comas por un separador único, evitando
    # romper palabras como "torso".
    parts = re.split(r"\s+o\s+|\s*,\s*|\s*/\s*", raw_name)
    aliases = [p.strip() for p in parts if p and p.strip()]
    # Si el split deja un único alias, devolvemos el original tal cual.
    return aliases if len(aliases) >= 2 else [raw_name.strip()]


# ---------------------------------------------------------------------------
# Normalización y matching
# ---------------------------------------------------------------------------

def _strip_accents(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _normalize(s: str) -> str:
    s = _strip_accents(s or "").lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _tokens(s: str) -> list[str]:
    return [t for t in _normalize(s).split() if t and t not in _STOPWORDS]


def _expand_with_synonyms(tokens: list[str]) -> set[str]:
    """Devuelve el conjunto de tokens + sus sinónimos."""
    out = set(tokens)
    for t in tokens:
        for syn in _SYNONYMS.get(t, ()):
            out.update(_normalize(syn).split())
    return out


def _score_alias(query_tokens: list[str], alias: str) -> float:
    """Score 0..1 de match entre los tokens de la query y un alias concreto."""
    n = _tokens(alias)
    if not query_tokens or not n:
        return 0.0
    n_expanded = _expand_with_synonyms(n)
    hits = sum(1 for t in query_tokens if t in n_expanded)
    if hits == 0:
        return 0.0
    # Score = (cobertura de la query) * 0.6 + (cobertura del alias) * 0.4.
    # Esto premia cuando casi todas las palabras de la query aparecen en el
    # alias, sin penalizar demasiado los alias muy cortos.
    coverage_q = hits / len(query_tokens)
    coverage_a = hits / len(n)
    return min(1.0, coverage_q * 0.6 + coverage_a * 0.4)


def _score_match(query: str, exercise_name: str) -> float:
    """Mejor score entre la query y cualquier alias del nombre del ejercicio."""
    q = _tokens(query)
    if not q:
        return 0.0
    q_set = _expand_with_synonyms(q)
    # Cuando expandimos sinónimos en la query, también consideramos los
    # tokens expandidos; pero scoreamos contra los alias del ejercicio.
    aliases = _split_aliases(exercise_name)
    best = 0.0
    for alias in aliases:
        s = _score_alias(list(q_set), alias)
        if s > best:
            best = s
        # También probamos el score normal (sin expansión de sinónimos en la
        # query) para no sobre-puntuar matches débiles.
        s2 = _score_alias(q, alias)
        if s2 > best:
            best = s2
    return best


def _find_exercise_in_plan(plan: dict, query: str, min_score: float = 0.35) -> Optional[tuple[int, int, float]]:
    """Devuelve ``(day_idx, exercise_idx, score)`` del mejor match, o None.

    Empata por mayor score; en empate, prefiere el ejercicio con nombre más
    corto (más específico).
    """
    best: Optional[tuple[int, int, float, int]] = None
    for di, day in enumerate(plan.get("days", [])):
        for ei, ex in enumerate(day.get("exercises", [])):
            name = ex.get("name", "")
            score = _score_match(query, name)
            if score >= min_score:
                length = len(name)
                if best is None or score > best[2] or (score == best[2] and length < best[3]):
                    best = (di, ei, score, length)
    if best is None:
        return None
    return best[0], best[1], best[2]


def _detect_muscle_group(text: str) -> Optional[str]:
    for pat, key in _MUSCLE_KEYWORDS:
        if pat.search(text or ""):
            return key
    return None


# ---------------------------------------------------------------------------
# Catálogo de "ejercicios más seguros / fáciles" por familia
# ---------------------------------------------------------------------------
#
# Cuando el usuario pide cambiar un ejercicio "por dolor" o "más fácil",
# se elige una alternativa con menor carga axial / menor exigencia técnica
# del mismo patrón de movimiento.

_SAFER_ALTERNATIVES: tuple[tuple[re.Pattern[str], str, str], ...] = (
    (re.compile(r"sentadilla|back\s*squat|hack\s*squat", re.I),
     "Prensa de piernas",
     "menor carga axial sobre la columna y trayectoria guiada"),
    (re.compile(r"peso\s*muerto", re.I),
     "Peso muerto rumano con mancuernas",
     "menos carga axial y rango más controlado"),
    (re.compile(r"press\s+militar|press\s+overhead|press\s+por\s+encima", re.I),
     "Press de hombro en máquina",
     "trayectoria guiada que reduce estrés en el hombro"),
    (re.compile(r"dominad", re.I),
     "Jalón al pecho en polea",
     "permite regular la carga y reduce la exigencia articular"),
    (re.compile(r"press\s+banca|press\s+plano\s+con\s+barra", re.I),
     "Press plano en máquina",
     "estabilidad guiada y menor estrés en el hombro"),
    (re.compile(r"curl\s+(?:de\s+)?b[ií]ceps\s+con\s+barra", re.I),
     "Curl de bíceps con mancuernas",
     "permite muñeca neutra y reduce molestia en codo"),
    (re.compile(r"fondos?|dips", re.I),
     "Press de pecho en máquina",
     "elimina la carga sobre el hombro en posición forzada"),
    (re.compile(r"zancada|lunge", re.I),
     "Sentadilla búlgara con apoyo",
     "más estable y permite progresar gradualmente"),
)


def _safer_alternative(exercise_name: str) -> Optional[tuple[str, str]]:
    """Devuelve ``(nuevo_nombre, motivo)`` o None si no hay alternativa registrada."""
    for pat, alt, reason in _SAFER_ALTERNATIVES:
        if pat.search(exercise_name):
            return alt, reason
    return None


# ---------------------------------------------------------------------------
# Sugerencias del catálogo de muscle_group_routines como reemplazo
# ---------------------------------------------------------------------------

def _muscle_group_alternatives(group_key: str) -> list[str]:
    """Lista nombres de ejercicios del catálogo para un grupo muscular."""
    tpl = _MG_TEMPLATES.get(group_key)
    if not tpl:
        return []
    out: list[str] = []
    for focus_key in ("hipertrofia", "fuerza"):
        block = tpl.get(focus_key)
        if not block:
            continue
        for ex in block.get("exercises", []):
            name = ex.get("name", "")
            if name and name not in out:
                out.append(name)
    return out


def _pick_replacement_for_group(group_key: str, current_names: list[str]) -> Optional[str]:
    """Elige un ejercicio del catálogo del grupo que NO esté ya en la lista."""
    current_norm = {_normalize(n) for n in current_names}
    for cand in _muscle_group_alternatives(group_key):
        if _normalize(cand) not in current_norm:
            return cand
    return None


# ---------------------------------------------------------------------------
# Detección de intent de modificación
# ---------------------------------------------------------------------------

def is_modification_intent(message: str) -> bool:
    """True si el mensaje pide cambios sobre una rutina previa."""
    if not message or not message.strip():
        return False
    if not _MODIFY_VERBS_RE.search(message):
        return False
    # Filtramos peticiones de generación nueva ("haz una rutina", "crea otra rutina").
    if re.search(r"\b(?:haz(?:me)?|crea(?:me)?|genera(?:me)?|dame|dise[ñn]a)\s+(?:otra|una\s+nueva|nueva)\s+rutina\b",
                 message, re.IGNORECASE):
        return False
    return True


# ---------------------------------------------------------------------------
# Aplicación de modificaciones
# ---------------------------------------------------------------------------

def _clone_exercise_keep_metadata(old: dict, new_name: str) -> dict:
    """Clona el ejercicio cambiando solo el nombre; sets/reps se mantienen."""
    return {
        "name": new_name,
        "sets": old.get("sets", 0),
        "reps": old.get("reps", ""),
    }


# Prefijos comunes que la gente añade antes del nombre del ejercicio y que
# no aportan al matching ("quiero que cambies X por Y", "puedes cambiar X por Y").
_FROM_PREFIX_RE = re.compile(
    r"^\s*(?:"
    r"quiero\s+que\s+(?:me\s+)?(?:cambies|sustituyas|reemplaces|quites)|"
    r"puedes\s+(?:cambiar|sustituir|reemplazar|quitar|cambiarme|quitarme)|"
    r"podr[ií]as\s+(?:cambiar|sustituir|reemplazar|quitar)|"
    r"me\s+(?:cambias|sustituyes|reemplazas|quitas)|"
    r"c[aá]mbi(?:a|as|e|es|ame|alo|emelo)|cambiar(?:lo|me|melo)?|"
    r"sustitu(?:ye|yes|ya|yas|yelo|ir(?:lo|me)?)|"
    r"reempl[aá]z(?:a|as|e|es|alo|amelo|ar(?:lo|me)?)|"
    r"p[oó]n(?:me|le|gas)?|met(?:e|es|eme)|a[ñn][aá]d(?:e|es|eme)|"
    r"el|la|los|las|un|una|de|del"
    r")\s+",
    re.IGNORECASE,
)


def _clean_pair_term(term: str) -> str:
    """Quita prefijos de relleno repetidamente del inicio del término."""
    prev = None
    cur = term.strip()
    while prev != cur:
        prev = cur
        cur = _FROM_PREFIX_RE.sub("", cur).strip()
    return cur


def _extract_replacement_pairs(message: str) -> list[tuple[str, str]]:
    """Extrae pares (from, to) del mensaje. Acepta 'X por Y' y 'en vez de X Y'."""
    pairs: list[tuple[str, str]] = []
    for m in _REPLACE_PAIR_RE.finditer(message):
        f = _clean_pair_term(m.group("from"))
        t = _clean_pair_term(m.group("to"))
        if f and t:
            pairs.append((f, t))
    for m in _REPLACE_PAIR_INV_RE.finditer(message):
        f = _clean_pair_term(m.group("from"))
        t = _clean_pair_term(m.group("to"))
        if f and t:
            pairs.append((f, t))
    return pairs


def _extract_remove_targets(message: str) -> list[str]:
    targets: list[str] = []
    for m in _REMOVE_RE.finditer(message):
        t = m.group("target").strip()
        if t:
            targets.append(t)
    return targets


def apply_modifications(plan: dict, message: str) -> dict:
    """Aplica los cambios pedidos en ``message`` sobre ``plan``.

    Devuelve un dict::

        {
          "training_plan": <plan modificado>,
          "changes": [{"day": str, "from": str, "to": str, "reason": str?}, ...],
          "ambiguous": bool,
          "no_match": bool,
        }

    - ``ambiguous=True`` si no se encontró ninguna instrucción de cambio
      identificable (el chat debe pedir aclaración).
    - ``no_match=True`` si las instrucciones se entendieron pero ningún
      ejercicio de la rutina hace match (rutina sin cambios).
    """
    new_plan = copy.deepcopy(plan)
    changes: list[dict] = []
    pain_mode = bool(_PAIN_REASON_RE.search(message))

    pairs = _extract_replacement_pairs(message)
    removes = _extract_remove_targets(message)

    # Caso 1: pares "X por Y"
    for from_q, to_q in pairs:
        match = _find_exercise_in_plan(new_plan, from_q)
        if not match:
            continue
        di, ei, _ = match
        old_ex = new_plan["days"][di]["exercises"][ei]
        # Si la nueva descripción es muy corta o ambigua, intentamos
        # capitalizar tal cual lo escribió el usuario.
        new_name = to_q.strip()
        # Conservar mayúscula inicial.
        new_name = new_name[:1].upper() + new_name[1:] if new_name else new_name
        new_plan["days"][di]["exercises"][ei] = _clone_exercise_keep_metadata(old_ex, new_name)
        change = {
            "day": new_plan["days"][di].get("name", ""),
            "from": old_ex.get("name", ""),
            "to": new_name,
        }
        if pain_mode:
            change["reason"] = "elegida por molestia/dolor reportada por el usuario"
        changes.append(change)

    # Caso 2: "quita X" / "sin X" / "elimina X"
    for target in removes:
        match = _find_exercise_in_plan(new_plan, target)
        if not match:
            continue
        di, ei, _ = match
        old_ex = new_plan["days"][di]["exercises"][ei]
        # Si está marcado como por dolor → sustituir por alternativa segura
        # (mantiene la cantidad de ejercicios del día).
        if pain_mode:
            alt = _safer_alternative(old_ex.get("name", ""))
            if alt is None:
                # Fallback: alternativa del catálogo del grupo muscular detectado en el ejercicio
                group_key = _detect_muscle_group(old_ex.get("name", ""))
                if group_key:
                    cand = _pick_replacement_for_group(
                        group_key,
                        [e.get("name", "") for d in new_plan["days"] for e in d.get("exercises", [])],
                    )
                    if cand:
                        alt = (cand, "alternativa con menor exigencia del mismo grupo muscular")
            if alt is not None:
                new_name, reason = alt
                new_plan["days"][di]["exercises"][ei] = _clone_exercise_keep_metadata(old_ex, new_name)
                changes.append({
                    "day": new_plan["days"][di].get("name", ""),
                    "from": old_ex.get("name", ""),
                    "to": new_name,
                    "reason": reason,
                })
                continue
        # Sin dolor → eliminar limpio.
        del new_plan["days"][di]["exercises"][ei]
        changes.append({
            "day": new_plan["days"][di].get("name", ""),
            "from": old_ex.get("name", ""),
            "to": "(eliminado)",
        })

    # Caso 3: "cambia los ejercicios de bíceps" — sin pares ni nombres exactos.
    if not changes and not pairs and not removes:
        group_key = _detect_muscle_group(message)
        if group_key:
            current_names = [e.get("name", "") for d in new_plan["days"] for e in d.get("exercises", [])]
            replaced_any = False
            for di, day in enumerate(new_plan["days"]):
                for ei, ex in enumerate(day["exercises"]):
                    if _detect_muscle_group(ex.get("name", "")) == group_key:
                        cand = _pick_replacement_for_group(group_key, current_names)
                        if not cand:
                            continue
                        new_plan["days"][di]["exercises"][ei] = _clone_exercise_keep_metadata(ex, cand)
                        current_names.append(cand)
                        changes.append({
                            "day": day.get("name", ""),
                            "from": ex.get("name", ""),
                            "to": cand,
                        })
                        replaced_any = True
            if not replaced_any:
                return {
                    "training_plan": plan,
                    "changes": [],
                    "ambiguous": False,
                    "no_match": True,
                }

    if not changes and not pairs and not removes:
        return {
            "training_plan": plan,
            "changes": [],
            "ambiguous": True,
            "no_match": False,
        }

    if not changes:
        return {
            "training_plan": plan,
            "changes": [],
            "ambiguous": False,
            "no_match": True,
        }

    return {
        "training_plan": new_plan,
        "changes": changes,
        "ambiguous": False,
        "no_match": False,
    }


async def resolve_modifications_via_llm(plan: dict, message: str) -> dict:
    """Fallback: pide al LLM que decida qué ejercicio cambiar, en JSON.

    El LLM SOLO devuelve índices y un nombre nuevo (o ``null`` para eliminar).
    El código construye el plan resultante; el LLM nunca emite la rutina entera.

    Devuelve el mismo shape que ``apply_modifications`` para uniformar el flujo.
    """
    import json
    import logging

    from app.ai.groq_client import chat_completion, has_groq_keys

    logger = logging.getLogger(__name__)

    if not has_groq_keys():
        return {"training_plan": plan, "changes": [], "ambiguous": True, "no_match": False}

    # Inventario numerado de los ejercicios actuales para el prompt.
    inventory: list[str] = []
    index_map: list[tuple[int, int]] = []  # idx_en_inventory -> (day_idx, ex_idx)
    for di, day in enumerate(plan.get("days", [])):
        for ei, ex in enumerate(day.get("exercises", [])):
            idx = len(inventory)
            inventory.append(f"  {idx}. [{day.get('name', '')}] {ex.get('name', '')}")
            index_map.append((di, ei))

    if not inventory:
        return {"training_plan": plan, "changes": [], "ambiguous": False, "no_match": True}

    system = (
        "Eres un asistente que aplica cambios sobre una rutina de gimnasio existente. "
        "NO inventes nuevos ejercicios fuera del estilo de la rutina. "
        "Mantén sets y reps; solo cambias el nombre del ejercicio o lo eliminas. "
        "Devuelve SOLO un objeto JSON sin texto adicional, con esta forma:\n"
        '{"changes": [{"index": <int>, "new_name": <string|null>, "reason": <string|null>}]}\n'
        "- index: número del ejercicio en la lista (0..N-1).\n"
        "- new_name: nombre del ejercicio que sustituye al actual; usa null para eliminar.\n"
        "- reason: motivo breve si lo cambias por dolor/molestia, si no, null.\n"
        "Si no hay ningún cambio claro, devuelve {\"changes\": []}."
    )

    user_prompt = (
        f"Rutina actual:\n" + "\n".join(inventory) + "\n\n"
        f"Petición del usuario: {message.strip()}\n\n"
        "Devuelve el JSON con los cambios."
    )

    try:
        response = await chat_completion(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            max_tokens=400,
        )
    except Exception as e:
        logger.warning("LLM fallback de modificación falló: %s", e)
        return {"training_plan": plan, "changes": [], "ambiguous": True, "no_match": False}

    raw = (response.get("content") or "").strip()
    # Quita posibles fences ```json ... ```.
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw)

    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        # Intentamos extraer el primer objeto JSON del texto.
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            return {"training_plan": plan, "changes": [], "ambiguous": True, "no_match": False}
        try:
            parsed = json.loads(m.group(0))
        except (json.JSONDecodeError, ValueError):
            return {"training_plan": plan, "changes": [], "ambiguous": True, "no_match": False}

    raw_changes = parsed.get("changes") if isinstance(parsed, dict) else None
    if not isinstance(raw_changes, list) or not raw_changes:
        return {"training_plan": plan, "changes": [], "ambiguous": False, "no_match": True}

    new_plan = copy.deepcopy(plan)
    applied: list[dict] = []
    # Procesamos eliminaciones al final, de mayor a menor índice, para no invalidar índices.
    pending_removals: list[tuple[int, int, str, Optional[str]]] = []

    for ch in raw_changes:
        if not isinstance(ch, dict):
            continue
        try:
            idx = int(ch.get("index"))
        except (TypeError, ValueError):
            continue
        if idx < 0 or idx >= len(index_map):
            continue
        di, ei = index_map[idx]
        old = new_plan["days"][di]["exercises"][ei]
        new_name = ch.get("new_name")
        reason = ch.get("reason") if isinstance(ch.get("reason"), str) else None
        if new_name is None:
            pending_removals.append((di, ei, old.get("name", ""), reason))
        elif isinstance(new_name, str) and new_name.strip():
            cleaned = new_name.strip()
            cleaned = cleaned[:1].upper() + cleaned[1:]
            new_plan["days"][di]["exercises"][ei] = _clone_exercise_keep_metadata(old, cleaned)
            entry = {
                "day": new_plan["days"][di].get("name", ""),
                "from": old.get("name", ""),
                "to": cleaned,
            }
            if reason:
                entry["reason"] = reason
            applied.append(entry)

    # Eliminaciones, en orden inverso por (day, ex) para preservar índices.
    for di, ei, old_name, reason in sorted(pending_removals, key=lambda t: (t[0], -t[1])):
        try:
            del new_plan["days"][di]["exercises"][ei]
        except IndexError:
            continue
        entry = {
            "day": new_plan["days"][di].get("name", ""),
            "from": old_name,
            "to": "(eliminado)",
        }
        if reason:
            entry["reason"] = reason
        applied.append(entry)

    if not applied:
        return {"training_plan": plan, "changes": [], "ambiguous": False, "no_match": True}

    return {
        "training_plan": new_plan,
        "changes": applied,
        "ambiguous": False,
        "no_match": False,
    }


def summarize_changes(changes: list[dict]) -> str:
    """Devuelve un texto breve para el chat describiendo los cambios."""
    if not changes:
        return "No he encontrado ningún ejercicio que coincida; te dejo la rutina sin cambios."
    parts: list[str] = []
    for c in changes:
        if c.get("to") == "(eliminado)":
            parts.append(f"quitado «{c['from']}» en {c['day']}")
        else:
            base = f"cambiado «{c['from']}» por «{c['to']}» en {c['day']}"
            if c.get("reason"):
                base += f" ({c['reason']})"
            parts.append(base)
    if len(parts) == 1:
        return f"He {parts[0]}. El resto de la rutina queda igual."
    return "He hecho estos cambios: " + "; ".join(parts) + ". El resto de la rutina queda igual."
