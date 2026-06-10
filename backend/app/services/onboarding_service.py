import logging
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.profile_repo import ProfileRepository
from app.rules.nutrition_rules import (
    calculate_bmr,
    calculate_tdee,
    calculate_target_calories,
    adjust_target_calories_for_overweight_deficit,
    calculate_macros,
    calculate_steps_target,
    generate_onboarding_summary,
)
from app.rules.food_validation_rules import validate_daily_targets
from app.schemas.profile import OnboardingRequest

logger = logging.getLogger(__name__)


class OnboardingService:
    def __init__(self, db: AsyncSession):
        self.repo = ProfileRepository(db)
        self.db = db

    async def complete_onboarding(self, user_id: str, data: OnboardingRequest) -> dict:
        profile = await self.repo.get_by_user_id(user_id)
        if not profile:
            profile = await self.repo.create(
                user_id=user_id,
                sex=data.sex,
                birth_year=data.birth_year,
                height_cm=data.height_cm,
                current_weight_kg=data.current_weight_kg,
                onboarding_completed=True,
            )
        else:
            profile = await self.repo.update_profile(
                user_id=user_id,
                sex=data.sex,
                birth_year=data.birth_year,
                height_cm=data.height_cm,
                current_weight_kg=data.current_weight_kg,
                onboarding_completed=True,
            )

        await self.repo.upsert_preferences(
            profile_id=profile.id,
            dietary_preferences=data.dietary_preferences,
            disliked_foods=data.disliked_foods,
            allergies=data.allergies,
            intolerances=data.intolerances,
            forbidden_foods=data.forbidden_foods,
            preferred_meals_per_day=data.preferred_meals_per_day,
        )

        goal = await self.repo.create_goal(
            profile_id=profile.id,
            goal_type=data.goal_type,
            target_weight_kg=data.target_weight_kg,
            activity_level=data.activity_level,
            training_days_per_week=data.training_days_per_week,
            training_type=data.training_type,
        )

        age = date.today().year - data.birth_year
        bmr = calculate_bmr(data.sex, data.current_weight_kg, data.height_cm, age)
        tdee = calculate_tdee(bmr, data.activity_level)
        raw_target_kcal = calculate_target_calories(tdee, data.goal_type)
        target_kcal = adjust_target_calories_for_overweight_deficit(
            raw_target_kcal,
            float(tdee),
            float(bmr),
            float(data.current_weight_kg),
            float(data.height_cm),
            data.goal_type.value,
        )
        macros = calculate_macros(
            target_kcal,
            data.current_weight_kg,
            data.goal_type.value,
            activity_level=data.activity_level.value,
            training_days_per_week=data.training_days_per_week,
        )
        steps = calculate_steps_target(data.activity_level, data.goal_type)

        errors = validate_daily_targets(target_kcal, macros["protein_g"], macros["carbs_g"], macros["fat_g"])
        if errors:
            logger.warning(f"Target validation warnings for {user_id}: {errors}")

        rationale = f"BMR={bmr:.0f}, TDEE={tdee:.0f}, ajuste por objetivo"
        if target_kcal < raw_target_kcal:
            rationale += "; tope por IMC en déficit/recomposición (evita objetivos altos poco prudentes)"

        daily_target = await self.repo.create_daily_target(
            goal_id=goal.id,
            user_id=user_id,
            calories_kcal=target_kcal,
            protein_g=macros["protein_g"],
            carbs_g=macros["carbs_g"],
            fat_g=macros["fat_g"],
            steps_target=steps,
            rationale=rationale,
        )

        summary = generate_onboarding_summary(
            data.sex, age, data.height_cm, data.current_weight_kg,
            data.goal_type, target_kcal, macros, steps,
        )

        from app.services.badge_integration import fire_active_goal_confirmed, fire_onboarding_completed

        await fire_onboarding_completed(self.db, user_id)
        await fire_active_goal_confirmed(self.db, user_id)

        return {
            "profile": profile,
            "goal": goal,
            "daily_targets": {
                "calories_kcal": target_kcal,
                "protein_g": macros["protein_g"],
                "carbs_g": macros["carbs_g"],
                "fat_g": macros["fat_g"],
                "steps_target": steps,
                "rationale": daily_target.rationale,
            },
            "summary": summary,
        }
