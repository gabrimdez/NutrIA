import { Platform } from 'react-native';

import type { AppSettings, MealReminderTimes, NotificationPreferences } from '../types';
import { api } from './api';
import { normalizeAppSettings, parseTimeString, weekdayToExpoNumber } from './appSettings';

const REMINDERS_CHANNEL_ID = 'nutriforce-reminders';
const REMINDER_IDENTIFIERS = {
  mealBreakfast: 'nutria-meal-breakfast',
  mealLunch: 'nutria-meal-lunch',
  mealSnack: 'nutria-meal-snack',
  mealDinner: 'nutria-meal-dinner',
  hydration: 'nutria-hydration',
  weeklyPlan: 'nutria-weekly-plan',
} as const;

let configured = false;

/** Carga perezosa: en web no importar expo-notifications (evita listeners/token y warnings). */
async function getNotifications() {
  if (Platform.OS === 'web') return null;
  return import('expo-notifications');
}

export function configureNotificationHandling() {
  if (configured || Platform.OS === 'web') return;
  void (async () => {
    const Notifications = await getNotifications();
    if (!Notifications || configured) return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    configured = true;
  })();
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  const Notifications = await getNotifications();
  if (!Notifications) return;
  await Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL_ID, {
    name: 'Recordatorios NutrIA',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function requestNotificationPermissionsIfNeeded(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const Notifications = await getNotifications();
  if (!Notifications) return false;

  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function syncLocalNotificationPreferences(preferences: NotificationPreferences): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const Notifications = await getNotifications();
  if (!Notifications) return false;

  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const hasAnyReminder = hasEnabledNotificationPreferences(preferences);

  if (!hasAnyReminder) return true;

  const hasPermission = await requestNotificationPermissionsIfNeeded();
  if (!hasPermission) return false;

  const mealCopy: Record<keyof MealReminderTimes, { title: string; body: string }> = {
    breakfast: { title: 'Desayuno', body: 'Mira qué toca en tu plan para desayunar.' },
    lunch: { title: 'Comida', body: 'Revisa el almuerzo que tienes planificado hoy.' },
    snack: { title: 'Merienda', body: 'Es hora de revisar tu merienda en el plan.' },
    dinner: { title: 'Cena', body: 'Consulta la cena de tu plan para hoy.' },
  };
  const mealIds: Record<keyof MealReminderTimes, string> = {
    breakfast: REMINDER_IDENTIFIERS.mealBreakfast,
    lunch: REMINDER_IDENTIFIERS.mealLunch,
    snack: REMINDER_IDENTIFIERS.mealSnack,
    dinner: REMINDER_IDENTIFIERS.mealDinner,
  };

  if (preferences.meal_reminders_enabled) {
    const slots: (keyof MealReminderTimes)[] = ['breakfast', 'lunch', 'snack', 'dinner'];
    for (const slot of slots) {
      const { hour, minute } = parseTimeString(preferences.meal_reminder_times[slot]);
      const copy = mealCopy[slot];
      await Notifications.scheduleNotificationAsync({
        identifier: mealIds[slot],
        content: {
          title: copy.title,
          body: copy.body,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          channelId: REMINDERS_CHANNEL_ID,
          hour,
          minute,
        },
      });
    }
  }

  if (preferences.hydration_reminders_enabled) {
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_IDENTIFIERS.hydration,
      content: {
        title: 'Pausa para agua',
        body: 'Toca hidratarte y acercarte a tu objetivo de agua.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        channelId: REMINDERS_CHANNEL_ID,
        repeats: true,
        seconds: preferences.hydration_interval_minutes * 60,
      },
    });
  }

  if (preferences.weekly_plan_reminder_enabled) {
    const { hour, minute } = parseTimeString(preferences.weekly_plan_reminder_time);
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_IDENTIFIERS.weeklyPlan,
      content: {
        title: 'Revisa tu plan semanal',
        body: 'Haz un repaso rápido del plan y ajusta lo que necesites.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        channelId: REMINDERS_CHANNEL_ID,
        weekday: weekdayToExpoNumber(preferences.weekly_plan_reminder_day),
        hour,
        minute,
      },
    });
  }

  return true;
}

export function hasEnabledNotificationPreferences(preferences: NotificationPreferences): boolean {
  return (
    preferences.meal_reminders_enabled ||
    preferences.hydration_reminders_enabled ||
    preferences.weekly_plan_reminder_enabled
  );
}

export async function syncLocalNotificationPreferencesFromServer(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const settings = normalizeAppSettings(await api.get<AppSettings>('/api/v1/me/settings'));
  return syncLocalNotificationPreferences(settings.notification_preferences);
}
