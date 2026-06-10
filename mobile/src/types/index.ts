/** Cupos efectivos para Free. En Premium, GET /api/v1/me/profile devuelve `usage: null` porque el uso es ilimitado. */
export interface SubscriptionUsageSnapshot {
  /** Cupo NutriCoach: mes calendario UTC en Free. */
  chat_messages_limit: number;
  chat_messages_used: number;
  chat_messages_period: 'day' | 'month';
  vision_analyses_limit_per_month: number;
  vision_analyses_this_month: number;
  plan_regenerations_limit_per_week: number;
  plan_regenerations_this_week: number;
}

export interface Profile {
  user_id: string;
  display_name?: string;
  avatar_url?: string;
  sex?: 'male' | 'female';
  birth_year?: number;
  height_cm?: number;
  current_weight_kg?: number;
  onboarding_completed: boolean;
  subscription_tier?: 'free' | 'premium';
  usage?: SubscriptionUsageSnapshot | null;
}

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export interface ActiveGoal {
  activity_level: ActivityLevel;
  goal_type: string;
  training_days_per_week: number;
  training_type: string;
  target_weight_kg?: number | null;
}

export interface DailyTarget {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  steps_target?: number;
  rationale?: string;
}

/** Respuesta de `POST /api/v1/onboarding/complete` */
export interface OnboardingCompleteResponse {
  profile: Profile;
  daily_targets: DailyTarget;
  summary: string;
  active_goal: ActiveGoal;
}

export type PlanVarietyLevel = 'routine' | 'balanced' | 'high';
export type PlanGenerationPriority = 'performance' | 'satiety' | 'budget' | 'speed';
export type ReminderWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/**
 * Perfil multideporte (docs/nutria_especificacion_multideporte.md §2).
 * Claves en snake_case alineadas con el backend plan_preferences.sport_profile.
 */
export interface SportProfile {
  deporte_principal?: string;
  deportes_secundarios?: string;
  nivel?: string;
  objetivo_principal?: string;
  objetivo_salud_vs_competicion?: string;
  fase_si_aplica?: string;
  dias_entreno_semana?: number;
  horas_entreno_semana?: number;
  duracion_media_sesion_min?: number;
  experiencia_anos?: number;
  disponibilidad_preferida?: string;
  calendario_competicion?: string;
  modalidad_deporte?: string;
  restricciones_alimentarias?: string;
  suplementos_en_uso?: string;
  lesiones_o_limitaciones_actuales?: string;
  horas_sueno_promedio?: number;
  preferencias_seguimiento?: string;
}

export interface PlanPreferences {
  meals_collapsed_by_default: boolean;
  hide_archived_plans: boolean;
  variety_level: PlanVarietyLevel;
  generation_priority: PlanGenerationPriority;
  /** Opcional: contexto deportivo para NutriCoach (API /settings). */
  sport_profile?: SportProfile;
}

/** Horarios de recordatorio por tipo de comida (claves alineadas con meal_type del plan). */
export interface MealReminderTimes {
  breakfast: string;
  lunch: string;
  snack: string;
  dinner: string;
}

export interface NotificationPreferences {
  meal_reminders_enabled: boolean;
  meal_reminder_times: MealReminderTimes;
  hydration_reminders_enabled: boolean;
  hydration_interval_minutes: number;
  weekly_plan_reminder_enabled: boolean;
  weekly_plan_reminder_day: ReminderWeekday;
  weekly_plan_reminder_time: string;
}

export interface IntegrationPreferences {
  apple_health_enabled: boolean;
  google_fit_enabled: boolean;
  calendar_sync_enabled: boolean;
}

export type InjuryBodyZone =
  | 'cervical'
  | 'shoulder'
  | 'elbow'
  | 'wrist_hand'
  | 'thoracic'
  | 'lumbar'
  | 'hip'
  | 'knee'
  | 'ankle_foot'
  | 'other';

export type InjuryPhase =
  | 'acute'
  | 'rehab_only'
  | 'trainable_low_pain'
  | 'return_to_training';

export type InjuryGoal =
  | 'prioritize_recovery'
  | 'maintain_fitness'
  | 'maintain_strength'
  | 'return_to_performance';

export type Laterality = 'left' | 'right' | 'bilateral' | 'midline';

/** Alineado con backend InjuryProfile (camelCase API). */
export interface InjuryProfile {
  id?: string;
  bodyZone: InjuryBodyZone;
  laterality: Laterality;
  diagnosisLabel?: string;
  customBodyZoneLabel?: string;
  phase: InjuryPhase;
  goal: InjuryGoal;
  painAtRest?: number;
  painWithMovement?: number;
  excludeTags: string[];
  cautionTags?: string[];
  preferredTags?: string[];
  customAvoidMovements?: string[];
  notes?: string;
  redFlagsReported?: boolean;
}

export interface InjuriesData {
  active_injuries: InjuryProfile[];
}

export interface FoodRestrictions {
  allergies: string[];
  intolerances: string[];
  forbidden_foods: string[];
  disliked_foods: string[];
  dietary_preferences: string[];
}

export type IntegrationStatusValue =
  | 'disabled'
  | 'enabled_pending'
  | 'available_not_connected'
  | 'permission_denied'
  | 'connected'
  | 'sync_error';

export interface IntegrationStatus {
  apple_health: IntegrationStatusValue;
  google_fit: IntegrationStatusValue;
  calendar: IntegrationStatusValue;
  last_sync_at?: string;
  last_error?: string;
}

export interface AppSettings {
  plan_preferences: PlanPreferences;
  notification_preferences: NotificationPreferences;
  integration_preferences: IntegrationPreferences;
  integration_status: IntegrationStatus;
}

/** GET /api/v1/progress/activity */
export interface ActivityDayResponse {
  date: string;
  steps: number | null;
  training_type: string | null;
  training_duration_min: number | null;
  notes: string | null;
  estimated_burn_kcal: number | null;
}

/** POST /api/v1/progress/estimate-training */
export interface EstimateTrainingResponse {
  estimated_kcal: number;
  duration_min?: number | null;
  summary_es: string;
  confidence?: string | null;
}

export interface FoodItem {
  id?: string;
  name: string;
  name_es?: string;
  category?: string;
  provider: string;
  external_id?: string;
  barcode?: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g?: number;
  serving_size_g?: number;
  _brand?: string;
  _imageUrl?: string;
}

export interface MealItem {
  id?: string;
  food_catalog_id?: string;
  custom_name?: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Si es false, el alimento se muestra pero no suma al total del día. Por defecto true. */
  eaten?: boolean;
}

export interface MealEntry {
  id: string;
  user_id: string;
  date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  title?: string;
  photo_url?: string;
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  ai_confidence?: string;
  items: MealItem[];
  created_at: string;
}

export interface DayDiary {
  date: string;
  meals: MealEntry[];
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  target_kcal?: number;
  target_protein_g?: number;
  target_carbs_g?: number;
  target_fat_g?: number;
}

export interface PhotoAnalysisItem {
  detected_name: string;
  normalized_name: string;
  matched_food_id?: string;
  provider?: string;
  estimated_grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: string;
  assumptions: string[];
}

export interface PhotoAnalysis {
  meal_name: string;
  items: PhotoAnalysisItem[];
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  overall_confidence: string;
  notes: string[];
  photo_url?: string;
}

// --- Normalized nutrition model ---

export interface MacroBlock {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}

export interface ServingInfo {
  amount?: number;
  unit?: string;
  grams?: number;
}

export interface NutritionFoodItem {
  id?: string;
  source: 'fatsecret' | 'logmeal' | 'openfoodfacts' | 'generic' | 'groq';
  source_id?: string;
  type: 'generic' | 'branded' | 'packaged' | 'meal';
  name: string;
  normalized_name: string;
  brand?: string;
  barcode?: string;
  language?: string;
  image_url?: string;
  serving?: ServingInfo;
  per_100g?: MacroBlock;
  per_serving?: MacroBlock;
  confidence?: number;
  requires_confirmation: boolean;
  raw_summary?: string;
  metadata?: Record<string, unknown>;
}

export interface NutritionSearchResponse {
  results: NutritionFoodItem[];
  total: number;
  query: string;
  normalized_query: string;
}

export interface NutritionBarcodeResponse {
  found: boolean;
  item?: NutritionFoodItem;
  message?: string;
}

export interface NutritionPhotoCandidate {
  name: string;
  normalized_name: string;
  estimated_grams: number;
  confidence: number;
  per_100g?: MacroBlock;
  per_serving?: MacroBlock;
  source: string;
  source_id?: string;
  requires_confirmation: boolean;
  image_url?: string;
}

export interface NutritionPhotoResponse {
  candidates: NutritionPhotoCandidate[];
  overall_confidence: number;
  source: string;
  notes: string[];
}

// --- Plan types ---

export interface PlanFood {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface PlanMeal {
  id?: string;
  meal_type: string;
  title: string;
  foods: PlanFood[];
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
}

export interface PlanDay {
  /** UUID del día en el plan (necesario para reordenar comidas). */
  id?: string;
  day_number: number;
  day_label: string;
  meals: PlanMeal[];
}

export interface DietPlan {
  id: string;
  version: number;
  is_active: boolean;
  target_kcal: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  rationale?: string;
  caveats: string[];
  days: PlanDay[];
  created_at: string;
  label?: string;
  user_notes?: string;
}

/** Lista en /api/v1/plans/history */
export interface PlanSummary {
  id: string;
  version: number;
  is_active: boolean;
  target_kcal: number;
  target_protein_g?: number;
  created_at: string;
  rationale_preview?: string | null;
  label?: string;
}

export interface ShoppingListItem {
  /** Presente si la lista viene de BD; si falta, marcas solo en el dispositivo. */
  id?: string | null;
  food_name: string;
  quantity: string;
  category?: string;
  checked: boolean;
}

export interface ShoppingList {
  id: string;
  plan_id?: string;
  name: string;
  items: ShoppingListItem[];
}

// --- Training plan types (from AI chat) ---

export interface TrainingExercise {
  name: string;
  sets: number;
  reps: string;
}

export interface TrainingDay {
  name: string;
  exercises: TrainingExercise[];
}

export interface TrainingPlan {
  /** Por defecto entrenamiento si el backend no envía `kind` (compat). */
  kind?: 'training' | 'rehab';
  name: string;
  split: string;
  focus_note: string;
  disclaimer: string;
  days: TrainingDay[];
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
  /** Solo cliente: vista previa local al enviar una imagen al chat. */
  local_image_uri?: string;
  /** Solo cliente: el mensaje falló al enviarse. */
  failed?: boolean;
  /** Solo cliente: payload original para reintentar. */
  failedPayload?: { message: string; imageBase64?: string; mimeType?: string };
}

export interface ChatSession {
  id: string;
  title?: string;
  created_at: string;
  updated_at: string;
}

export interface WeightLog {
  id: string;
  weight_kg: number;
  date: string;
  /** ISO; desempate cuando hay varios registros el mismo día. */
  created_at?: string;
  notes?: string;
}

export interface SavedMealItem {
  id: string;
  food_catalog_id?: string;
  custom_name?: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface SavedMeal {
  id: string;
  name: string;
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  items: SavedMealItem[];
  created_at: string;
}

export interface CustomFood {
  id: string;
  name: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  icon?: string;
  created_at: string;
}

export interface RecipeItem {
  id: string;
  food_catalog_id?: string;
  custom_name?: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  servings: number;
  total_weight_g: number;
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  icon?: string;
  items: RecipeItem[];
  created_at: string;
}

export interface RecipeRecommendationItem {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export type RecipeRecommendationMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface RecipeRecommendation {
  name: string;
  icon?: string;
  description?: string;
  servings: number;
  prep_time_min?: number;
  difficulty?: string;
  tags: string[];
  meal_type?: RecipeRecommendationMealType;
  items: RecipeRecommendationItem[];
  total_weight_g: number;
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  instructions: string[];
}

export interface RecipeRecommendationsRequest {
  meal_type?: RecipeRecommendationMealType;
  max_prep_time_min?: number;
  max_kcal_per_serving?: number;
  tags?: string[];
  count?: number;
  /** Texto libre: ingredientes, estilo o condiciones extra para la IA. */
  additional_request?: string;
}

export interface RecipeRecommendationsResponse {
  recommendations: RecipeRecommendation[];
}

export type RecipeRestrictionConflictType =
  | 'allergy'
  | 'intolerance'
  | 'forbidden'
  | 'disliked';

export interface FoodRestrictionConflict {
  mentioned_food: string;
  matched_restriction: string;
  restriction_type: RecipeRestrictionConflictType;
  explanation: string;
  alternatives: string[];
}

export interface CheckRestrictionsResponse {
  has_conflicts: boolean;
  conflicts: FoodRestrictionConflict[];
  llm_unavailable?: boolean;
}

export interface ProgressSummary {
  current_weight_kg?: number;
  weight_trend: WeightLog[];
  avg_daily_kcal_7d?: number;
  avg_daily_protein_7d?: number;
  adherence_percentage_7d?: number;
  days_logged_7d: number;
  total_meals_7d: number;
  nutrition_streak_days?: number;
}
