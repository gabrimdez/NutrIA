"""Tests for smart notification decision logic.

The actual smart notification logic runs client-side (mobile/src/lib/smartNotifications.ts).
These tests validate the backend data contracts that support it.
"""
import pytest
from app.schemas.settings import (
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
)
from app.core.user_settings import (
    normalize_notification_preferences,
    DEFAULT_NOTIFICATION_PREFERENCES,
)


class TestNotificationPreferences:
    def test_defaults(self):
        result = normalize_notification_preferences(None)
        assert result == DEFAULT_NOTIFICATION_PREFERENCES
        assert result["meal_reminders_enabled"] is False
        assert result["hydration_reminders_enabled"] is False

    def test_enable_meal_reminders(self):
        result = normalize_notification_preferences({
            "meal_reminders_enabled": True,
            "meal_reminder_times": {
                "breakfast": "08:00",
                "lunch": "13:30",
                "snack": "17:00",
                "dinner": "21:00",
            },
        })
        assert result["meal_reminders_enabled"] is True
        assert result["meal_reminder_times"]["breakfast"] == "08:00"

    def test_legacy_single_time_sets_breakfast(self):
        result = normalize_notification_preferences({
            "meal_reminder_time": "08:00",
        })
        assert result["meal_reminder_times"]["breakfast"] == "08:00"
        assert result["meal_reminder_times"]["lunch"] == "13:30"

    def test_invalid_time_ignored(self):
        result = normalize_notification_preferences({
            "meal_reminder_times": {
                "breakfast": "25:99",
                "lunch": "13:30",
                "snack": "17:00",
                "dinner": "21:00",
            },
        })
        assert result["meal_reminder_times"]["breakfast"] == "09:00"

    def test_invalid_interval_ignored(self):
        result = normalize_notification_preferences({
            "hydration_interval_minutes": 45,
        })
        assert result["hydration_interval_minutes"] == 120

    def test_valid_interval(self):
        result = normalize_notification_preferences({
            "hydration_reminders_enabled": True,
            "hydration_interval_minutes": 90,
        })
        assert result["hydration_interval_minutes"] == 90

    def test_weekly_plan_defaults(self):
        result = normalize_notification_preferences({})
        assert result["weekly_plan_reminder_enabled"] is False
        assert result["weekly_plan_reminder_day"] == "sunday"

    def test_schema_validation(self):
        resp = NotificationPreferencesResponse()
        assert resp.meal_reminders_enabled is False
        assert resp.hydration_interval_minutes == 120

    def test_update_partial(self):
        update = NotificationPreferencesUpdate(
            meal_reminders_enabled=True,
        )
        dumped = update.model_dump(exclude_unset=True)
        assert "meal_reminders_enabled" in dumped
        assert "hydration_reminders_enabled" not in dumped
