import type { BadgeCatalogItem } from '../types/badges';

/** Orden fijo catálogo: común → rara → épica → legendaria; empate solo por `badge_id`. */
const RARITY_ORDER: Record<string, number> = {
  comun: 0,
  rara: 1,
  epica: 2,
  legendaria: 3,
};

export function compareBadgesByRarityOnly(a: BadgeCatalogItem, b: BadgeCatalogItem): number {
  const da = RARITY_ORDER[a.rarity] ?? 99;
  const db = RARITY_ORDER[b.rarity] ?? 99;
  if (da !== db) return da - db;
  return a.badge_id.localeCompare(b.badge_id);
}

export function sortBadgesByRarityOnly(items: BadgeCatalogItem[]): BadgeCatalogItem[] {
  return [...items].sort(compareBadgesByRarityOnly);
}
