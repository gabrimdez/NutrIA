from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


PlanVarietyLevel = Literal["routine", "balanced", "high"]
GenerationPriority = Literal["performance", "satiety", "budget", "speed"]
WeekdayValue = Literal[
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]

_TIME_PATTERN = r"^(?:[01]\d|2[0-3]):[0-5]\d$"


class MealReminderTimesResponse(BaseModel):
    breakfast: str = Field(default="09:00", pattern=_TIME_PATTERN)
    lunch: str = Field(default="13:30", pattern=_TIME_PATTERN)
    snack: str = Field(default="17:00", pattern=_TIME_PATTERN)
    dinner: str = Field(default="21:00", pattern=_TIME_PATTERN)


class MealReminderTimesUpdate(BaseModel):
    breakfast: Optional[str] = Field(default=None, pattern=_TIME_PATTERN)
    lunch: Optional[str] = Field(default=None, pattern=_TIME_PATTERN)
    snack: Optional[str] = Field(default=None, pattern=_TIME_PATTERN)
    dinner: Optional[str] = Field(default=None, pattern=_TIME_PATTERN)


class PlanPreferencesResponse(BaseModel):
    meals_collapsed_by_default: bool = True
    hide_archived_plans: bool = False
    variety_level: PlanVarietyLevel = "balanced"
    generation_priority: GenerationPriority = "performance"
    sport_profile: Optional[dict[str, Any]] = None


class PlanPreferencesUpdate(BaseModel):
    meals_collapsed_by_default: Optional[bool] = None
    hide_archived_plans: Optional[bool] = None
    variety_level: Optional[PlanVarietyLevel] = None
    generation_priority: Optional[GenerationPriority] = None
    sport_profile: Optional[dict[str, Any]] = None

    @field_validator("sport_profile")
    @classmethod
    def _bound_sport_profile(cls, v: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
        if v is None:
            return None
        if len(v) > 30:
            raise ValueError("sport_profile no puede tener mas de 30 campos")
        out: dict[str, Any] = {}
        for key, val in v.items():
            k = str(key).strip()
            if not k or len(k) > 60:
                raise ValueError("Las claves de sport_profile deben tener 60 caracteres o menos")
            if isinstance(val, str):
                s = val.strip()
                if len(s) > 300:
                    raise ValueError("Los textos de sport_profile deben tener 300 caracteres o menos")
                out[k] = s
            elif isinstance(val, (int, float, bool)) or val is None:
                out[k] = val
            elif isinstance(val, list):
                if len(val) > 20:
                    raise ValueError("Las listas de sport_profile no pueden superar 20 elementos")
                items = []
                for item in val:
                    s = str(item).strip()
                    if len(s) > 120:
                        raise ValueError("Los elementos de sport_profile deben tener 120 caracteres o menos")
                    if s:
                        items.append(s)
                out[k] = items
            else:
                raise ValueError("sport_profile solo admite textos, numeros, booleanos y listas simples")
        return out


class NotificationPreferencesResponse(BaseModel):
    meal_reminders_enabled: bool = False
    meal_reminder_times: MealReminderTimesResponse = Field(default_factory=MealReminderTimesResponse)
    hydration_reminders_enabled: bool = False
    hydration_interval_minutes: int = Field(default=120, ge=60, le=180)
    weekly_plan_reminder_enabled: bool = False
    weekly_plan_reminder_day: WeekdayValue = "sunday"
    weekly_plan_reminder_time: str = Field(default="18:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class NotificationPreferencesUpdate(BaseModel):
    meal_reminders_enabled: Optional[bool] = None
    meal_reminder_times: Optional[MealReminderTimesUpdate] = None
    hydration_reminders_enabled: Optional[bool] = None
    hydration_interval_minutes: Optional[int] = Field(default=None, ge=60, le=180)
    weekly_plan_reminder_enabled: Optional[bool] = None
    weekly_plan_reminder_day: Optional[WeekdayValue] = None
    weekly_plan_reminder_time: Optional[str] = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class IntegrationPreferencesResponse(BaseModel):
    apple_health_enabled: bool = False
    google_fit_enabled: bool = False
    calendar_sync_enabled: bool = False


class IntegrationPreferencesUpdate(BaseModel):
    apple_health_enabled: Optional[bool] = None
    google_fit_enabled: Optional[bool] = None
    calendar_sync_enabled: Optional[bool] = None


IntegrationStatusValue = Literal[
    "disabled",
    "enabled_pending",
    "available_not_connected",
    "permission_denied",
    "connected",
    "sync_error",
]


class IntegrationStatusResponse(BaseModel):
    apple_health: IntegrationStatusValue = "disabled"
    google_fit: IntegrationStatusValue = "disabled"
    calendar: IntegrationStatusValue = "disabled"
    last_sync_at: Optional[str] = None
    last_error: Optional[str] = None


class IntegrationStatusUpdate(BaseModel):
    apple_health: Optional[IntegrationStatusValue] = None
    google_fit: Optional[IntegrationStatusValue] = None
    calendar: Optional[IntegrationStatusValue] = None
    last_sync_at: Optional[str] = None
    last_error: Optional[str] = None


class AppSettingsResponse(BaseModel):
    plan_preferences: PlanPreferencesResponse
    notification_preferences: NotificationPreferencesResponse
    integration_preferences: IntegrationPreferencesResponse
    integration_status: IntegrationStatusResponse = IntegrationStatusResponse()


class AppSettingsUpdate(BaseModel):
    plan_preferences: Optional[PlanPreferencesUpdate] = None
    notification_preferences: Optional[NotificationPreferencesUpdate] = None
    integration_preferences: Optional[IntegrationPreferencesUpdate] = None
    integration_status: Optional[IntegrationStatusUpdate] = None
