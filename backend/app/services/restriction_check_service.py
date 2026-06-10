"""Revisión con IA de texto libre de recetas frente a restricciones alimentarias del usuario."""
import asyncio
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.groq_client import has_groq_keys, structured_output
from app.core.config import get_settings
from app.core.safe_attr import safe_getattr
from app.repositories.profile_repo import ProfileRepository
from app.schemas.meal import (
    CheckRestrictionsResponse,
    FoodRestrictionConflict,
    RecipeTextRestrictionCheckLLMResult,
)
from app.services.food_restriction_safety import (
    build_forbidden_set,
    find_violations,
    is_safe,
    normalize_term,
)

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "Eres un nutricionista clínico y coach alimentario. "
    "Tu tarea es revisar si el TEXTO del usuario (petición de recetas) menciona alimentos, "
    "platos o ingredientes que contradigan explícitamente sus restricciones listadas.\n\n"
    "Reglas:\n"
    "- Sé conservador: solo marca conflicto si hay una relación clara entre lo escrito y una restricción.\n"
    "- No inventes menciones que no estén en el texto.\n"
    "- Si el usuario pide algo genérico sin ingredientes conflictivos, has_conflicts=false.\n"
    "- restriction_type debe ser uno de: allergy, intolerance, forbidden (solo esas tres; "
    "no uses disliked).\n"
    "- matched_restriction debe copiar literalmente uno de los términos de la lista correspondiente "
    "que mejor encaje, o una forma muy cercana si el texto lo enlaza claramente.\n"
    "- Para cada conflicto, explanation: una frase corta en español para mostrar al usuario.\n"
    "- alternatives: 2 a 4 sustitutos REALMENTE SEGUROS para el paciente. CRÍTICO:\n"
    "    * Una alternativa NUNCA puede pertenecer a la categoría restringida ni ser un miembro de ella.\n"
    "    * Si la restricción es una categoría (p. ej. 'frutos secos', 'lácteos', 'mariscos', "
    "'pescado', 'gluten', 'legumbres', 'huevo', 'soja'), excluye TODOS sus miembros.\n"
    "    * Ejemplos obligatorios:\n"
    "        - 'frutos secos' EXCLUYE: almendras, nueces, anacardos, avellanas, pistachos, "
    "cacahuetes, piñones, castañas, pacanas, macadamias, nueces de Brasil. Sustitutos válidos: "
    "pipas de girasol, pipas de calabaza, semillas de chía, semillas de lino, semillas de sésamo, "
    "aceitunas (siempre que tampoco estén restringidas).\n"
    "        - 'lácteos' EXCLUYE: leche, queso, yogur, mantequilla, nata, kéfir, requesón. "
    "Sustitutos: bebidas vegetales (avena, arroz, coco), tofu sedoso.\n"
    "        - 'mariscos' EXCLUYE: gambas, langostinos, mejillones, almejas, pulpo, calamar, "
    "cangrejo, langosta.\n"
    "        - 'gluten' EXCLUYE: trigo, cebada, centeno, espelta, cuscús, pasta y pan no certificados sin gluten.\n"
    "    * Antes de escribir cada alternativa, verifica mentalmente que NO aparece (ni como sinónimo "
    "ni como miembro) en ninguna de las restricciones del paciente. Si dudas, NO la incluyas.\n"
    "    * Prefiere sustitutos habituales en cocina española.\n"
    "- Si no hay conflictos, devuelve has_conflicts=false y conflicts=[]."
)


def _as_str_list(v: Any) -> list[str]:
    if not v:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return []


def _explicitly_declares_free_of(text: str, term: str) -> bool:
    norm_text = normalize_term(text)
    norm_term = normalize_term(term)
    if norm_term not in {"gluten", "lactosa"}:
        return False
    markers = ("sin ", "libre de ", "no contiene ", "exento de ", "exenta de ")
    return any(f"{marker}{norm_term}" in norm_text for marker in markers)


def _deterministic_conflicts(
    text: str,
    allergies: list[str],
    intolerances: list[str],
    forbidden: list[str],
) -> list[FoodRestrictionConflict]:
    conflicts: list[FoodRestrictionConflict] = []
    seen: set[tuple[str, str]] = set()
    groups = (
        ("allergy", allergies, "alergia"),
        ("intolerance", intolerances, "intolerancia"),
        ("forbidden", forbidden, "alimento restringido"),
    )
    for restriction_type, terms, label in groups:
        for term in terms:
            norm_term = normalize_term(term)
            if not norm_term:
                continue
            if _explicitly_declares_free_of(text, term):
                continue
            key = (restriction_type, norm_term)
            if key in seen:
                continue
            term_forbidden = build_forbidden_set([term])
            hits = find_violations(text, term_forbidden)
            if not hits:
                continue
            seen.add(key)
            conflicts.append(
                FoodRestrictionConflict(
                    mentioned_food=", ".join(hits[:3]),
                    matched_restriction=term,
                    restriction_type=restriction_type,
                    explanation=f"El texto menciona {hits[0]}, relacionado con tu {label}: {term}.",
                    alternatives=[],
                )
            )
    return conflicts


async def check_text_against_restrictions(
    db: AsyncSession,
    user_id: str,
    text: str,
) -> CheckRestrictionsResponse:
    stripped = (text or "").strip()
    if len(stripped) < 3:
        return CheckRestrictionsResponse(has_conflicts=False, conflicts=[], llm_unavailable=False)

    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    if not profile:
        return CheckRestrictionsResponse(has_conflicts=False, conflicts=[], llm_unavailable=False)

    prefs = await repo.get_preferences(profile.id)
    allergies = _as_str_list(safe_getattr(prefs, "allergies"))
    intolerances = _as_str_list(safe_getattr(prefs, "intolerances"))
    forbidden = _as_str_list(safe_getattr(prefs, "forbidden_foods"))

    if not allergies and not intolerances and not forbidden:
        return CheckRestrictionsResponse(has_conflicts=False, conflicts=[], llm_unavailable=False)

    deterministic_conflicts = _deterministic_conflicts(stripped, allergies, intolerances, forbidden)
    if deterministic_conflicts:
        return CheckRestrictionsResponse(
            has_conflicts=True,
            conflicts=deterministic_conflicts,
            llm_unavailable=False,
        )

    if not has_groq_keys():
        logger.warning("check_text_against_restrictions: Groq no configurado.")
        return CheckRestrictionsResponse(has_conflicts=False, conflicts=[], llm_unavailable=True)

    settings = get_settings()
    model = settings.groq_plan_model

    user_block = (
        "RESTRICCIONES DEL PACIENTE (respétalas al interpretar el texto):\n\n"
        f"Alergias: {', '.join(allergies) if allergies else '(ninguna registrada)'}\n"
        f"Intolerancias: {', '.join(intolerances) if intolerances else '(ninguna registrada)'}\n"
        f"Alimentos prohibidos: {', '.join(forbidden) if forbidden else '(ninguno registrado)'}\n\n"
        "---\n\n"
        f"TEXTO DEL USUARIO (petición de recetas):\n{stripped}"
    )

    messages = [{"role": "user", "content": user_block}]

    try:
        result = await asyncio.wait_for(
            structured_output(
                messages,
                RecipeTextRestrictionCheckLLMResult,
                model=model,
                temperature=0.15,
                max_tokens=900,
                system_prompt=_SYSTEM_PROMPT,
                max_retries=1,
            ),
            timeout=6.0,
        )
    except asyncio.TimeoutError:
        logger.warning("check_text_against_restrictions: timeout Groq (fail-open).")
        return CheckRestrictionsResponse(has_conflicts=False, conflicts=[], llm_unavailable=True)
    except Exception as e:
        logger.exception("check_text_against_restrictions: error Groq: %s", e)
        return CheckRestrictionsResponse(has_conflicts=False, conflicts=[], llm_unavailable=True)

    # Red de seguridad: filtrar alternativas que pertenezcan a una restricción del usuario.
    # El LLM puede equivocarse (p. ej. sugerir "almendras" si la alergia es a "frutos secos");
    # esta validación determinista evita devolver sustitutos peligrosos al cliente.
    forbidden_norm = build_forbidden_set(allergies, intolerances, forbidden)

    # Normalizar: el LLM podría devolver "disliked" pese a instrucciones; mapear a forbidden.
    conflicts: list[FoodRestrictionConflict] = []
    for c in result.conflicts:
        rt = c.restriction_type
        if rt == "disliked":
            rt = "forbidden"
        safe_alts: list[str] = []
        seen_alts: set[str] = set()
        dropped: list[str] = []
        for alt in c.alternatives:
            if not alt or not alt.strip():
                continue
            key = normalize_term(alt)
            if not key or key in seen_alts:
                continue
            if is_safe(alt, forbidden_norm):
                seen_alts.add(key)
                safe_alts.append(alt.strip())
            else:
                dropped.append(alt)
        if dropped:
            logger.warning(
                "restriction_check: filtradas %d alternativas inseguras para restricción %r: %s",
                len(dropped),
                c.matched_restriction,
                dropped,
            )
        conflicts.append(
            FoodRestrictionConflict(
                mentioned_food=c.mentioned_food,
                matched_restriction=c.matched_restriction,
                restriction_type=rt,
                explanation=c.explanation,
                alternatives=safe_alts[:5],
            )
        )

    has_conflicts = len(conflicts) > 0
    return CheckRestrictionsResponse(
        has_conflicts=has_conflicts,
        conflicts=conflicts,
        llm_unavailable=False,
    )
