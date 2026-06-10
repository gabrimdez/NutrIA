"""Esquema JSON unlock_rule para insignias (validación Pydantic)."""
from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator


class RuleManualOnly(BaseModel):
    type: Literal["manual_only"]


class RuleOnboardingComplete(BaseModel):
    """Perfil con onboarding_completed y al menos un objetivo (goal) activo."""

    type: Literal["onboarding_complete"]


class RuleActiveGoal(BaseModel):
    """Al menos un goal activo para el usuario (confirmar / ajustar objetivo)."""

    type: Literal["active_goal"]


class RuleCountAction(BaseModel):
    type: Literal["count_action"]
    action_kind: str = Field(..., description="p. ej. meal_logged, food_search, barcode_scan")
    target: int = Field(..., ge=1)


class RuleCountUniqueDays(BaseModel):
    type: Literal["count_unique_days"]
    action_kind: str = Field(default="meal_logged")
    target: int = Field(..., ge=1)
    grace_days_after_calendar_day: int = Field(default=1, ge=0, le=7)


class RuleStreakDays(BaseModel):
    type: Literal["streak_days"]
    target: int = Field(..., ge=1)
    min_meals_per_day: int = Field(default=1, ge=1, le=6)
    grace_days_after_calendar_day: int = Field(default=1, ge=0, le=7)


class RuleCompleteDays(BaseModel):
    type: Literal["complete_days"]
    target: int = Field(..., ge=1)
    min_real_meals: int = Field(default=3, ge=2, le=8)
    min_minutes_between_meals: int = Field(default=90, ge=15, le=720)
    min_kcal_per_meal: float = Field(default=80.0, ge=0)


class RuleCoachMessages(BaseModel):
    type: Literal["coach_messages"]
    target: int = Field(..., ge=1)


class RuleWeightLogs(BaseModel):
    type: Literal["weight_logs"]
    target: int = Field(..., ge=1)


class RuleWeightWeekStreak(BaseModel):
    """Máxima racha de semanas consecutivas (lunes inicio) con ≥1 pesaje por semana (weight_logs)."""

    type: Literal["weight_week_streak"]
    target: int = Field(..., ge=1, le=104)


class RuleWaterDays(BaseModel):
    """Días distintos con water_logs.glasses >= min_glasses_per_day (defecto 1)."""

    type: Literal["water_days"]
    target: int = Field(..., ge=1)
    min_glasses_per_day: int = Field(default=1, ge=1, le=50)


class RuleDiaryEntries(BaseModel):
    type: Literal["diary_entries"]
    target: int = Field(..., ge=1)


class RuleHabitsCompleted(BaseModel):
    """Proxy: días con agua >=1 vaso o actividad registrada (sin entidad hábito en BD)."""

    type: Literal["habits_completed"]
    target: int = Field(..., ge=1)


class RulePlanningActions(BaseModel):
    type: Literal["planning_actions"]
    target: int = Field(..., ge=1)


class RuleExplorationActions(BaseModel):
    type: Literal["exploration_actions"]
    target: int = Field(..., ge=1)


class RuleMacroGoalDays(BaseModel):
    """Días (histórico) con totales diarios de comidas dentro de ±margin_pct del target activo (kcal + macros)."""

    type: Literal["macro_goal_days"]
    target: int = Field(..., ge=1)
    margin_pct: float = Field(default=10.0, ge=0, le=50)


class RulePremiumActive(BaseModel):
    """Suscripción Premium activa (`profiles.subscription_tier == 'premium'` u override de dev/config)."""

    type: Literal["premium_active"]


_DEFAULT_VERSATILE_LOGGER_KINDS: tuple[str, ...] = (
    "food_search",
    "nutrition_search",
    "barcode_scan",
    "photo_analyze",
    "text_entry_meal",
    "saved_meal_created",
    "recipe_logged",
)


class RuleVersatileLogger(BaseModel):
    """Cuenta `action_kind` distintos del ledger presentes en `action_kinds` (cada uno ≥1 fila)."""

    type: Literal["versatile_logger"]
    target: int = Field(default=5, ge=1, le=10)
    action_kinds: list[str] = Field(default_factory=lambda: list(_DEFAULT_VERSATILE_LOGGER_KINDS))

    @field_validator("action_kinds", mode="before")
    @classmethod
    def _normalize_kinds(cls, v: object) -> list[str]:
        if v is None or (isinstance(v, list) and len(v) == 0):
            return list(_DEFAULT_VERSATILE_LOGGER_KINDS)
        if isinstance(v, list):
            out = sorted({str(x).strip() for x in v if str(x).strip()})
            return out if out else list(_DEFAULT_VERSATILE_LOGGER_KINDS)
        return list(_DEFAULT_VERSATILE_LOGGER_KINDS)


class RuleBalancedWeek(BaseModel):
    """Ventana de `window_days` hasta hoy: al menos `ceil(window_days * min_day_fraction)` días con macros dentro del margen y agua ≥ meta (vasos)."""

    type: Literal["balanced_week"]
    window_days: int = Field(default=7, ge=3, le=14)
    macro_margin_pct: float = Field(default=10.0, ge=1, le=30)
    min_day_fraction: float = Field(default=0.8, ge=0.5, le=1.0)
    water_glasses_goal: int = Field(default=12, ge=1, le=30)


UnlockRule = Annotated[
    Union[
        RuleManualOnly,
        RuleOnboardingComplete,
        RuleActiveGoal,
        RuleCountAction,
        RuleCountUniqueDays,
        RuleStreakDays,
        RuleCompleteDays,
        RuleCoachMessages,
        RuleWeightLogs,
        RuleWeightWeekStreak,
        RuleWaterDays,
        RuleDiaryEntries,
        RuleHabitsCompleted,
        RulePlanningActions,
        RuleExplorationActions,
        RuleMacroGoalDays,
        RuleBalancedWeek,
        RulePremiumActive,
        RuleVersatileLogger,
    ],
    Field(discriminator="type"),
]


def parse_unlock_rule(raw: object | None) -> Optional[UnlockRule]:
    if raw is None:
        return None
    if isinstance(raw, dict):
        t = raw.get("type")
        mapping: dict[str, type[BaseModel]] = {
            "manual_only": RuleManualOnly,
            "onboarding_complete": RuleOnboardingComplete,
            "active_goal": RuleActiveGoal,
            "count_action": RuleCountAction,
            "count_unique_days": RuleCountUniqueDays,
            "streak_days": RuleStreakDays,
            "complete_days": RuleCompleteDays,
            "coach_messages": RuleCoachMessages,
            "weight_logs": RuleWeightLogs,
            "weight_week_streak": RuleWeightWeekStreak,
            "water_days": RuleWaterDays,
            "diary_entries": RuleDiaryEntries,
            "habits_completed": RuleHabitsCompleted,
            "planning_actions": RulePlanningActions,
            "exploration_actions": RuleExplorationActions,
            "macro_goal_days": RuleMacroGoalDays,
            "balanced_week": RuleBalancedWeek,
            "premium_active": RulePremiumActive,
            "versatile_logger": RuleVersatileLogger,
        }
        cls = mapping.get(str(t))
        if not cls:
            return None
        return cls.model_validate(raw)  # type: ignore[return-value]
    return None
