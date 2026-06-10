"""Generación de recomendaciones de recetas personalizadas con IA (Groq)."""
from __future__ import annotations

import logging
import re
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.groq_client import has_groq_keys, structured_output
from app.models.models import DailyTarget, Goal, Profile, UserPreference
from app.repositories.meal_repo import MealRepository
from app.repositories.profile_repo import ProfileRepository
from app.schemas.meal import (
    MealTypeEnum,
    RecipeRecommendationsRequest,
    RecipeRecommendationsResponse,
)
from app.services.food_restriction_safety import (
    build_forbidden_set,
    find_violations,
    is_safe,
)


MIN_PROTEIN_G_PER_SERVING_HIGH = 20.0
MAX_KCAL_PER_SERVING_LOW = 400.0
MAX_CARBS_G_PER_SERVING_LOW = 30.0


def _strip_exclusion_suffixes(name: str, exclusions: list[str]) -> str:
    """Quita sufijos del tipo «sin X» del nombre cuando X es una exclusión del perfil."""
    if not name or not exclusions:
        return name
    cleaned = name
    for excl in exclusions:
        excl_norm = (excl or "").strip()
        if not excl_norm:
            continue
        pattern = re.compile(
            rf"\s*(?:[,(\-]\s*)?\bsin\s+{re.escape(excl_norm)}\b\)?",
            flags=re.IGNORECASE,
        )
        cleaned = pattern.sub("", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip(" ,-·")

logger = logging.getLogger(__name__)


MEAL_TYPE_LABEL_ES = {
    "breakfast": "desayuno",
    "lunch": "almuerzo",
    "dinner": "cena",
    "snack": "snack / merienda",
}

GOAL_TYPE_LABEL_ES = {
    "lose_fat": "perder grasa",
    "maintain": "mantener peso",
    "gain_muscle": "ganar músculo",
    "recomposition": "recomposición corporal",
}


def _enum_value(value) -> Optional[str]:
    if value is None:
        return None
    return getattr(value, "value", str(value))


def _format_list(values: list[str], fallback: str = "ninguna") -> str:
    vals = [v.strip() for v in (values or []) if isinstance(v, str) and v.strip()]
    return ", ".join(vals) if vals else fallback


def _round1(value: float) -> float:
    return round(float(value or 0.0), 1)


class RecipeRecommendationService:
    """Genera recetas personalizadas basadas en perfil, objetivos y preferencias del usuario."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.profile_repo = ProfileRepository(db)
        self.meal_repo = MealRepository(db)

    async def generate_recommendations(
        self,
        user_id: str,
        filters: RecipeRecommendationsRequest,
    ) -> RecipeRecommendationsResponse:
        if not has_groq_keys():
            raise RuntimeError("groq_not_configured")

        profile = await self.profile_repo.get_by_user_id(user_id)
        target = await self.profile_repo.get_active_target(user_id)
        goal = await self.profile_repo.get_active_goal_by_user_id(user_id)
        preferences: Optional[UserPreference] = None
        if profile is not None:
            preferences = await self.profile_repo.get_preferences(profile.id)

        existing_recipes = await self.meal_repo.get_recipes(user_id)
        existing_names = [r.name for r in existing_recipes][:15]

        prompt = self._build_prompt(
            profile=profile,
            target=target,
            goal=goal,
            preferences=preferences,
            existing_recipe_names=existing_names,
            filters=filters,
        )
        system_prompt = (
            "Eres un nutricionista deportivo que crea recetas prácticas y sabrosas en español. "
            "Respetas estrictamente alergias y alimentos no deseados. "
            "Si el usuario escribe una petición en texto libre, esa petición prevalece sobre tipo de comida, "
            "tiempo, etiquetas y afinado fino de macros, salvo que contradiga la seguridad alimentaria. "
            "Las instrucciones de cocina deben ser claras, cortas y enumeradas."
        )

        messages = [{"role": "user", "content": prompt}]
        try:
            response = await structured_output(
                messages=messages,
                response_model=RecipeRecommendationsResponse,
                system_prompt=system_prompt,
                temperature=0.75,
                max_tokens=3500,
                max_retries=2,
            )
        except Exception as e:
            logger.error("Recipe recommendation generation failed: %s", e)
            raise

        tags_lower = {t.lower().strip() for t in (filters.tags or [])}
        require_high_protein = (
            "alto en proteína" in tags_lower or "alto en proteina" in tags_lower
        )
        require_low_kcal = (
            "bajo en calorías" in tags_lower or "bajo en calorias" in tags_lower
        )
        require_low_carbs = "bajo en carbohidratos" in tags_lower

        exclusions: list[str] = []
        allergy_terms: list[str] = []
        intolerance_terms: list[str] = []
        forbidden_terms: list[str] = []
        disliked_terms: list[str] = []
        if preferences is not None:
            allergy_terms = list(getattr(preferences, "allergies", []) or [])
            intolerance_terms = list(getattr(preferences, "intolerances", []) or [])
            forbidden_terms = list(getattr(preferences, "forbidden_foods", []) or [])
            disliked_terms = list(getattr(preferences, "disliked_foods", []) or [])
            exclusions = [*allergy_terms, *intolerance_terms, *forbidden_terms, *disliked_terms]

        # Conjunto de términos prohibidos para validación post-generación.
        # Las alergias/intolerancias/prohibidos son INNEGOCIABLES (riesgo médico o decisión del
        # paciente). Los "no deseados" no se validan aquí porque no son críticos para seguridad y
        # podrían tener falsos positivos al expandir categorías difusas.
        forbidden_norm = build_forbidden_set(allergy_terms, intolerance_terms, forbidden_terms)

        def _passes_constraints(rec) -> bool:
            servings = max(int(getattr(rec, "servings", 1) or 1), 1)
            kcal_per = float(getattr(rec, "total_kcal", 0) or 0) / servings
            protein_per = float(getattr(rec, "total_protein_g", 0) or 0) / servings
            carbs_per = float(getattr(rec, "total_carbs_g", 0) or 0) / servings
            if require_high_protein and protein_per < MIN_PROTEIN_G_PER_SERVING_HIGH:
                logger.info(
                    "Discarded recipe '%s': %.1fg protein/serving < %.0fg required",
                    getattr(rec, "name", "?"), protein_per, MIN_PROTEIN_G_PER_SERVING_HIGH,
                )
                return False
            if require_low_kcal and kcal_per > MAX_KCAL_PER_SERVING_LOW:
                logger.info(
                    "Discarded recipe '%s': %.0f kcal/serving > %.0f max",
                    getattr(rec, "name", "?"), kcal_per, MAX_KCAL_PER_SERVING_LOW,
                )
                return False
            if require_low_carbs and carbs_per > MAX_CARBS_G_PER_SERVING_LOW:
                logger.info(
                    "Discarded recipe '%s': %.1fg carbs/serving > %.0fg max",
                    getattr(rec, "name", "?"), carbs_per, MAX_CARBS_G_PER_SERVING_LOW,
                )
                return False
            return True

        def _is_recipe_safe(rec) -> bool:
            """True si ninguno de los textos visibles de la receta contiene un término prohibido.

            Comprueba `name`, `description`, `items[].name` e `instructions[]`. Si alguno contiene
            un alérgeno/intolerancia/prohibido (incluida la expansión por categoría), la receta
            se descarta para no exponer al usuario a riesgo médico.
            """
            if not forbidden_norm:
                return True
            fields_to_check: list[tuple[str, str]] = [
                ("name", getattr(rec, "name", "") or ""),
                ("description", getattr(rec, "description", "") or ""),
            ]
            for it in getattr(rec, "items", []) or []:
                fields_to_check.append(("items[].name", getattr(it, "name", "") or ""))
            for step in getattr(rec, "instructions", []) or []:
                fields_to_check.append(("instructions[]", str(step) if step else ""))
            # No se validan tags: suelen contener etiquetas tipo "sin gluten", "sin lactosa"
            # que generarían falsos positivos al contener literalmente la categoría restringida.
            for field_name, value in fields_to_check:
                if not value:
                    continue
                if not is_safe(value, forbidden_norm):
                    hits = find_violations(value, forbidden_norm)
                    logger.warning(
                        "Discarded recipe '%s' for safety: field %s contained %s (text=%r)",
                        getattr(rec, "name", "?"),
                        field_name,
                        hits,
                        value[:120],
                    )
                    return False
            return True

        filtered = [
            r for r in response.recommendations
            if _passes_constraints(r) and _is_recipe_safe(r)
        ]
        for rec in filtered:
            rec.name = _strip_exclusion_suffixes(rec.name, exclusions)
            if rec.description:
                rec.description = _strip_exclusion_suffixes(rec.description, exclusions)
        response.recommendations = filtered
        return response

    def _build_prompt(
        self,
        profile: Optional[Profile],
        target: Optional[DailyTarget],
        goal: Optional[Goal],
        preferences: Optional[UserPreference],
        existing_recipe_names: list[str],
        filters: RecipeRecommendationsRequest,
    ) -> str:
        target_line = (
            f"Objetivo diario de macros: {int(target.calories_kcal)} kcal, "
            f"{int(target.protein_g)}g proteína, {int(target.carbs_g)}g carbos, {int(target.fat_g)}g grasas."
            if target
            else "Objetivo diario: no definido (usa una distribución equilibrada)."
        )

        goal_label = "no definido"
        if goal is not None:
            goal_type = _enum_value(goal.goal_type) or ""
            goal_label = GOAL_TYPE_LABEL_ES.get(goal_type, goal_type or "no definido")

        dietary = _format_list(list(getattr(preferences, "dietary_preferences", []) or []))
        allergies = _format_list(list(getattr(preferences, "allergies", []) or []))
        intolerances = _format_list(list(getattr(preferences, "intolerances", []) or []))
        forbidden = _format_list(list(getattr(preferences, "forbidden_foods", []) or []))
        disliked = _format_list(list(getattr(preferences, "disliked_foods", []) or []))

        meal_type_label = (
            MEAL_TYPE_LABEL_ES.get(filters.meal_type.value, filters.meal_type.value)
            if filters.meal_type
            else "cualquiera (variedad entre desayuno, almuerzo, cena y snack)"
        )

        prep_line = (
            f"Tiempo máximo de preparación por receta: {filters.max_prep_time_min} minutos."
            if filters.max_prep_time_min
            else "Tiempo de preparación: preferiblemente entre 10 y 40 minutos."
        )
        kcal_line = (
            f"Máximo {filters.max_kcal_per_serving} kcal por porción."
            if filters.max_kcal_per_serving
            else "Ajusta las kcal por porción de forma coherente con el objetivo diario."
        )

        extra = (filters.additional_request or "").strip()
        has_priority_request = bool(extra)

        if has_priority_request and filters.tags:
            tags_line = (
                "Etiquetas de la UI (orientación secundaria; solo si encajan con la petición prioritaria en "
                f"texto libre): {_format_list(filters.tags)}."
            )
        elif has_priority_request:
            tags_line = (
                "Etiquetas: no fuerces chips genéricos si la petición prioritaria pide algo distinto; "
                "usa etiquetas coherentes con esa petición."
            )
        elif filters.tags:
            tags_line = f"Prioriza estos atributos: {_format_list(filters.tags)}."
        else:
            tags_line = "Atributos deseables: variedad, balance de macros y facilidad."

        nutritional_constraints: list[str] = []
        tags_lower = {t.lower().strip() for t in (filters.tags or [])}
        if "alto en proteína" in tags_lower or "alto en proteina" in tags_lower:
            nutritional_constraints.append(
                "Cada receta DEBE aportar al menos 20 g de proteína por porción "
                "(`total_protein_g` / `servings` >= 20). Si una receta no llega, ajústala añadiendo "
                "fuentes proteicas (lácteos, legumbres, huevo si está permitido, pescado, carne magra, "
                "tofu/tempeh, proteína en polvo) hasta superar el mínimo."
            )
        if "bajo en calorías" in tags_lower or "bajo en calorias" in tags_lower:
            nutritional_constraints.append(
                "Cada receta DEBE aportar como máximo 400 kcal por porción."
            )
        if "bajo en carbohidratos" in tags_lower:
            nutritional_constraints.append(
                "Cada receta DEBE aportar como máximo 30 g de carbohidratos por porción."
            )
        if "rica en fibra" in tags_lower:
            nutritional_constraints.append(
                "Prioriza ingredientes con alto contenido en fibra (verduras, legumbres, "
                "cereales integrales, semillas, frutos secos)."
            )
        nutritional_block = (
            "\nRESTRICCIONES NUTRICIONALES OBLIGATORIAS (calculadas a partir de los `total_*` y `servings`):\n- "
            + "\n- ".join(nutritional_constraints)
            + "\n"
            if nutritional_constraints
            else ""
        )

        priority_block = ""
        if has_priority_request:
            priority_block = (
                "\n"
                "=== PETICIÓN PRIORITARIA (TEXTO LIBRE DEL USUARIO) ===\n"
                f"«{extra}»\n"
                "Las recetas deben cumplir primero y sobre todo esta petición (ingredientes concretos, tipo de plato, "
                "ocasión, estilo de cocina).\n"
                "ORDEN DE PRIORIDAD ABSOLUTO:\n"
                "  (1) Alergias y alimentos prohibidos del perfil: INNEGOCIABLES; invalidan cualquier petición que los contradiga.\n"
                "  (2) El texto entre «» arriba: máxima prioridad de contenido frente a tipo de comida, tiempo máximo, "
                "etiquetas de objetivos y matices finos de macros.\n"
                "  (3) Filtros de la petición y perfil (macros, objetivo): complementarios; úsalos solo si son "
                "compatibles con (2); si hay conflicto, PREVALECE (2).\n"
                "\n"
            )

        filters_header = (
            "FILTROS Y ORIENTACIÓN (SECUNDARIOS respecto a la petición prioritaria en texto libre):\n"
            if has_priority_request
            else "FILTROS DE LA PETICIÓN:\n"
        )

        existing_line = (
            f"Recetas que el usuario YA tiene (NO las repitas): {_format_list(existing_recipe_names)}."
            if existing_recipe_names
            else "El usuario todavía no tiene recetas guardadas."
        )

        sex = _enum_value(getattr(profile, "sex", None)) or "no indicado"
        weight = getattr(profile, "current_weight_kg", None)
        height = getattr(profile, "height_cm", None)
        weight_line = f"{weight:.1f} kg" if isinstance(weight, (int, float)) else "no indicado"
        height_line = f"{height} cm" if isinstance(height, (int, float)) else "no indicado"

        return (
            f"Recomienda {filters.count} recetas originales y prácticas para este usuario.\n"
            f"{priority_block}"
            f"{nutritional_block}"
            "PERFIL DEL USUARIO:\n"
            f"- Sexo: {sex}\n"
            f"- Peso actual: {weight_line}\n"
            f"- Altura: {height_line}\n"
            f"- Objetivo: {goal_label}\n"
            f"- {target_line}\n"
            "\n"
            "PREFERENCIAS:\n"
            f"- Dietas / estilo: {dietary}\n"
            f"- Alergias (EVITAR TOTALMENTE, riesgo médico): {allergies}\n"
            f"- Intolerancias (EVITAR TOTALMENTE, causan malestar): {intolerances}\n"
            f"- Alimentos prohibidos por el paciente (NO INCLUIR NUNCA): {forbidden}\n"
            f"- Alimentos no deseados (no incluir): {disliked}\n"
            "\n"
            "EXPANSIÓN OBLIGATORIA DE CATEGORÍAS (si la restricción es una categoría, "
            "excluye todos sus miembros aunque no se nombren):\n"
            "- 'frutos secos' EXCLUYE: almendras, nueces, anacardos, avellanas, pistachos, "
            "cacahuetes, piñones, castañas, pacanas, macadamias, leche/harina/mantequilla "
            "de almendras, crema de cacahuete.\n"
            "- 'lácteos' EXCLUYE: leche, queso, yogur, mantequilla, nata, kéfir, requesón.\n"
            "- 'mariscos' EXCLUYE: gambas, langostinos, mejillones, almejas, pulpo, calamar, "
            "cangrejo, langosta, vieiras.\n"
            "- 'gluten' EXCLUYE: trigo, cebada, centeno, espelta, cuscús, pasta y pan no certificados sin gluten.\n"
            "- 'huevo' EXCLUYE: huevo en cualquier forma, mayonesa, tortilla francesa.\n"
            "- 'soja' EXCLUYE: tofu, tempeh, edamame, salsa de soja, miso.\n"
            "Esto se aplica a `name`, `description`, `items[].name` e `instructions[]`.\n"
            "\n"
            f"{filters_header}"
            f"- Tipo de comida: {meal_type_label}\n"
            f"- {prep_line}\n"
            f"- {kcal_line}\n"
            f"- {tags_line}\n"
            "\n"
            f"CONTEXTO: {existing_line}\n"
            "\n"
            "INSTRUCCIONES ESTRICTAS:\n"
            "1. Responde con un JSON que cumpla el esquema `RecipeRecommendationsResponse`.\n"
            f"2. Devuelve exactamente {filters.count} recetas en `recommendations`.\n"
            "3. Usa nombres en español de los ingredientes (`items[].name`).\n"
            "4. Ajusta `grams` y los macros de CADA ingrediente al alimento real (valores por la cantidad en gramos indicada, NO por 100g).\n"
            "5. `total_*` debe ser la suma real de los macros de los `items`.\n"
            "6. `servings` >= 1. Los totales representan la receta COMPLETA (todas las porciones).\n"
            "7. Incluye 4 a 8 pasos cortos de preparación en `instructions`.\n"
            "8. Elige un emoji adecuado para `icon` (un solo emoji).\n"
            "9. `difficulty` debe ser 'fácil', 'media' o 'avanzada'.\n"
            "10. `tags` deben ser etiquetas breves en español (ej: 'alto en proteína', 'sin gluten', 'batch cooking').\n"
            "11. SEGURIDAD ALIMENTARIA INNEGOCIABLE: NO INCLUYAS NINGÚN INGREDIENTE que aparezca en "
            "alergias, intolerancias, alimentos prohibidos o alimentos no deseados — ni como ingrediente "
            "principal, ni como parte de un compuesto, ni en pasos de cocción, ni como acompañamiento. "
            "Esto incluye los miembros expandidos de cualquier categoría restringida (ver bloque "
            "EXPANSIÓN OBLIGATORIA DE CATEGORÍAS). El servidor descartará cualquier receta que viole esta regla.\n"
            "12. Si hay bloque «PETICIÓN PRIORITARIA», todas las recetas deben demostrarlo de forma inequívoca "
            "(nombres, `items`, `description`, `instructions`); no te limites a etiquetas genéricas si la petición "
            "pide algo concreto.\n"
            "13. En caso de conflicto entre la petición prioritaria en texto libre y tipo de comida / tiempo / etiquetas / "
            "macros, gana la petición en texto libre; solo cede si implicaría violar (11).\n"
            "14. NO menciones en `name` ni en `description` los alimentos excluidos por alergias, intolerancias "
            "o «alimentos no deseados» (p. ej. NO uses «sin huevo», «sin gluten», «sin lactosa» como sufijo del "
            "nombre). Da por hecho que la exclusión está garantizada por construcción y nombra el plato por lo "
            "que SÍ lleva. Las exclusiones solo pueden aparecer en `tags` cuando aporten información útil.\n"
            "15. Si una restricción nutricional obligatoria no se puede cumplir con los ingredientes propuestos, "
            "reformula la receta antes de devolverla; nunca incumplas los mínimos/máximos del bloque "
            "RESTRICCIONES NUTRICIONALES OBLIGATORIAS.\n"
        )


def round_macros(value: float) -> float:
    return _round1(value)
