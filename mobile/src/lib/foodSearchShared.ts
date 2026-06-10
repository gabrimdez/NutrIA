import type { FoodItem, MealEntry, MealItem, NutritionFoodItem } from '../types';
import { mealItemEmoji } from './mealDisplay';
import { kcalFromMacros, roundMacroG } from './mealItemMath';

export type FoodPreviewSheet =
  | { mode: 'diary_food'; mealItem: MealItem }
  | { mode: 'diary_meal'; meal: MealEntry }
  | { mode: 'catalog'; food: FoodItem };

export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
  snack: 'Snack',
};

export function searchErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Algo salio mal. Intentalo de nuevo.';
}

export function foodEmoji(name: string): string {
  return mealItemEmoji(name);
}

export function formatServingDisplay(food: FoodItem): string {
  if (food.serving_size_g) {
    return `1 racion (${food.serving_size_g} g)`;
  }
  return '100 g';
}

export function lineMealItemFromDiaryItem(si: MealItem): MealItem {
  const grams = Math.max(0, Math.round(si.grams));
  const protein = roundMacroG(si.protein_g);
  const carbs = roundMacroG(si.carbs_g);
  const fat = roundMacroG(si.fat_g);
  return {
    ...(si.food_catalog_id ? { food_catalog_id: si.food_catalog_id } : {}),
    custom_name: si.custom_name ?? 'Alimento',
    grams,
    kcal: kcalFromMacros(protein, carbs, fat),
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
  };
}

export function mapNutritionFoodToFoodItem(item: NutritionFoodItem): FoodItem {
  return {
    id: item.id ?? undefined,
    name: item.name,
    name_es: item.language === 'es' ? item.name : undefined,
    category: item.metadata?.category as string | undefined,
    provider: item.source,
    external_id: item.source_id ?? undefined,
    barcode: item.barcode ?? undefined,
    kcal_per_100g: item.per_100g?.calories ?? 0,
    protein_per_100g: item.per_100g?.protein ?? 0,
    carbs_per_100g: item.per_100g?.carbs ?? 0,
    fat_per_100g: item.per_100g?.fat ?? 0,
    fiber_per_100g: item.per_100g?.fiber ?? undefined,
    serving_size_g: item.serving?.grams ?? undefined,
    _brand: item.brand,
    _imageUrl: item.image_url,
  };
}
