import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ShoppingListItem } from '../types';

const prefix = '@nf_shop_checked_';

export function shoppingItemLocalKey(item: Pick<ShoppingListItem, 'food_name' | 'quantity'>): string {
  return `${item.food_name}\u001f${item.quantity}`;
}

export async function loadShoppingLocalChecks(planId: string): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(`${prefix}${planId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, boolean>;
    return {};
  } catch {
    return {};
  }
}

export async function saveShoppingLocalChecks(
  planId: string,
  map: Record<string, boolean>,
): Promise<void> {
  await AsyncStorage.setItem(`${prefix}${planId}`, JSON.stringify(map));
}
