import logging
from datetime import date, datetime, time, timedelta
from typing import List, Mapping, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.repositories.meal_repo import MealRepository
from app.repositories.profile_repo import ProfileRepository
from app.food_providers.generic_provider import GenericFoodProvider
from app.food_providers.barcode_provider import OpenFoodFactsProvider
from app.food_providers.composite_provider import CompositeFoodProvider
from app.ai.photo_analyzer import analyze_food_photo
from app.ai.groq_client import structured_output
from app.rules.nutrition_rules import calculate_food_macros
from app.rules.food_validation_rules import validate_meal_total, validate_item_grams
from app.schemas.food import PhotoAnalysisResponse, PhotoAnalysisAIResponse, EnrichedFoodItem
from app.schemas.meal import MealConfirmRequest

logger = logging.getLogger(__name__)

DIARY_RETENTION_DAYS = 30
STREAK_GRACE_HOUR = 3


def is_day_done(kcal: float, target_kcal: Optional[float]) -> bool:
    """Mismo criterio que status 'done' en resumen mensual del diario (>= 80% del objetivo, o con kcal si no hay objetivo)."""
    if target_kcal is not None and target_kcal > 0:
        return kcal / float(target_kcal) >= 0.80
    return kcal > 0


def compute_nutrition_streak_days(
    today: date,
    cutoff: date,
    daily_kcal: Mapping[date, float],
    target_kcal: Optional[float],
) -> int:
    """Días consecutivos con criterio 'done' del resumen mensual (>=80% del objetivo, o kcal>0 si no hay objetivo). Hoy incompleto no rompe la racha."""

    def completed(d: date) -> bool:
        kcal = float(daily_kcal.get(d, 0.0))
        return is_day_done(kcal, target_kcal)

    streak = 0
    d = today
    while d >= cutoff:
        if not completed(d):
            if d == today:
                d -= timedelta(days=1)
                continue
            break
        streak += 1
        d -= timedelta(days=1)
    return streak


def get_streak_deadline(day: date) -> datetime:
    """Devuelve el cierre de racha para un día: 03:00 del día siguiente."""
    return datetime.combine(day + timedelta(days=1), time(hour=STREAK_GRACE_HOUR))


class MealService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.meal_repo = MealRepository(db)
        self.profile_repo = ProfileRepository(db)
        generic = GenericFoodProvider(db)
        barcode = OpenFoodFactsProvider()
        self.food_provider = CompositeFoodProvider([generic, barcode])

    async def search_foods(self, query: str, limit: int = 20):
        return await self.food_provider.search(query, limit)

    async def analyze_photo(
        self,
        *,
        image_url: str | None = None,
        image_base64: str | None = None,
        mime_type: str = "image/jpeg",
    ) -> Optional[PhotoAnalysisResponse]:
        if image_base64 and image_base64.strip():
            raw = image_base64.strip()
            if raw.startswith("data:"):
                vision_url = raw
            else:
                vision_url = f"data:{mime_type};base64,{raw}"
        elif image_url and image_url.strip():
            vision_url = image_url.strip()
        else:
            return None
        ai_result = await analyze_food_photo(vision_url)
        if not ai_result:
            return None

        return await self._enrich_ai_items(ai_result, image_url=image_url)

    async def parse_text_meal(self, text: str) -> Optional[PhotoAnalysisResponse]:
        """Parse free-text meal description via Groq and enrich with DB data."""
        prompt = (
            "Eres un experto nutricionista. El usuario describe lo que comió en texto libre.\n"
            "Parsea la descripción y devuelve cada alimento con macros estimados.\n\n"
            "Reglas:\n"
            "- Usa nombres en español, genéricos (sin marcas).\n"
            "- Los macros deben ser coherentes: usa valores por 100g típicos y multiplica por (gramos/100).\n"
            "- Si el usuario dice 'en crudo', calcula macros del alimento crudo.\n"
            "- Si dice 'a la plancha' o 'cocido', ajusta ligeramente (la cocción reduce agua, concentra macros por peso).\n"
            "- confidence='high' si el usuario da gramos exactos, 'medium' si estima.\n"
            "- meal_name: nombre descriptivo del conjunto.\n"
            "- overall_confidence: 'high' si todo es claro."
        )

        messages = [{"role": "user", "content": text}]

        try:
            ai_result = await structured_output(
                messages=messages,
                response_model=PhotoAnalysisAIResponse,
                temperature=0.2,
                max_tokens=2000,
                system_prompt=prompt,
            )
        except Exception as e:
            logger.error(f"Text meal parse failed: {e}")
            return None

        return await self._enrich_ai_items(ai_result)

    async def _enrich_ai_items(
        self, ai_result: PhotoAnalysisAIResponse, image_url: str | None = None
    ) -> PhotoAnalysisResponse:
        """Shared enrichment: look up DB, fallback to AI estimates."""
        enriched_items = []
        total_kcal = 0.0
        total_protein = 0.0
        total_carbs = 0.0
        total_fat = 0.0

        generic = GenericFoodProvider(self.db)

        for item in ai_result.items:
            matched = await generic.search_by_name_exact(item.normalized_name)
            if not matched:
                results = await generic.search(item.normalized_name, limit=1)
                matched = results[0] if results else None

            if matched:
                macros = calculate_food_macros(
                    matched.kcal_per_100g, matched.protein_per_100g,
                    matched.carbs_per_100g, matched.fat_per_100g,
                    item.estimated_grams,
                )
                enriched = EnrichedFoodItem(
                    detected_name=item.detected_name,
                    normalized_name=item.normalized_name,
                    matched_food_id=matched.id,
                    provider=matched.provider,
                    estimated_grams=item.estimated_grams,
                    confidence=item.confidence,
                    assumptions=item.assumptions,
                    **macros,
                )
            else:
                g = max(item.estimated_grams, 1)
                ai_kcal = getattr(item, "estimated_kcal", 0) or 0
                ai_prot = getattr(item, "estimated_protein_g", 0) or 0
                ai_carb = getattr(item, "estimated_carbs_g", 0) or 0
                ai_fat = getattr(item, "estimated_fat_g", 0) or 0

                if ai_kcal / g > 9:
                    ai_kcal = round(g * 2, 1)
                    ai_prot = round(g * 0.1, 1)
                    ai_carb = round(g * 0.2, 1)
                    ai_fat = round(g * 0.05, 1)

                if ai_kcal > 0 or ai_prot > 0 or ai_carb > 0 or ai_fat > 0:
                    macros = {
                        "kcal": round(ai_kcal, 1),
                        "protein_g": round(ai_prot, 1),
                        "carbs_g": round(ai_carb, 1),
                        "fat_g": round(ai_fat, 1),
                    }
                    assumptions_extra = ["Macros estimados por IA (sin match en base de datos)"]
                else:
                    macros = {"kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}
                    assumptions_extra = ["Alimento no encontrado en base de datos"]

                enriched = EnrichedFoodItem(
                    detected_name=item.detected_name,
                    normalized_name=item.normalized_name,
                    estimated_grams=item.estimated_grams,
                    confidence="low",
                    assumptions=item.assumptions + assumptions_extra,
                    **macros,
                )

            enriched_items.append(enriched)
            total_kcal += enriched.kcal
            total_protein += enriched.protein_g
            total_carbs += enriched.carbs_g
            total_fat += enriched.fat_g

        return PhotoAnalysisResponse(
            meal_name=ai_result.meal_name,
            items=enriched_items,
            total_kcal=round(total_kcal, 1),
            total_protein_g=round(total_protein, 1),
            total_carbs_g=round(total_carbs, 1),
            total_fat_g=round(total_fat, 1),
            overall_confidence=ai_result.overall_confidence,
            notes=ai_result.notes,
            photo_url=image_url,
        )

    def _diary_retention_cutoff(self) -> date:
        return date.today() - timedelta(days=DIARY_RETENTION_DAYS)

    async def confirm_meal(self, user_id: str, data: MealConfirmRequest):
        cutoff = self._diary_retention_cutoff()
        if data.date < cutoff:
            raise HTTPException(
                status_code=400,
                detail="No se pueden registrar comidas en fechas anteriores al límite de 30 días.",
            )
        await self.meal_repo.delete_meals_before_date(user_id, cutoff)

        items_data = []
        for item in data.items:
            grams_errors = validate_item_grams(item.grams)
            if grams_errors:
                raise HTTPException(status_code=422, detail=grams_errors[0])

            items_data.append({
                "food_catalog_id": item.food_catalog_id,
                "custom_name": item.custom_name,
                "grams": item.grams,
                "kcal": item.kcal,
                "protein_g": item.protein_g,
                "carbs_g": item.carbs_g,
                "fat_g": item.fat_g,
                "source": getattr(item, "source", None),
                "eaten": item.eaten,
            })

        total_kcal_for_validation = sum(i["kcal"] for i in items_data)
        meal_errors = validate_meal_total(total_kcal_for_validation)
        if meal_errors:
            raise HTTPException(status_code=422, detail=meal_errors[0])

        entry = await self.meal_repo.create_meal_entry(
            user_id=user_id,
            meal_date=data.date,
            meal_type=data.meal_type.value,
            items=items_data,
            title=data.title,
            photo_url=data.photo_url,
            ai_confidence=data.ai_confidence,
            notes=data.notes,
        )
        from app.services.badge_integration import fire_meal_logged

        await fire_meal_logged(self.db, user_id, entry.id)
        return entry

    async def get_meal(self, meal_id: UUID, user_id: str):
        return await self.meal_repo.get_meal_by_id(meal_id, user_id)

    async def get_diary(self, user_id: str, diary_date: date) -> dict:
        cutoff = self._diary_retention_cutoff()
        await self.meal_repo.delete_meals_before_date(user_id, cutoff)
        meals = await self.meal_repo.get_meals_by_date(user_id, diary_date)
        target = await self.profile_repo.get_active_target(user_id)

        total_kcal = sum(m.total_kcal for m in meals)
        total_protein = sum(m.total_protein_g for m in meals)
        total_carbs = sum(m.total_carbs_g for m in meals)
        total_fat = sum(m.total_fat_g for m in meals)

        return {
            "date": diary_date,
            "meals": meals,
            "total_kcal": round(total_kcal, 1),
            "total_protein_g": round(total_protein, 1),
            "total_carbs_g": round(total_carbs, 1),
            "total_fat_g": round(total_fat, 1),
            "target_kcal": target.calories_kcal if target else None,
            "target_protein_g": target.protein_g if target else None,
            "target_carbs_g": target.carbs_g if target else None,
            "target_fat_g": target.fat_g if target else None,
        }

    async def get_month_summary(self, user_id: str, year: int, month: int) -> dict:
        """Estado de cumplimiento por día dentro del mes solicitado.

        - done: kcal >= 80% del objetivo.
        - partial: 40% <= kcal < 80%.
        - missed: kcal < 40%.
        Sólo se devuelven días pasados o el actual (no futuros) y dentro de la ventana de retención.
        """
        if month < 1 or month > 12:
            raise HTTPException(status_code=400, detail="Mes inválido")

        from calendar import monthrange

        month_start = date(year, month, 1)
        month_end = date(year, month, monthrange(year, month)[1])
        today = date.today()
        cutoff = self._diary_retention_cutoff()

        range_start = max(month_start, cutoff)
        range_end = min(month_end, today)

        target = await self.profile_repo.get_active_target(user_id)
        target_kcal = float(target.calories_kcal) if target and target.calories_kcal else None

        days: list[dict] = []
        if range_end >= range_start:
            daily_kcal = await self.meal_repo.get_daily_kcal_in_range(user_id, range_start, range_end)
            current = range_start
            while current <= range_end:
                kcal = float(daily_kcal.get(current, 0.0))
                if target_kcal and target_kcal > 0:
                    ratio = kcal / target_kcal
                    if is_day_done(kcal, target_kcal):
                        status = "done"
                    elif ratio >= 0.40:
                        status = "partial"
                    else:
                        status = "missed"
                else:
                    status = "done" if is_day_done(kcal, None) else "missed"
                days.append({"date": current, "kcal": round(kcal, 1), "status": status})
                current = current + timedelta(days=1)

        return {
            "year": year,
            "month": month,
            "target_kcal": target_kcal,
            "days": days,
        }

    async def get_nutrition_streak_days(self, user_id: str) -> int:
        """Racha actual: días calendario consecutivos marcados como 'done' en el mismo criterio que el resumen mensual."""
        today = date.today()
        cutoff = self._diary_retention_cutoff()
        target = await self.profile_repo.get_active_target(user_id)
        target_kcal = float(target.calories_kcal) if target and target.calories_kcal else None
        daily_kcal = await self.meal_repo.get_daily_streak_kcal_in_range(
            user_id,
            cutoff,
            today,
            streak_deadline_fn=get_streak_deadline,
        )
        return compute_nutrition_streak_days(today, cutoff, daily_kcal, target_kcal)

    async def list_recent_meal_entries(self, user_id: str, limit: int = 40):
        """Para búsqueda / sugerencias: últimas comidas en el diario, no solo el día seleccionado."""
        cutoff = self._diary_retention_cutoff()
        await self.meal_repo.delete_meals_before_date(user_id, cutoff)
        return await self.meal_repo.list_recent_meal_entries(user_id, limit)

    async def update_meal(self, meal_id: UUID, user_id: str, **kwargs):
        items = kwargs.pop("items", None)
        items_data = None
        if items:
            items_data = [
                {
                    "food_catalog_id": i.food_catalog_id if i.food_catalog_id else None,
                    "custom_name": i.custom_name,
                    "grams": i.grams,
                    "kcal": i.kcal,
                    "protein_g": i.protein_g,
                    "carbs_g": i.carbs_g,
                    "fat_g": i.fat_g,
                    "eaten": i.eaten,
                }
                for i in items
            ]
        return await self.meal_repo.update_meal_entry(meal_id, user_id, items=items_data, **kwargs)

    async def set_meal_item_eaten(self, meal_id: UUID, item_id: UUID, user_id: str, eaten: bool):
        return await self.meal_repo.set_meal_entry_item_eaten(meal_id, item_id, user_id, eaten)

    async def delete_meal(self, meal_id: UUID, user_id: str) -> bool:
        return await self.meal_repo.delete_meal_entry(meal_id, user_id)

    async def create_saved_meal(self, user_id: str, name: str, items: list):
        items_data = [
            {
                "food_catalog_id": i.food_catalog_id if i.food_catalog_id else None,
                "custom_name": i.custom_name,
                "grams": i.grams,
                "kcal": i.kcal,
                "protein_g": i.protein_g,
                "carbs_g": i.carbs_g,
                "fat_g": i.fat_g,
            }
            for i in items
        ]
        saved = await self.meal_repo.create_saved_meal(user_id, name, items_data)
        from app.services.badge_integration import fire_saved_meal_created

        await fire_saved_meal_created(self.db, user_id, saved.id)
        return saved

    async def get_saved_meals(self, user_id: str):
        return await self.meal_repo.get_saved_meals(user_id)

    async def delete_saved_meal(self, saved_meal_id: UUID, user_id: str) -> bool:
        return await self.meal_repo.delete_saved_meal(saved_meal_id, user_id)
