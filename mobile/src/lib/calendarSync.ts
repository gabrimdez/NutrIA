import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import type { DietPlan, PlanMeal } from '../types';

const CALENDAR_TITLE = 'NutrIA - Plan semanal';
const EVENT_SOURCE_TAG = 'nutria_plan';

async function getOrCreateCalendar(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') return null;

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((c) => c.title === CALENDAR_TITLE);
  if (existing) return existing.id;

  const defaultSource =
    Platform.OS === 'ios'
      ? calendars.find((c) => c.source?.isLocalAccount)?.source
      : { isLocalAccount: true, name: 'NutrIA', type: Calendar.CalendarType.LOCAL as string }; // Android

  if (!defaultSource) return null;

  const newId = await Calendar.createCalendarAsync({
    title: CALENDAR_TITLE,
    color: '#10B981',
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: (defaultSource as any).id,
    source: defaultSource as any,
    name: 'nutria-plan',
    ownerAccount: 'NutrIA',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
  return newId;
}

function mealTimeHint(mealType: string): { hour: number; durationMinutes: number } {
  switch (mealType) {
    case 'breakfast': return { hour: 8, durationMinutes: 30 };
    case 'lunch':     return { hour: 13, durationMinutes: 45 };
    case 'dinner':    return { hour: 21, durationMinutes: 45 };
    case 'snack':     return { hour: 17, durationMinutes: 15 };
    default:          return { hour: 12, durationMinutes: 30 };
  }
}

function mealCalendarTitle(meal: PlanMeal): string {
  return `${meal.title} · ${meal.total_kcal} kcal · P${meal.total_protein_g}g C${meal.total_carbs_g}g G${meal.total_fat_g}g`;
}

function getWeekStartDate(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export async function exportPlanToCalendar(
  plan: DietPlan,
): Promise<{ success: boolean; eventsCreated: number; error?: string }> {
  try {
    const calId = await getOrCreateCalendar();
    if (!calId) {
      return { success: false, eventsCreated: 0, error: 'No se pudo acceder al calendario. Revisa los permisos.' };
    }

    const weekStart = getWeekStartDate();
    let eventsCreated = 0;

    for (const day of plan.days) {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + (day.day_number - 1));

      for (const meal of day.meals) {
        const { hour, durationMinutes } = mealTimeHint(meal.meal_type);
        const startDate = new Date(dayDate);
        startDate.setHours(hour, 0, 0, 0);
        const endDate = new Date(startDate);
        endDate.setMinutes(startDate.getMinutes() + durationMinutes);

        const foodNames = meal.foods.map((f) => `${f.name} (${f.grams}g)`).join(', ');
        const notes = foodNames
          ? `${foodNames}\n\n[${EVENT_SOURCE_TAG}:${plan.id}]`
          : `[${EVENT_SOURCE_TAG}:${plan.id}]`;

        await Calendar.createEventAsync(calId, {
          title: mealCalendarTitle(meal),
          startDate,
          endDate,
          notes,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          alarms: [],
        });
        eventsCreated++;
      }
    }

    return { success: true, eventsCreated };
  } catch (e) {
    return {
      success: false,
      eventsCreated: 0,
      error: e instanceof Error ? e.message : 'Error al exportar al calendario.',
    };
  }
}

export async function removeCalendarEvents(planId: string): Promise<number> {
  try {
    const calId = await getOrCreateCalendar();
    if (!calId) return 0;

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 14);
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 30);

    const events = await Calendar.getEventsAsync([calId], startDate, endDate);
    let removed = 0;
    for (const event of events) {
      if (event.notes?.includes(`[${EVENT_SOURCE_TAG}:${planId}]`)) {
        await Calendar.deleteEventAsync(event.id);
        removed++;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

export async function hasCalendarPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return status === 'granted';
}

export async function requestCalendarPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}
