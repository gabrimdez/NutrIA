import { NativeModules, Platform } from 'react-native';

/**
 * Updates the home screen widget with the remaining calories for the day.
 * Call this after any diary mutation (add/remove/edit meal).
 */
export function updateWidget(caloriesLeft: number): void {
  if (Platform.OS === 'web') return;
  const { NutrIAWidgetUpdater } = NativeModules;
  if (!NutrIAWidgetUpdater) return;
  NutrIAWidgetUpdater.updateCalories(Math.round(caloriesLeft));
}
