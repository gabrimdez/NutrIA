import { areWearableMocksEnabled } from './wearableActivityPolicy';
import type { ActivityData, WearableProviderId } from './wearableActivityTypes';
import { emptyActivityData } from './wearableActivityTypes';

/**
 * Datos deterministas SOLO desarrollo, con `source: dev_mock`.
 * En producción nunca se llama (el caller debe comprobar areWearableMocksEnabled()).
 */
export function buildMockActivityData(provider: WearableProviderId): ActivityData {
  if (!areWearableMocksEnabled()) {
    throw new Error('buildMockActivityData: mocks desactivados (solo __DEV__ + EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS=true).');
  }
  const now = new Date().toISOString();
  const base = emptyActivityData(provider, now);
  const withSource = { ...base, source: 'dev_mock' as const };
  switch (provider) {
    case 'xiaomi_mi_fitness':
      return {
        ...withSource,
        steps: 6_234,
        distanceMeters: 4_820,
        calories: 248,
        activeMinutes: 44,
        heartRateBpm: 71,
        sleepHours: 6.9,
        workouts: 1,
        workoutKcal: 210,
        workoutDurationMin: 38,
      };
    case 'garmin':
      return {
        ...withSource,
        steps: 10_120,
        distanceMeters: 7_900,
        calories: 412,
        activeMinutes: 78,
        heartRateBpm: 68,
        sleepHours: 7.5,
        workouts: 2,
        workoutKcal: 340,
        workoutDurationMin: 95,
      };
    case 'other_device':
      return {
        ...withSource,
        steps: 4_001,
        distanceMeters: 2_900,
        calories: 160,
        activeMinutes: 30,
        heartRateBpm: 74,
        sleepHours: null,
        workouts: 0,
        workoutKcal: null,
        workoutDurationMin: null,
      };
    case 'apple_health':
      return {
        ...withSource,
        steps: 5_000,
        distanceMeters: 3_600,
        calories: 200,
        activeMinutes: 35,
        heartRateBpm: 70,
        sleepHours: 7,
        workouts: 1,
        workoutKcal: 180,
        workoutDurationMin: 42,
      };
    case 'android_health_connect':
      return {
        ...withSource,
        steps: 5_000,
        distanceMeters: 3_600,
        calories: 200,
        activeMinutes: 35,
        heartRateBpm: 70,
        sleepHours: 7,
        workouts: 1,
        workoutKcal: null,
        workoutDurationMin: null,
      };
    default:
      return withSource;
  }
}
