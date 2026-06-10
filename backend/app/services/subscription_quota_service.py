from __future__ import annotations

from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import Profile
from app.repositories.auth_repo import AuthRepository
from app.repositories.profile_repo import ProfileRepository
from app.repositories.subscription_usage_repo import (
    METRIC_PARSE_DAY,
    METRIC_PARSE_MONTH,
    METRIC_RECIPE_RECOMMEND_DAY,
    METRIC_REGEN_WEEK,
    METRIC_VISION_MONTH,
    SubscriptionUsageRepository,
)

# Mensajes que aparecen al bloquear features Premium-only.
# Centralizados aquí para evitar reescrituras divergentes de copy en cada endpoint.
_PREMIUM_FEATURE_COPY: dict[str, str] = {
    "plan_ai_generate": (
        "Generar un plan semanal completo con IA es una ventaja de NutrIA Premium. "
        "En plan Free puedes crear un plan manual y editarlo desde la app."
    ),
    "substitute_food": (
        "Sustituir alimentos del plan con sugerencias de IA está incluido en NutrIA Premium. "
        "En plan Free puedes editar los alimentos manualmente."
    ),
    "macro_estimate": (
        "Estimar macros de un alimento con IA está incluido en NutrIA Premium. "
        "En plan Free puedes introducir los valores manualmente desde la etiqueta."
    ),
}


def _premium_required_exception(feature: str) -> HTTPException:
    return HTTPException(status_code=403, detail=_PREMIUM_FEATURE_COPY[feature])


def _premium_override_ids() -> set[str]:
    if get_settings().environment.lower() == "production":
        return set()
    raw = (get_settings().nutriforce_premium_override_user_ids or "").strip()
    return {x.strip() for x in raw.split(",") if x.strip()}


def _normalize_email(email: Optional[str]) -> str:
    return (email or "").strip().lower()


def _premium_override_emails() -> set[str]:
    raw = (get_settings().nutriforce_premium_override_emails or "").strip()
    return {_normalize_email(x) for x in raw.split(",") if _normalize_email(x)}


def effective_subscription_tier(
    profile: Optional[Profile],
    user_id: str,
    user_email: Optional[str] = None,
) -> str:
    if user_id in _premium_override_ids():
        return "premium"
    if _normalize_email(user_email) in _premium_override_emails():
        return "premium"
    if profile is not None and getattr(profile, "subscription_tier", None) == "premium":
        return "premium"
    return "free"


def user_is_premium(profile: Optional[Profile], user_id: str, user_email: Optional[str] = None) -> bool:
    return effective_subscription_tier(profile, user_id, user_email) == "premium"


class SubscriptionQuotaService:
    """Free plan quotas. Premium has unlimited product usage."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.usage_repo = SubscriptionUsageRepository(db)
        self.profile_repo = ProfileRepository(db)
        self.auth_repo = AuthRepository(db)

    async def premium_status(
        self,
        user_id: str,
        *,
        profile: Optional[Profile] = None,
        user_email: Optional[str] = None,
    ) -> Tuple[bool, Optional[Profile]]:
        profile = profile if profile is not None else await self.profile_repo.get_by_user_id(user_id)
        if user_is_premium(profile, user_id, user_email):
            return True, profile
        if user_email is None:
            user = await self.auth_repo.get_by_id(user_id)
            if user_is_premium(profile, user_id, getattr(user, "email", None)):
                return True, profile
        return False, profile

    async def chat_turns_today(self, user_id: str) -> int:
        """Legacy daily counter; Premium is unlimited."""
        since = self.usage_repo.utc_day_start()
        chats = await self.usage_repo.count_user_messages_since(user_id, since)
        parses = await self.usage_repo.get_usage(user_id, METRIC_PARSE_DAY, self.usage_repo.day_key())
        return chats + parses

    async def chat_turns_this_month(self, user_id: str) -> int:
        since = self.usage_repo.utc_month_start()
        chats = await self.usage_repo.count_user_messages_since(user_id, since)
        parses = await self.usage_repo.get_usage(
            user_id, METRIC_PARSE_MONTH, self.usage_repo.month_key()
        )
        return chats + parses

    async def require_chat_turn(self, user_id: str) -> None:
        premium, _ = await self.premium_status(user_id)
        if premium:
            return
        period_key = self.usage_repo.month_key()
        await self.usage_repo.acquire_quota_lock(user_id, "chat_month", period_key)
        limit = get_settings().free_chat_user_messages_per_month
        used = await self.chat_turns_this_month(user_id)
        if used >= limit:
            detail = (
                f"Límite mensual de NutriCoach alcanzado ({limit} mensajes o descripciones de comida, "
                "mes calendario UTC, plan Free). "
                "NutrIA Premium elimina este cupo: uso ilimitado de IA en la app."
            )
            raise HTTPException(status_code=403, detail=detail)

    async def record_parse_text_success(self, user_id: str) -> None:
        premium, _ = await self.premium_status(user_id)
        if premium:
            return
        await self.usage_repo.increment_usage(
            user_id, METRIC_PARSE_MONTH, self.usage_repo.month_key()
        )

    async def require_recipe_recommendation_turn(self, user_id: str) -> None:
        """Dedicated Free quota for AI recipe suggestions."""
        premium, _ = await self.premium_status(user_id)
        if premium:
            return
        limit = get_settings().free_recipe_recommendations_per_day
        key = self.usage_repo.day_key()
        await self.usage_repo.acquire_quota_lock(user_id, METRIC_RECIPE_RECOMMEND_DAY, key)
        used = await self.usage_repo.get_usage(user_id, METRIC_RECIPE_RECOMMEND_DAY, key)
        if used >= limit:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Límite diario de sugerencias de recetas con IA alcanzado ({limit} en plan Free). "
                    "NutrIA Premium elimina este cupo: recetas con IA ilimitadas."
                ),
            )

    async def record_recipe_recommendation_success(self, user_id: str) -> None:
        premium, _ = await self.premium_status(user_id)
        if premium:
            return
        await self.usage_repo.increment_usage(
            user_id, METRIC_RECIPE_RECOMMEND_DAY, self.usage_repo.day_key()
        )

    async def require_vision(self, user_id: str) -> None:
        premium, _ = await self.premium_status(user_id)
        if premium:
            return
        lim = get_settings().free_vision_analyses_per_month
        key = self.usage_repo.month_key()
        await self.usage_repo.acquire_quota_lock(user_id, METRIC_VISION_MONTH, key)
        used = await self.usage_repo.get_usage(user_id, METRIC_VISION_MONTH, key)
        if used >= lim:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Análisis por foto: límite del plan Free ({lim} al mes, incluye chat con imagen). "
                    "NutrIA Premium elimina este cupo: visión y escáner con IA ilimitados."
                ),
            )

    async def record_vision_success(self, user_id: str) -> None:
        premium, _ = await self.premium_status(user_id)
        if premium:
            return
        await self.usage_repo.increment_usage(user_id, METRIC_VISION_MONTH, self.usage_repo.month_key())

    async def require_plan_regen(self, user_id: str) -> None:
        premium, _ = await self.premium_status(user_id)
        if premium:
            return
        lim = get_settings().free_plan_regenerations_per_week
        key = self.usage_repo.week_key()
        await self.usage_repo.acquire_quota_lock(user_id, METRIC_REGEN_WEEK, key)
        used = await self.usage_repo.get_usage(user_id, METRIC_REGEN_WEEK, key)
        if used >= lim:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Regenerar comida del plan con IA: límite semanal del plan Free ({lim}). "
                    "NutrIA Premium permite regenerar sin este tope."
                ),
            )

    async def record_plan_regen_success(self, user_id: str) -> None:
        premium, _ = await self.premium_status(user_id)
        if premium:
            return
        await self.usage_repo.increment_usage(user_id, METRIC_REGEN_WEEK, self.usage_repo.week_key())

    async def require_premium_for_plan_ai_generate(self, user_id: str) -> None:
        premium, _ = await self.premium_status(user_id)
        if not premium:
            raise _premium_required_exception("plan_ai_generate")

    async def require_premium_for_substitute_food(self, user_id: str) -> None:
        premium, _ = await self.premium_status(user_id)
        if not premium:
            raise _premium_required_exception("substitute_food")

    async def require_premium_for_macro_estimate(self, user_id: str) -> None:
        premium, _ = await self.premium_status(user_id)
        if not premium:
            raise _premium_required_exception("macro_estimate")

    async def build_usage_snapshot(self, user_id: str, *, premium: Optional[bool] = None) -> Optional[dict]:
        """Values exposed in GET /me/profile. Premium returns null usage because it is unlimited."""
        if premium is None:
            premium, _ = await self.premium_status(user_id)
        if premium:
            return None
        s = get_settings()
        vis_key = self.usage_repo.month_key()
        wk = self.usage_repo.week_key()
        return {
            "chat_messages_limit": s.free_chat_user_messages_per_month,
            "chat_messages_used": await self.chat_turns_this_month(user_id),
            "chat_messages_period": "month",
            "vision_analyses_limit_per_month": s.free_vision_analyses_per_month,
            "vision_analyses_this_month": await self.usage_repo.get_usage(
                user_id, METRIC_VISION_MONTH, vis_key
            ),
            "plan_regenerations_limit_per_week": s.free_plan_regenerations_per_week,
            "plan_regenerations_this_week": await self.usage_repo.get_usage(
                user_id, METRIC_REGEN_WEEK, wk
            ),
        }
