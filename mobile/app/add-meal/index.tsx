import { Redirect, useLocalSearchParams } from 'expo-router';
import { parseMealTypeParam } from '../../src/lib/mealDisplay';
import { resolvedDiaryYmd } from '../../src/lib/diaryDate';

/** Punto de entrada `/add-meal`: redirige al tab de búsqueda. */
export default function AddMealIndexRedirect() {
  const { meal_type: mealTypeParam, date: dateParam } = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
  }>();
  const mealType = parseMealTypeParam(mealTypeParam);
  const diaryDate = resolvedDiaryYmd(dateParam);
  const q = new URLSearchParams({ meal_type: mealType, date: diaryDate }).toString();
  return <Redirect href={`/(tabs)/search?${q}` as never} />;
}
