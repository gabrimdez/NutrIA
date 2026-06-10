export type WearableProviderId =
  | 'apple_health'
  | 'android_health_connect'
  | 'xiaomi_mi_fitness'
  | 'garmin'
  | 'other_device';

/**
 * Valor de `training_type` en POST /progress/activity cuando el log proviene solo de sync
 * HealthKit / Health Connect. El inicio usa esto para no sumar kcal de pasos + energía activa duplicada.
 * Debe caber en VARCHAR(50) del backend.
 */
export const WEARABLE_SYNC_ACTIVITY_TRAINING_TYPE = 'wearable_health_sync';

/** Origen de los datos persistidos en snapshot (obligatorio al guardar lecturas reales o mock de desarrollo). */
export type ActivityDataSource = 'healthkit' | 'health_connect' | 'dev_mock';

/** Estados de conexión / UI (sin “conectado” falso). */
export type WearableConnectionState =
  | 'not_connected'
  | 'unavailable'
  | 'connecting'
  | 'connected'
  | 'permission_denied'
  | 'sync_error'
  | 'disconnected'
  | 'dev_mock';

/** Snapshot de actividad: solo persistir con `source` real o `dev_mock` si mocks de desarrollo explícitos. */
export interface ActivityData {
  steps: number | null;
  distanceMeters: number | null;
  calories: number | null;
  activeMinutes: number | null;
  heartRateBpm: number | null;
  sleepHours: number | null;
  workouts: number | null;
  /** iOS HealthKit: kcal totales de entrenos del día (suma de workouts). */
  workoutKcal: number | null;
  /** iOS HealthKit: duración total de entrenos del día en minutos. */
  workoutDurationMin: number | null;
  lastSyncAt: string;
  provider: WearableProviderId;
  source?: ActivityDataSource;
}

export function emptyActivityData(provider: WearableProviderId, lastSyncAt: string): ActivityData {
  return {
    steps: null,
    distanceMeters: null,
    calories: null,
    activeMinutes: null,
    heartRateBpm: null,
    sleepHours: null,
    workouts: null,
    workoutKcal: null,
    workoutDurationMin: null,
    lastSyncAt,
    provider,
  };
}
