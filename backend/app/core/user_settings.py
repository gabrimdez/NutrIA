from __future__ import annotations

import re
from copy import deepcopy
from typing import Any, Mapping

PLAN_VARIETY_LEVELS = {"routine", "balanced", "high"}
PLAN_GENERATION_PRIORITIES = {"performance", "satiety", "budget", "speed"}
WEEKDAY_VALUES = {
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
}
NOTIFICATION_INTERVALS = {60, 90, 120, 180}
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")

DEFAULT_PLAN_PREFERENCES: dict[str, Any] = {
    "meals_collapsed_by_default": True,
    "hide_archived_plans": False,
    "variety_level": "balanced",
    "generation_priority": "performance",
}

DEFAULT_MEAL_REMINDER_TIMES: dict[str, str] = {
    "breakfast": "09:00",
    "lunch": "13:30",
    "snack": "17:00",
    "dinner": "21:00",
}

DEFAULT_NOTIFICATION_PREFERENCES: dict[str, Any] = {
    "meal_reminders_enabled": False,
    "meal_reminder_times": deepcopy(DEFAULT_MEAL_REMINDER_TIMES),
    "hydration_reminders_enabled": False,
    "hydration_interval_minutes": 120,
    "weekly_plan_reminder_enabled": False,
    "weekly_plan_reminder_day": "sunday",
    "weekly_plan_reminder_time": "18:00",
}

DEFAULT_INTEGRATION_PREFERENCES: dict[str, Any] = {
    "apple_health_enabled": False,
    "google_fit_enabled": False,
    "calendar_sync_enabled": False,
}


def normalize_plan_preferences(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, Mapping) else {}
    out = deepcopy(DEFAULT_PLAN_PREFERENCES)

    if isinstance(src.get("meals_collapsed_by_default"), bool):
        out["meals_collapsed_by_default"] = src["meals_collapsed_by_default"]
    if isinstance(src.get("hide_archived_plans"), bool):
        out["hide_archived_plans"] = src["hide_archived_plans"]

    variety = str(src.get("variety_level") or "").strip().lower()
    if variety in PLAN_VARIETY_LEVELS:
        out["variety_level"] = variety

    priority = str(src.get("generation_priority") or "").strip().lower()
    if priority in PLAN_GENERATION_PRIORITIES:
        out["generation_priority"] = priority

    sp = src.get("sport_profile")
    if isinstance(sp, Mapping):
        sanitized = _sanitize_sport_profile_dict(sp)
        if sanitized:
            out["sport_profile"] = sanitized

    return out


def _sanitize_sport_profile_dict(raw: Mapping[Any, Any]) -> dict[str, Any]:
    """Perfil multideporte (docs/nutria_especificacion_multideporte.md §2); valores simples y listas cortas."""
    out: dict[str, Any] = {}
    for key, val in raw.items():
        if not isinstance(key, str) or len(key) > 80:
            continue
        if isinstance(val, (bool, int, float)) or val is None:
            out[key] = val
        elif isinstance(val, str):
            out[key] = val.strip()[:4000]
        elif isinstance(val, list) and len(val) <= 40:
            out[key] = [
                x.strip()[:500] if isinstance(x, str) else x
                for x in val[:40]
                if isinstance(x, (str, int, float, bool))
            ]
    return out


def normalize_notification_preferences(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, Mapping) else {}
    out = deepcopy(DEFAULT_NOTIFICATION_PREFERENCES)

    if isinstance(src.get("meal_reminders_enabled"), bool):
        out["meal_reminders_enabled"] = src["meal_reminders_enabled"]
    if isinstance(src.get("hydration_reminders_enabled"), bool):
        out["hydration_reminders_enabled"] = src["hydration_reminders_enabled"]
    if isinstance(src.get("weekly_plan_reminder_enabled"), bool):
        out["weekly_plan_reminder_enabled"] = src["weekly_plan_reminder_enabled"]

    times = deepcopy(DEFAULT_MEAL_REMINDER_TIMES)
    mt_src = src.get("meal_reminder_times")
    if isinstance(mt_src, Mapping):
        for key in ("breakfast", "lunch", "snack", "dinner"):
            t = str(mt_src.get(key) or "").strip()
            if TIME_RE.match(t):
                times[key] = t
    else:
        legacy = str(src.get("meal_reminder_time") or "").strip()
        if TIME_RE.match(legacy):
            times["breakfast"] = legacy
    out["meal_reminder_times"] = times

    interval = src.get("hydration_interval_minutes")
    try:
        iv = int(interval)
    except (TypeError, ValueError):
        iv = None
    if iv in NOTIFICATION_INTERVALS:
        out["hydration_interval_minutes"] = iv

    weekly_day = str(src.get("weekly_plan_reminder_day") or "").strip().lower()
    if weekly_day in WEEKDAY_VALUES:
        out["weekly_plan_reminder_day"] = weekly_day

    weekly_time = str(src.get("weekly_plan_reminder_time") or "").strip()
    if TIME_RE.match(weekly_time):
        out["weekly_plan_reminder_time"] = weekly_time

    return out


def normalize_integration_preferences(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, Mapping) else {}
    out = deepcopy(DEFAULT_INTEGRATION_PREFERENCES)

    if isinstance(src.get("apple_health_enabled"), bool):
        out["apple_health_enabled"] = src["apple_health_enabled"]
    if isinstance(src.get("google_fit_enabled"), bool):
        out["google_fit_enabled"] = src["google_fit_enabled"]
    if isinstance(src.get("calendar_sync_enabled"), bool):
        out["calendar_sync_enabled"] = src["calendar_sync_enabled"]

    return out


VALID_INTEGRATION_STATUSES = {
    "disabled", "enabled_pending", "available_not_connected",
    "permission_denied", "connected", "sync_error",
}

DEFAULT_INTEGRATION_STATUS: dict[str, Any] = {
    "apple_health": "disabled",
    "google_fit": "disabled",
    "calendar": "disabled",
    "last_sync_at": None,
    "last_error": None,
}


def normalize_integration_status(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, Mapping) else {}
    out = deepcopy(DEFAULT_INTEGRATION_STATUS)

    for key in ("apple_health", "google_fit", "calendar"):
        val = str(src.get(key) or "").strip().lower()
        if val in VALID_INTEGRATION_STATUSES:
            out[key] = val

    if src.get("last_sync_at"):
        out["last_sync_at"] = str(src["last_sync_at"])
    if src.get("last_error"):
        out["last_error"] = str(src["last_error"])[:500]

    return out


def normalize_app_settings(
    *,
    plan_preferences: Any = None,
    notification_preferences: Any = None,
    integration_preferences: Any = None,
    integration_status: Any = None,
) -> dict[str, Any]:
    return {
        "plan_preferences": normalize_plan_preferences(plan_preferences),
        "notification_preferences": normalize_notification_preferences(notification_preferences),
        "integration_preferences": normalize_integration_preferences(integration_preferences),
        "integration_status": normalize_integration_status(integration_status),
    }


def plan_generation_preference_notes(plan_preferences: Any, additional_preferences: str | None = None) -> list[str]:
    prefs = normalize_plan_preferences(plan_preferences)
    out: list[str] = []
    lower_additional = (additional_preferences or "").strip().lower()
    has_variety_override = "variedad al generar:" in lower_additional or "variedad:" in lower_additional
    has_priority_override = (
        "prioridad de generación:" in lower_additional
        or "prioridad de generacion:" in lower_additional
        or "prioridad:" in lower_additional
    )

    if not has_variety_override:
        variety = prefs["variety_level"]
        if variety == "routine":
            out.append("Variedad: baja; repetir bases y simplificar compra y cocina.")
        elif variety == "high":
            out.append("Variedad: alta; evitar repeticiones frecuentes entre dias y comidas.")
        else:
            out.append("Variedad: equilibrada; alternar platos sin volver caotico el plan.")

    if not has_priority_override:
        priority = prefs["generation_priority"]
        if priority == "budget":
            out.append("Prioridad: presupuesto; usar ingredientes comunes, reutilizables y asequibles.")
        elif priority == "satiety":
            out.append("Prioridad: saciedad; favorecer volumen, fibra y platos mas llenadores.")
        elif priority == "speed":
            out.append("Prioridad: rapidez; reducir elaboraciones largas y favorecer opciones practicas.")
        else:
            out.append("Prioridad: rendimiento; priorizar energia, proteina y coherencia deportiva.")

    return out
