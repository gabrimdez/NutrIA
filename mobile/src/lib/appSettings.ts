import type {
  AppSettings,
  IntegrationPreferences,
  IntegrationStatus,
  MealReminderTimes,
  NotificationPreferences,
  PlanGenerationPriority,
  PlanPreferences,
  PlanSummary,
  PlanVarietyLevel,
  ReminderWeekday,
} from '../types';

export const DEFAULT_PLAN_PREFERENCES: PlanPreferences = {
  meals_collapsed_by_default: true,
  hide_archived_plans: false,
  variety_level: 'balanced',
  generation_priority: 'performance',
};

export const DEFAULT_MEAL_REMINDER_TIMES: MealReminderTimes = {
  breakfast: '09:00',
  lunch: '13:30',
  snack: '17:00',
  dinner: '21:00',
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  meal_reminders_enabled: false,
  meal_reminder_times: { ...DEFAULT_MEAL_REMINDER_TIMES },
  hydration_reminders_enabled: false,
  hydration_interval_minutes: 120,
  weekly_plan_reminder_enabled: false,
  weekly_plan_reminder_day: 'sunday',
  weekly_plan_reminder_time: '18:00',
};

export const DEFAULT_INTEGRATION_PREFERENCES: IntegrationPreferences = {
  apple_health_enabled: false,
  google_fit_enabled: false,
  calendar_sync_enabled: false,
};

export const DEFAULT_INTEGRATION_STATUS: IntegrationStatus = {
  apple_health: 'disabled',
  google_fit: 'disabled',
  calendar: 'disabled',
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  plan_preferences: DEFAULT_PLAN_PREFERENCES,
  notification_preferences: DEFAULT_NOTIFICATION_PREFERENCES,
  integration_preferences: DEFAULT_INTEGRATION_PREFERENCES,
  integration_status: DEFAULT_INTEGRATION_STATUS,
};

export const PLAN_VARIETY_OPTIONS: { value: PlanVarietyLevel; label: string; hint: string }[] = [
  { value: 'routine', label: 'Rutina', hint: 'Más repetible y simple' },
  { value: 'balanced', label: 'Equilibrada', hint: 'Variedad sin caos' },
  { value: 'high', label: 'Alta', hint: 'Más platos distintos' },
];

export const PLAN_PRIORITY_OPTIONS: { value: PlanGenerationPriority; label: string; hint: string }[] = [
  { value: 'performance', label: 'Rendimiento', hint: 'Más foco deportivo' },
  { value: 'satiety', label: 'Saciedad', hint: 'Más llenador' },
  { value: 'budget', label: 'Presupuesto', hint: 'Compra más barata' },
  { value: 'speed', label: 'Rapidez', hint: 'Menos cocina' },
];

export const REMINDER_TIME_OPTIONS = ['08:00', '09:00', '13:30', '21:00'] as const;
export const HYDRATION_INTERVAL_OPTIONS = [60, 90, 120, 180] as const;
export const WEEKLY_REMINDER_TIME_OPTIONS = ['17:00', '18:00', '20:00'] as const;
export const WEEKDAY_OPTIONS: { value: ReminderWeekday; label: string }[] = [
  { value: 'monday', label: 'Lun' },
  { value: 'tuesday', label: 'Mar' },
  { value: 'wednesday', label: 'Mié' },
  { value: 'thursday', label: 'Jue' },
  { value: 'friday', label: 'Vie' },
  { value: 'saturday', label: 'Sáb' },
  { value: 'sunday', label: 'Dom' },
];

export function getVisiblePlanHistory<T extends Pick<PlanSummary, 'is_active'>>(plans: T[], hideArchived: boolean): T[] {
  if (!hideArchived) return plans;
  const activeOnly = plans.filter((plan) => plan.is_active);
  return activeOnly.length > 0 ? activeOnly : plans;
}

function normalizeNotificationPreferencesClient(raw?: Partial<NotificationPreferences> | null): NotificationPreferences {
  const n = (raw ?? {}) as Partial<NotificationPreferences> & { meal_reminder_time?: string };
  const { meal_reminder_time: _legacy, ...rest } = n;
  const mergedTimes: MealReminderTimes = {
    ...DEFAULT_MEAL_REMINDER_TIMES,
    ...(n.meal_reminder_times ?? {}),
  };
  if (!n.meal_reminder_times && typeof _legacy === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(_legacy)) {
    mergedTimes.breakfast = _legacy;
  }
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...rest,
    meal_reminder_times: mergedTimes,
  };
}

export function normalizeAppSettings(raw?: Partial<AppSettings> | null): AppSettings {
  return {
    plan_preferences: {
      ...DEFAULT_PLAN_PREFERENCES,
      ...(raw?.plan_preferences ?? {}),
    },
    notification_preferences: normalizeNotificationPreferencesClient(raw?.notification_preferences),
    integration_preferences: {
      ...DEFAULT_INTEGRATION_PREFERENCES,
      ...(raw?.integration_preferences ?? {}),
    },
    integration_status: {
      ...DEFAULT_INTEGRATION_STATUS,
      ...(raw?.integration_status ?? {}),
    },
  };
}

export function weekdayToExpoNumber(day: ReminderWeekday): number {
  switch (day) {
    case 'sunday':
      return 1;
    case 'monday':
      return 2;
    case 'tuesday':
      return 3;
    case 'wednesday':
      return 4;
    case 'thursday':
      return 5;
    case 'friday':
      return 6;
    case 'saturday':
      return 7;
    default:
      return 1;
  }
}

export function parseTimeString(time: string): { hour: number; minute: number } {
  const [hh, mm] = String(time || '').split(':');
  const hour = Number(hh);
  const minute = Number(mm);
  if (Number.isFinite(hour) && Number.isFinite(minute) && hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
    return { hour, minute };
  }
  return { hour: 9, minute: 0 };
}

/** Para selector de hora (DateTimePicker): hoy con esa hora/minuto. */
export function timeStringToTodayDate(time: string): Date {
  const { hour, minute } = parseTimeString(time);
  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function dateToTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Valida y normaliza "H:mm" o "HH:mm" → "HH:mm". */
export function normalizeTimeInput(s: string): string | null {
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
