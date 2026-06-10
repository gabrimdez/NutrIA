export type WorkoutCategory = 'gym' | 'other';

// ---------------------------------------------------------------------------
// Routine (template)
// ---------------------------------------------------------------------------

export interface RoutineExercise {
  id?: string;
  name: string;
  display_order: number;
  default_sets?: number | null;
  default_reps?: string | null;
  notes?: string | null;
}

export interface RoutineDay {
  id?: string;
  weekday: number;
  label: string;
  display_order: number;
  exercises: RoutineExercise[];
}

export interface WorkoutRoutine {
  id: string;
  name: string;
  category: WorkoutCategory;
  sport_type?: string | null;
  is_active: boolean;
  days_per_week: number;
  days: RoutineDay[];
  created_at: string;
  updated_at?: string | null;
}

export interface WorkoutRoutineListItem {
  id: string;
  name: string;
  category: WorkoutCategory;
  sport_type?: string | null;
  is_active: boolean;
  days_per_week: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Session (logged workout)
// ---------------------------------------------------------------------------

export interface ExerciseSet {
  id?: string;
  set_number: number;
  reps?: number | null;
  weight_kg?: number | null;
  notes?: string | null;
}

export interface SessionExercise {
  id?: string;
  name: string;
  display_order: number;
  notes?: string | null;
  sets: ExerciseSet[];
}

export interface WorkoutSession {
  id: string;
  routine_id?: string | null;
  routine_day_id?: string | null;
  category: WorkoutCategory;
  date: string;
  weekday: number;
  day_label?: string | null;
  sport_type?: string | null;
  free_text?: string | null;
  completed: boolean;
  notes?: string | null;
  exercises: SessionExercise[];
  created_at: string;
  updated_at?: string | null;
}

export interface PreviousSessionTemplate {
  source_session_id: string;
  source_date: string;
  day_label?: string | null;
  sport_type?: string | null;
  notes?: string | null;
  exercises: SessionExercise[];
}

export interface WorkoutSessionListItem {
  id: string;
  category: WorkoutCategory;
  date: string;
  weekday: number;
  day_label?: string | null;
  sport_type?: string | null;
  completed: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Exercise history (chart)
// ---------------------------------------------------------------------------

export interface ExerciseHistorySet {
  set_number: number;
  reps?: number | null;
  weight_kg?: number | null;
}

export interface ExerciseHistoryPoint {
  date: string;
  day_label?: string | null;
  display_order?: number | null;
  max_weight_kg?: number | null;
  total_volume?: number | null;
  best_set_reps?: number | null;
  sets_count: number;
  sets: ExerciseHistorySet[];
}

// ---------------------------------------------------------------------------
// Week summary
// ---------------------------------------------------------------------------

export interface WorkoutWeekDayObjective {
  routine_id: string;
  routine_name: string;
  routine_day_id: string;
  day_label: string;
  category: WorkoutCategory;
  sport_type?: string | null;
  weekday: number;
  completed: boolean;
  session_id?: string | null;
}

export interface WorkoutWeekDayPlan {
  weekday: number;
  date: string;
  total: number;
  completed_count: number;
  is_complete: boolean;
  objectives: WorkoutWeekDayObjective[];
}

export interface WorkoutWeekSummary {
  week_start: string;
  /** Nº de días de la semana con al menos un objetivo planificado. */
  planned_days: number;
  /** Nº de días con TODOS sus objetivos completados. */
  completed_days: number;
  sessions: WorkoutSessionListItem[];
  days?: WorkoutWeekDayPlan[];
}

// ---------------------------------------------------------------------------
// Create / Update payloads
// ---------------------------------------------------------------------------

export interface RoutineExerciseInput {
  name: string;
  display_order?: number;
  default_sets?: number | null;
  default_reps?: string | null;
  notes?: string | null;
}

export interface RoutineDayInput {
  weekday: number;
  label: string;
  display_order?: number;
  exercises?: RoutineExerciseInput[];
}

export interface RoutineCreatePayload {
  name: string;
  category: WorkoutCategory;
  sport_type?: string | null;
  days_per_week?: number;
  days?: RoutineDayInput[];
}

export interface RoutineUpdatePayload {
  name?: string;
  sport_type?: string | null;
  days_per_week?: number;
  days?: RoutineDayInput[];
}

export interface ExerciseSetInput {
  set_number: number;
  reps?: number | null;
  weight_kg?: number | null;
  notes?: string | null;
}

export interface SessionExerciseInput {
  name: string;
  display_order?: number;
  notes?: string | null;
  sets?: ExerciseSetInput[];
}

export interface SessionCreatePayload {
  routine_id?: string | null;
  routine_day_id?: string | null;
  category: WorkoutCategory;
  date: string;
  weekday: number;
  day_label?: string | null;
  sport_type?: string | null;
  free_text?: string | null;
  completed?: boolean;
  notes?: string | null;
  exercises?: SessionExerciseInput[];
}

export interface SessionUpdatePayload {
  day_label?: string | null;
  sport_type?: string | null;
  free_text?: string | null;
  completed?: boolean;
  notes?: string | null;
  exercises?: SessionExerciseInput[];
}

export interface QuickCompleteRoutinePayload {
  routine_id: string;
  routine_day_id?: string | null;
  date?: string | null;
  notes?: string | null;
}

export interface QuickCompleteOtherPayload {
  routine_id?: string | null;
  sport_type?: string | null;
  duration_min?: number | null;
  free_text?: string | null;
  notes?: string | null;
  date?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
export const WEEKDAY_LABELS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
