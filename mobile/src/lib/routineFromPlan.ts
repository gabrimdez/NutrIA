import { TrainingPlan } from '../types';
import type { RoutineCreatePayload, RoutineDayInput, RoutineExerciseInput } from '../types/workout';

const MAX_NAME = 200;
const MAX_LABEL = 100;
const MAX_REPS = 50;
const MIN_SETS = 1;
const MAX_SETS = 30;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function trainingPlanToRoutinePayload(plan: TrainingPlan): RoutineCreatePayload {
  const days: RoutineDayInput[] = plan.days.map((day, i) => {
    const exercises: RoutineExerciseInput[] = day.exercises.map((ex, j) => {
      const sets =
        typeof ex.sets === 'number' && Number.isFinite(ex.sets)
          ? clampInt(ex.sets, MIN_SETS, MAX_SETS)
          : undefined;
      const reps = (ex.reps ?? '').trim();
      return {
        name: truncate(ex.name.trim() || 'Ejercicio', MAX_NAME),
        display_order: j,
        default_sets: sets,
        default_reps: reps ? truncate(reps, MAX_REPS) : undefined,
      };
    });
    return {
      weekday: i % 7,
      label: truncate((day.name ?? '').trim() || `Día ${i + 1}`, MAX_LABEL),
      display_order: i,
      exercises,
    };
  });

  return {
    name: truncate((plan.name ?? '').trim() || 'Rutina sugerida', MAX_NAME),
    category: 'gym',
    days_per_week: days.length,
    days,
  };
}
