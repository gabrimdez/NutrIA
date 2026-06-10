import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, List, Optional
from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.safe_attr import safe_getattr
from app.repositories.plan_repo import PlanRepository
from app.repositories.profile_repo import ProfileRepository
from app.ai.diet_generator import (
    GeneratedDietPlan,
    regenerate_single_plan_meal_with_ai,
    suggest_equivalent_plan_food,
)
from app.rules.food_validation_rules import validate_daily_targets
from app.services.plan_meal_normalize import (
    align_meal_totals_to_target_kcal,
    clamp_str,
    normalize_plan_meals_for_db,
    sanitize_food_display_name,
    scale_plan_day_meals_to_targets,
)
from app.services.plan_shopping import (
    aggregate_plan_foods_for_shopping as _aggregate_plan_foods_for_shopping,
    canonical_shopping_name_and_raw_grams as _canonical_shopping_name_and_raw_grams,
    normalize_plan_label as _normalize_plan_label,
    string_list_from_json_field as _string_list_from_json_field,
    validate_atomic_food_item as _validate_atomic_food_item,
    validate_plan_meals_hard as _validate_plan_meals_hard,
)
from app.schemas.plan import ShoppingListItemResponse, ShoppingListResponse
from app.services.subscription_quota_service import SubscriptionQuotaService

logger = logging.getLogger(__name__)


MANUAL_PLAN_CAVEATS = [
    "Plan creado en modo manual: añade tus alimentos reales en cada comida desde la app.",
]


def _meal_slots_manual(mpd: int) -> List[tuple[str, str]]:
    """Secuencia (meal_type, título) coherente con el asistente móvil (3–6 comidas/día)."""
    mpd = max(3, min(6, int(mpd)))
    if mpd == 3:
        return [
            ("breakfast", "Desayuno"),
            ("lunch", "Comida"),
            ("dinner", "Cena"),
        ]
    if mpd == 4:
        return [
            ("breakfast", "Desayuno"),
            ("lunch", "Comida"),
            ("snack", "Snack"),
            ("dinner", "Cena"),
        ]
    if mpd == 5:
        return [
            ("breakfast", "Desayuno"),
            ("snack", "Snack"),
            ("lunch", "Comida"),
            ("snack", "Merienda"),
            ("dinner", "Cena"),
        ]
    return [
        ("breakfast", "Desayuno"),
        ("snack", "Snack"),
        ("lunch", "Comida"),
        ("snack", "Merienda"),
        ("snack", "Tentempié"),
        ("dinner", "Cena"),
    ]


@dataclass
class PlanGenerationContext:
    """Snapshot en memoria tras leer perfil/objetivos; la sesión BD puede cerrarse antes de llamar a la IA."""

    target_kcal: float
    target_protein_g: float
    target_carbs_g: float
    target_fat_g: float
    goal_type_str: str
    meals_per_day: int
    preferences: List[str]
    disliked_foods: List[str]
    allergies: List[str]
    intolerances: List[str]
    forbidden_foods: List[str]
    additional_preferences: Optional[str]
    plan_profile: Optional[dict]


def _preference_tokens_from_additional(additional: Optional[str]) -> list[str]:
    """Extrae etiquetas tras 'Preferencias:' en el texto del wizard/app."""
    if not additional or not additional.strip():
        return []
    out: list[str] = []
    for segment in additional.replace("\n", " ").split(". "):
        s = segment.strip()
        if s.lower().startswith("preferencias:"):
            rest = s.split(":", 1)[1].strip()
            for piece in rest.split(","):
                t = piece.strip()
                if not t or t.lower() == "ninguna":
                    continue
                out.append(t)
    return out


def _merge_dietary_preference_lists(
    base: Optional[list],
    additional: Optional[str],
) -> list[str]:
    """Lista para la IA: preferencias de BD + chips/texto del wizard sin duplicar (insensible a mayúsculas)."""
    seen: set[str] = set()
    merged: list[str] = []
    for x in base or []:
        if x is None:
            continue
        t = str(x).strip()
        if not t:
            continue
        k = t.lower()
        if k not in seen:
            seen.add(k)
            merged.append(t)
    for t in _preference_tokens_from_additional(additional):
        k = t.lower()
        if k not in seen:
            seen.add(k)
            merged.append(t)
    return merged


def _totals_from_foods(foods: list) -> dict:
    tk = round(sum(float(f.get("kcal") or 0) for f in foods), 1)
    tp = round(sum(float(f.get("protein_g") or 0) for f in foods), 1)
    tc = round(sum(float(f.get("carbs_g") or 0) for f in foods), 1)
    tf = round(sum(float(f.get("fat_g") or 0) for f in foods), 1)
    return {
        "total_kcal": tk,
        "total_protein_g": tp,
        "total_carbs_g": tc,
        "total_fat_g": tf,
    }


class PlanService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.plan_repo = PlanRepository(db)
        self.profile_repo = ProfileRepository(db)

    async def _full_plan_after_meal_mutation(self, user_id: str, meal_id: UUID):
        """Tras editar una comida, devolver el plan que la contiene (no siempre el activo)."""
        pid = await self.plan_repo.get_plan_id_for_meal(meal_id, user_id)
        if pid:
            return await self.plan_repo.get_plan_for_user(pid, user_id)
        return await self.plan_repo.get_active_plan(user_id)

    async def _badge_plan_edited(self, user_id: str, op: str, fingerprint_material: str) -> None:
        from app.services.badge_integration import fire_plan_edited

        await fire_plan_edited(self.db, user_id, op=op, fingerprint_material=fingerprint_material)

    async def prepare_plan_generation_context(
        self,
        user_id: str,
        additional_preferences: Optional[str] = None,
        meals_per_day: Optional[int] = None,
    ) -> PlanGenerationContext:
        """Solo lecturas BD; cerrar la sesión después antes de llamadas largas a la IA."""
        profile = await self.profile_repo.get_by_user_id(user_id)
        if not profile:
            raise ValueError("Perfil no encontrado. Completa el onboarding primero.")

        target = await self.profile_repo.get_active_target(user_id)
        if not target:
            raise ValueError("No hay objetivos configurados. Completa el onboarding primero.")

        prefs = await self.profile_repo.get_preferences(profile.id)
        active_goal = await self.profile_repo.get_active_goal(profile.id)
        goal_type_str = str(active_goal.goal_type.value) if active_goal else "maintain"
        mpd = meals_per_day if meals_per_day is not None else None
        if mpd is None or mpd < 3 or mpd > 6:
            mpd = int(prefs.preferred_meals_per_day) if prefs and prefs.preferred_meals_per_day else 4
        mpd = max(3, min(6, int(mpd)))

        plan_profile: dict = {}
        if profile:
            if profile.sex:
                plan_profile["sex"] = profile.sex.value
            if profile.birth_year is not None:
                plan_profile["birth_year"] = int(profile.birth_year)
            if profile.height_cm is not None:
                plan_profile["height_cm"] = float(profile.height_cm)
            if profile.current_weight_kg is not None:
                plan_profile["weight_kg"] = float(profile.current_weight_kg)
        if active_goal:
            plan_profile["activity_level"] = active_goal.activity_level.value
            plan_profile["training_type"] = active_goal.training_type.value
            if active_goal.training_days_per_week is not None:
                plan_profile["training_days_per_week"] = int(active_goal.training_days_per_week)

        pref_merged = _merge_dietary_preference_lists(
            prefs.dietary_preferences if prefs else None,
            additional_preferences,
        )
        all_allergies = _string_list_from_json_field(prefs.allergies if prefs else None)
        all_intolerances = _string_list_from_json_field(
            safe_getattr(prefs, "intolerances")
        )
        all_forbidden = _string_list_from_json_field(
            safe_getattr(prefs, "forbidden_foods")
        )

        return PlanGenerationContext(
            target_kcal=float(target.calories_kcal),
            target_protein_g=float(target.protein_g),
            target_carbs_g=float(target.carbs_g),
            target_fat_g=float(target.fat_g),
            goal_type_str=goal_type_str,
            meals_per_day=mpd,
            preferences=pref_merged,
            disliked_foods=_string_list_from_json_field(
                prefs.disliked_foods if prefs else None
            ),
            allergies=all_allergies,
            intolerances=all_intolerances,
            forbidden_foods=all_forbidden,
            additional_preferences=additional_preferences,
            plan_profile=plan_profile or None,
        )

    async def persist_generated_plan(
        self,
        user_id: str,
        ctx: PlanGenerationContext,
        generated: GeneratedDietPlan,
    ):
        """Persistencia tras la IA; usar una sesión nueva recién abierta."""
        plan_data = {
            "target_kcal": ctx.target_kcal,
            "target_protein_g": ctx.target_protein_g,
            "target_carbs_g": ctx.target_carbs_g,
            "target_fat_g": ctx.target_fat_g,
            "rationale": generated.rationale_short,
            "caveats": list(generated.caveats or []),
        }
        plan_data["caveats"].append(
            "Porciones ajustadas automáticamente para acercar cada día a tus objetivos de kcal y macros (meta de desviación máx. ~10%)."
        )

        days_data = []
        for day in generated.days:
            meals = []
            for meal in day.meals:
                meals.append({
                    "meal_type": meal.meal_type,
                    "title": meal.title,
                    "foods": [f.model_dump() for f in meal.foods],
                    "total_kcal": meal.total_kcal,
                    "total_protein_g": meal.total_protein_g,
                    "total_carbs_g": meal.total_carbs_g,
                    "total_fat_g": meal.total_fat_g,
                })
            meals = normalize_plan_meals_for_db(meals)
            meals = scale_plan_day_meals_to_targets(
                meals,
                ctx.target_kcal,
                ctx.target_protein_g,
                ctx.target_carbs_g,
                ctx.target_fat_g,
            )
            _validate_plan_meals_hard(
                meals,
                f"Plan IA día {int(day.day_number)}",
            )
            days_data.append({
                "day_number": int(day.day_number),
                "day_label": clamp_str(day.day_label, 20) or f"Día {day.day_number}",
                "meals": meals,
            })

        try:
            plan = await self.plan_repo.create_plan(user_id, plan_data, days_data)
        except Exception as e:
            logger.exception("Error guardando plan en base de datos: %s", type(e).__name__)
            raise RuntimeError(
                "El plan se generó pero no se pudo guardar. Revisa meal_type (breakfast/lunch/dinner/snack) "
                "y longitudes de texto."
            ) from e

        plan_full = await self.plan_repo.get_plan_for_user(plan.id, user_id)
        if plan_full:
            agg = _aggregate_plan_foods_for_shopping(plan_full)
            if agg:
                items = [
                    {
                        "food_name": n,
                        "quantity": f"~{int(round(grams))} g crudo total semana",
                        "category": None,
                    }
                    for n, grams in sorted(agg.items(), key=lambda x: (-x[1], x[0]))
                ]
                await self.plan_repo.create_shopping_list(user_id, plan.id, items)

        return await self.plan_repo.get_active_plan(user_id)

    async def remove_plan_food(self, user_id: str, meal_id, food_index: int):
        meal = await self.plan_repo.get_plan_meal_for_user(meal_id, user_id)
        if not meal:
            raise ValueError("Comida no encontrada")
        foods = list(meal.foods or [])
        if food_index < 0 or food_index >= len(foods):
            raise ValueError("Índice de alimento no válido")
        foods.pop(food_index)
        totals = _totals_from_foods(foods)
        await self.plan_repo.update_plan_meal(meal_id, foods=foods, **totals)
        await self._badge_plan_edited(
            user_id, "remove_plan_food", f"{meal_id}:{food_index}:{time.time_ns()}"
        )
        return await self._full_plan_after_meal_mutation(user_id, meal_id)

    async def substitute_plan_food(self, user_id: str, meal_id, food_index: int, reason: Optional[str]):
        meal = await self.plan_repo.get_plan_meal_for_user(meal_id, user_id)
        if not meal:
            raise ValueError("Comida no encontrada")
        foods = list(meal.foods or [])
        if food_index < 0 or food_index >= len(foods):
            raise ValueError("Índice de alimento no válido")
        cur = foods[food_index]
        if not isinstance(cur, dict):
            raise ValueError("Formato de alimento inválido")

        profile = await self.profile_repo.get_by_user_id(user_id)
        prefs = (
            await self.profile_repo.get_preferences(profile.id)
            if profile
            else None
        )
        dis_l = _string_list_from_json_field(prefs.disliked_foods if prefs else None)
        al_l = _string_list_from_json_field(prefs.allergies if prefs else None)
        intol_l = _string_list_from_json_field(safe_getattr(prefs, "intolerances"))
        forb_l = _string_list_from_json_field(safe_getattr(prefs, "forbidden_foods"))
        combined_allergies = al_l + intol_l + forb_l
        dis_s = ", ".join(dis_l) if dis_l else "Ninguno"
        al_s = ", ".join(combined_allergies) if combined_allergies else "Ninguna"

        mt = meal.meal_type.value if hasattr(meal.meal_type, "value") else str(meal.meal_type)
        others: list[str] = []
        for i, f in enumerate(foods):
            if i == food_index or not isinstance(f, dict):
                continue
            nm = str(f.get("name") or "").strip()
            if nm:
                others.append(f"{nm} ~{float(f.get('grams') or 0):.0f}g")
        other_s = ", ".join(others[:14])

        replacement = await suggest_equivalent_plan_food(
            meal_title=meal.title or "Comida",
            meal_type=mt,
            original_name=str(cur.get("name") or ""),
            original_grams=float(cur.get("grams") or 0),
            original_kcal=float(cur.get("kcal") or 0),
            original_p=float(cur.get("protein_g") or 0),
            original_c=float(cur.get("carbs_g") or 0),
            original_f=float(cur.get("fat_g") or 0),
            disliked=dis_s,
            allergies=al_s,
            user_note=reason,
            other_foods_in_meal=other_s,
        )
        if not replacement:
            raise RuntimeError("No se pudo proponer un sustituto. Reintenta o reformula el motivo.")

        rep = replacement.model_dump()
        rep["name"] = sanitize_food_display_name(rep.get("name"))
        _validate_atomic_food_item(rep, "Sustitución IA")
        foods[food_index] = rep
        totals = _totals_from_foods(foods)
        await self.plan_repo.update_plan_meal(meal_id, foods=foods, **totals)
        await self._badge_plan_edited(
            user_id, "substitute_plan_food", f"{meal_id}:{food_index}:{time.time_ns()}"
        )
        return await self._full_plan_after_meal_mutation(user_id, meal_id)

    async def regenerate_plan_meal_with_ia(
        self, user_id: str, meal_id, note: Optional[str] = None
    ):
        meal = await self.plan_repo.get_plan_meal_with_day_and_plan(meal_id, user_id)
        if not meal or not meal.day or not meal.day.plan:
            raise ValueError("Comida no encontrada")

        day = meal.day
        plan = day.plan
        mt = meal.meal_type.value if hasattr(meal.meal_type, "value") else str(meal.meal_type)
        min_foods = 1 if mt == "snack" else 2

        other_lines: list[str] = []
        for m in day.meals or []:
            if m.id == meal.id:
                continue
            mto = m.meal_type.value if hasattr(m.meal_type, "value") else str(m.meal_type)
            other_lines.append(f"{mto}: {m.title} (~{float(m.total_kcal or 0):.0f} kcal)")
        other_summary = "; ".join(other_lines) if other_lines else "(solo esta comida en el día o sin vecinos)"

        plan_summary = (
            f"~{float(plan.target_kcal):.0f} kcal/día, P{float(plan.target_protein_g):.0f}, "
            f"C{float(plan.target_carbs_g):.0f}, G{float(plan.target_fat_g):.0f}"
        )

        profile = await self.profile_repo.get_by_user_id(user_id)
        prefs = (
            await self.profile_repo.get_preferences(profile.id) if profile else None
        )
        dis_l = _string_list_from_json_field(prefs.disliked_foods if prefs else None)
        al_l = _string_list_from_json_field(prefs.allergies if prefs else None)
        intol_l = _string_list_from_json_field(safe_getattr(prefs, "intolerances"))
        forb_l = _string_list_from_json_field(safe_getattr(prefs, "forbidden_foods"))
        combined_allergies = al_l + intol_l + forb_l
        dis_s = ", ".join(dis_l) if dis_l else "Ninguno"
        al_s = ", ".join(combined_allergies) if combined_allergies else "Ninguna"

        dk = float(meal.total_kcal or 0)
        dp = float(meal.total_protein_g or 0)
        dc = float(meal.total_carbs_g or 0)
        df = float(meal.total_fat_g or 0)

        gen = await regenerate_single_plan_meal_with_ai(
            meal_type=mt,
            reference_title=meal.title or "Comida",
            target_kcal=dk,
            target_protein_g=dp,
            target_carbs_g=dc,
            target_fat_g=df,
            min_foods=min_foods,
            day_label=(day.day_label or f"Día {day.day_number}")[:40],
            other_meals_same_day_summary=other_summary[:900],
            plan_daily_summary=plan_summary,
            disliked=dis_s,
            allergies=al_s,
            user_note=note,
        )
        if not gen:
            raise RuntimeError(
                "No se pudo regenerar esta comida con IA. Reintenta en unos segundos."
            )

        meal_dict = gen.model_dump()
        meal_dict["meal_type"] = mt
        normalized = normalize_plan_meals_for_db([meal_dict])[0]
        normalized = align_meal_totals_to_target_kcal(normalized, dk)
        for f in normalized.get("foods") or []:
            if isinstance(f, dict):
                f["name"] = sanitize_food_display_name(f.get("name"))
        _validate_plan_meals_hard([normalized], "Regeneración IA")
        totals = _totals_from_foods(normalized["foods"])
        new_title = clamp_str(normalized.get("title") or meal.title, 200) or "Comida"
        await self.plan_repo.update_plan_meal(
            meal_id,
            title=new_title,
            foods=normalized["foods"],
            **totals,
        )
        await SubscriptionQuotaService(self.db).record_plan_regen_success(user_id)
        await self._badge_plan_edited(
            user_id, "regenerate_plan_meal", f"{meal_id}:{time.time_ns()}"
        )
        return await self._full_plan_after_meal_mutation(user_id, meal_id)

    async def update_plan_meal_title(self, user_id: str, meal_id, title: str):
        meal = await self.plan_repo.get_plan_meal_for_user(meal_id, user_id)
        if not meal:
            raise ValueError("Comida no encontrada")
        t = clamp_str(title, 200).strip() or "Comida"
        await self.plan_repo.update_plan_meal(meal_id, title=t)
        await self._badge_plan_edited(
            user_id, "update_plan_meal_title", f"{meal_id}:{t}:{time.time_ns()}"
        )
        return await self._full_plan_after_meal_mutation(user_id, meal_id)

    async def update_plan_food_item(
        self,
        user_id: str,
        meal_id,
        food_index: int,
        *,
        name: str,
        grams: float,
        kcal: float,
        protein_g: float,
        carbs_g: float,
        fat_g: float,
    ):
        meal = await self.plan_repo.get_plan_meal_for_user(meal_id, user_id)
        if not meal:
            raise ValueError("Comida no encontrada")
        foods = list(meal.foods or [])
        if food_index < 0 or food_index >= len(foods):
            raise ValueError("Índice de alimento no válido")
        foods[food_index] = {
            "name": sanitize_food_display_name(name),
            "grams": max(0.0, float(grams)),
            "kcal": max(0.0, float(kcal)),
            "protein_g": max(0.0, float(protein_g)),
            "carbs_g": max(0.0, float(carbs_g)),
            "fat_g": max(0.0, float(fat_g)),
        }
        _validate_atomic_food_item(foods[food_index], "Edición de alimento")
        totals = _totals_from_foods(foods)
        await self.plan_repo.update_plan_meal(meal_id, foods=foods, **totals)
        await self._badge_plan_edited(
            user_id, "update_plan_food_item", f"{meal_id}:{food_index}:{time.time_ns()}"
        )
        return await self._full_plan_after_meal_mutation(user_id, meal_id)

    async def add_plan_food_item(
        self,
        user_id: str,
        meal_id,
        *,
        name: str,
        grams: float,
        kcal: float,
        protein_g: float,
        carbs_g: float,
        fat_g: float,
    ):
        meal = await self.plan_repo.get_plan_meal_for_user(meal_id, user_id)
        if not meal:
            raise ValueError("Comida no encontrada")
        foods = list(meal.foods or [])
        foods.append(
            {
                "name": sanitize_food_display_name(name),
                "grams": max(0.0, float(grams)),
                "kcal": max(0.0, float(kcal)),
                "protein_g": max(0.0, float(protein_g)),
                "carbs_g": max(0.0, float(carbs_g)),
                "fat_g": max(0.0, float(fat_g)),
            }
        )
        _validate_atomic_food_item(foods[-1], "Alta de alimento")
        totals = _totals_from_foods(foods)
        await self.plan_repo.update_plan_meal(meal_id, foods=foods, **totals)
        await self._badge_plan_edited(user_id, "add_plan_food_item", f"{meal_id}:{time.time_ns()}")
        return await self._full_plan_after_meal_mutation(user_id, meal_id)

    async def get_current_plan(self, user_id: str):
        return await self.plan_repo.get_active_plan(user_id)

    async def get_plan_history(self, user_id: str):
        return await self.plan_repo.get_plan_history(user_id)

    async def get_plan_by_id(self, user_id: str, plan_id: UUID):
        return await self.plan_repo.get_plan_for_user(plan_id, user_id)

    async def activate_plan(self, user_id: str, plan_id: UUID):
        existing = await self.plan_repo.get_plan_for_user(plan_id, user_id)
        if not existing:
            raise ValueError("Plan no encontrado")
        await self.plan_repo.set_active_plan(user_id, plan_id)
        return await self.plan_repo.get_active_plan(user_id)

    async def duplicate_plan(self, user_id: str, plan_id: UUID):
        source = await self.plan_repo.get_plan_for_user(plan_id, user_id)
        if not source:
            raise ValueError("Plan no encontrado")
        new_plan = await self.plan_repo.duplicate_plan(user_id, source)
        return await self.plan_repo.get_plan_for_user(new_plan.id, user_id)

    async def update_plan_label(self, user_id: str, plan_id: UUID, label: str):
        normalized = _normalize_plan_label(label)
        ok = await self.plan_repo.update_plan_label(plan_id, user_id, normalized)
        if not ok:
            return None
        await self._badge_plan_edited(
            user_id, "update_plan_label", f"{plan_id}:{normalized}:{time.time_ns()}"
        )
        return await self.plan_repo.get_plan_for_user(plan_id, user_id)

    async def delete_plan(self, user_id: str, plan_id: UUID) -> bool:
        return await self.plan_repo.delete_plan_for_user(user_id, plan_id)

    async def create_manual_skeleton_plan(
        self,
        user_id: str,
        meals_per_day: Optional[int] = None,
    ):
        """Nuevo plan activo con 7 días y comidas vacías, sin alimentos placeholder."""
        ctx = await self.prepare_plan_generation_context(user_id, None, meals_per_day)
        slots = _meal_slots_manual(ctx.meals_per_day)
        day_labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
        days_data: list[dict[str, Any]] = []
        for d in range(1, 8):
            meals: list[dict[str, Any]] = []
            for meal_type, title in slots:
                meals.append(
                    {
                        "meal_type": meal_type,
                        "title": title,
                        "foods": [],
                        "total_kcal": 0.0,
                        "total_protein_g": 0.0,
                        "total_carbs_g": 0.0,
                        "total_fat_g": 0.0,
                    }
                )
            meals = normalize_plan_meals_for_db(meals)
            days_data.append(
                {
                    "day_number": d,
                    "day_label": day_labels[d - 1],
                    "meals": meals,
                }
            )

        plan_data = {
            "target_kcal": ctx.target_kcal,
            "target_protein_g": ctx.target_protein_g,
            "target_carbs_g": ctx.target_carbs_g,
            "target_fat_g": ctx.target_fat_g,
            "rationale": "Plan creado en modo manual. Rellena cada comida a tu medida.",
            "caveats": list(MANUAL_PLAN_CAVEATS),
        }
        plan = await self.plan_repo.create_plan(user_id, plan_data, days_data)
        return await self.plan_repo.get_plan_for_user(plan.id, user_id)

    async def reorder_plan_day_meals(
        self, user_id: str, day_id: UUID, ordered_meal_ids: List[UUID]
    ):
        plan_id = await self.plan_repo.set_day_meals_order(day_id, user_id, ordered_meal_ids)
        if not plan_id:
            return None
        ids_s = ",".join(str(x) for x in ordered_meal_ids)
        await self._badge_plan_edited(
            user_id, "reorder_day_meals", f"{day_id}:{ids_s}:{time.time_ns()}"
        )
        return await self.plan_repo.get_plan_for_user(plan_id, user_id)

    async def patch_shopping_list_item_checked(
        self, plan_id: UUID, user_id: str, item_id: UUID, checked: bool
    ) -> Optional[ShoppingListResponse]:
        ok, became_checked = await self.plan_repo.update_shopping_list_item_checked(
            user_id, plan_id, item_id, checked
        )
        if not ok:
            return None
        if became_checked:
            from app.services.badge_integration import fire_groceries_item_checked

            await fire_groceries_item_checked(self.db, user_id, plan_id=plan_id, item_id=item_id)
        return await self.get_shopping_list(plan_id, user_id)

    async def get_shopping_list(self, plan_id: UUID, user_id: str) -> Optional[ShoppingListResponse]:
        sl = await self.plan_repo.get_shopping_list(plan_id)
        plan = await self.plan_repo.get_plan_for_user(plan_id, user_id)
        if not plan:
            return None

        checked_map: dict[str, bool] = {}
        id_map: dict[str, Any] = {}
        if sl and sl.user_id == user_id:
            for it in sl.items or []:
                canon_name, _ = _canonical_shopping_name_and_raw_grams(
                    it.food_name or "",
                    0,
                )
                key = canon_name.strip().lower()
                if not key:
                    continue
                checked_map[key] = checked_map.get(key, False) or bool(it.checked)
                if key not in id_map:
                    id_map[key] = it.id

        agg = _aggregate_plan_foods_for_shopping(plan)

        items = [
            ShoppingListItemResponse(
                id=id_map.get(n.strip().lower()),
                food_name=n,
                quantity=f"~{int(round(grams))} g crudo total semana",
                category=None,
                checked=checked_map.get(n.strip().lower(), False),
            )
            for n, grams in sorted(agg.items(), key=lambda x: (-x[1], x[0]))
        ]
        if items:
            from app.services.badge_integration import fire_grocery_list_made

            await fire_grocery_list_made(self.db, user_id)
        return ShoppingListResponse(
            id=uuid4(),
            plan_id=plan_id,
            name="Lista de la compra (del plan)",
            items=items,
            created_at=plan.created_at or datetime.now(timezone.utc),
        )

