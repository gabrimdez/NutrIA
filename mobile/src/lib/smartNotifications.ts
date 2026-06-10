/**
 * Smart notifications: evaluate user data and schedule/cancel
 * local notifications based on actual intake vs thresholds.
 */
import { Platform } from 'react-native';
import { api } from './api';
import { normalizeAppSettings } from './appSettings';
import { hasEnabledNotificationPreferences, requestNotificationPermissionsIfNeeded } from './notificationSettings';
import type { AppSettings } from '../types';

export interface SmartNotificationConfig {
  /** Min glasses of water before triggering low-water notification (default: 4) */
  waterMinGlasses: number;
  /** Hour after which to check water intake (default: 15 = 3pm) */
  waterCheckAfterHour: number;
  /** Hour after which to stop sending notifications (default: 22) */
  quietHourStart: number;
  /** Hour before which to not send notifications (default: 8) */
  quietHourEnd: number;
  /** Max notifications per day for water (default: 2) */
  waterMaxPerDay: number;
  /** Hours without any meal logged to trigger reminder (default: 5) */
  mealGapHours: number;
  /** Minimum meals expected by time of day: [{hour, minMeals}] */
  mealCheckpoints: Array<{ hour: number; minMeals: number }>;
}

export const DEFAULT_SMART_CONFIG: SmartNotificationConfig = {
  waterMinGlasses: 4,
  waterCheckAfterHour: 15,
  quietHourStart: 22,
  quietHourEnd: 8,
  waterMaxPerDay: 2,
  mealGapHours: 5,
  mealCheckpoints: [
    { hour: 11, minMeals: 1 },
    { hour: 15, minMeals: 2 },
    { hour: 21, minMeals: 3 },
  ],
};

const SMART_WATER_TAG = 'smart_water';
const SMART_MEAL_TAG = 'smart_meal';

interface WaterProgress {
  glasses: number;
}

interface DiaryDay {
  meals: Array<{ id: string }>;
}

function isQuietHour(config: SmartNotificationConfig): boolean {
  const hour = new Date().getHours();
  return hour >= config.quietHourStart || hour < config.quietHourEnd;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

async function getWaterToday(): Promise<number> {
  try {
    const data = await api.get<WaterProgress>(`/api/v1/progress/water?date=${todayStr()}`);
    return data?.glasses ?? 0;
  } catch {
    return 0;
  }
}

async function getMealsToday(): Promise<number> {
  try {
    const data = await api.get<DiaryDay>(`/api/v1/diary/day?date=${todayStr()}`);
    return data?.meals?.length ?? 0;
  } catch {
    return 0;
  }
}

async function userAllowsNotifications(): Promise<boolean> {
  try {
    const settings = normalizeAppSettings(await api.get<AppSettings>('/api/v1/me/settings'));
    return hasEnabledNotificationPreferences(settings.notification_preferences);
  } catch {
    return false;
  }
}

async function cancelSmartNotifications(tag: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const Notifications = await import('expo-notifications');
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data as { tag?: string })?.tag === tag) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

const WATER_MESSAGES = [
  { title: 'Bebe agua', body: 'Llevas pocos vasos hoy. Un vaso ahora te acerca a tu objetivo.' },
  { title: 'Hidratación baja', body: 'Recuerda beber agua regularmente. Tu cuerpo lo agradece.' },
];

const MEAL_MESSAGES = [
  { title: 'No olvides registrar', body: 'Aún no has registrado ninguna comida hoy. ¿Has comido algo?' },
  { title: 'Registra tu comida', body: 'Llevar el registro te ayuda a cumplir tus objetivos.' },
];

export async function evaluateAndScheduleSmartNotifications(
  config: SmartNotificationConfig = DEFAULT_SMART_CONFIG,
): Promise<{ waterScheduled: boolean; mealScheduled: boolean }> {
  if (Platform.OS === 'web') return { waterScheduled: false, mealScheduled: false };
  if (isQuietHour(config)) return { waterScheduled: false, mealScheduled: false };
  if (!(await userAllowsNotifications())) return { waterScheduled: false, mealScheduled: false };

  const hasPermission = await requestNotificationPermissionsIfNeeded();
  if (!hasPermission) return { waterScheduled: false, mealScheduled: false };

  let waterScheduled = false;
  let mealScheduled = false;

  const currentHour = new Date().getHours();

  if (currentHour >= config.waterCheckAfterHour) {
    const glasses = await getWaterToday();
    if (glasses < config.waterMinGlasses) {
      await cancelSmartNotifications(SMART_WATER_TAG);
      const msg = WATER_MESSAGES[Math.floor(Math.random() * WATER_MESSAGES.length)];
      const Notifications = await import('expo-notifications');
      await Notifications.scheduleNotificationAsync({
        content: {
          title: msg.title,
          body: msg.body,
          data: { tag: SMART_WATER_TAG },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          repeats: false,
        },
      });
      waterScheduled = true;
    }
  }

  const mealsToday = await getMealsToday();
  const checkpoint = config.mealCheckpoints
    .filter((cp) => currentHour >= cp.hour)
    .sort((a, b) => b.hour - a.hour)[0];

  if (checkpoint && mealsToday < checkpoint.minMeals) {
    await cancelSmartNotifications(SMART_MEAL_TAG);
    const msg = MEAL_MESSAGES[Math.floor(Math.random() * MEAL_MESSAGES.length)];
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: msg.title,
        body: msg.body,
        data: { tag: SMART_MEAL_TAG },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 5,
        repeats: false,
      },
    });
    mealScheduled = true;
  }

  return { waterScheduled, mealScheduled };
}
