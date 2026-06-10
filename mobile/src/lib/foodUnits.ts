export type FoodUnit = 'g' | 'ml' | 'oz' | 'lb' | 'cup' | 'tbsp' | 'tsp' | 'unit';

interface FoodUnitMeta {
  key: FoodUnit;
  label: string;
  abbr: string;
  /** Fixed factor to convert 1 of this unit to grams. null for 'unit' (needs serving_size_g). */
  factor: number | null;
}

const FOOD_UNITS: readonly FoodUnitMeta[] = [
  { key: 'g', label: 'Gramos', abbr: 'g', factor: 1 },
  { key: 'ml', label: 'Mililitros', abbr: 'ml', factor: 1 },
  { key: 'oz', label: 'Onzas', abbr: 'oz', factor: 28.3495 },
  { key: 'lb', label: 'Libras', abbr: 'lb', factor: 453.592 },
  { key: 'cup', label: 'Tazas', abbr: 'taza', factor: 240 },
  { key: 'tbsp', label: 'Cucharadas', abbr: 'cda', factor: 15 },
  { key: 'tsp', label: 'Cucharaditas', abbr: 'cdta', factor: 5 },
  { key: 'unit', label: 'Unidades', abbr: 'ud', factor: null },
] as const;

const META_MAP = new Map<FoodUnit, FoodUnitMeta>(FOOD_UNITS.map((u) => [u.key, u]));

function resolveFactor(unit: FoodUnit, servingSizeG?: number): number {
  const meta = META_MAP.get(unit);
  if (!meta) return 1;
  if (meta.factor != null) return meta.factor;
  return servingSizeG && servingSizeG > 0 ? servingSizeG : 1;
}

export function toGrams(quantity: number, unit: FoodUnit, servingSizeG?: number): number {
  return Math.round(quantity * resolveFactor(unit, servingSizeG) * 10) / 10;
}

export function fromGrams(grams: number, unit: FoodUnit, servingSizeG?: number): number {
  const f = resolveFactor(unit, servingSizeG);
  if (f <= 0) return grams;
  return Math.round((grams / f) * 100) / 100;
}

export function unitLabel(unit: FoodUnit): string {
  return META_MAP.get(unit)?.label ?? unit;
}

export function unitAbbr(unit: FoodUnit): string {
  return META_MAP.get(unit)?.abbr ?? unit;
}

export function availableUnitsForFood(servingSizeG?: number): FoodUnit[] {
  const base: FoodUnit[] = ['g', 'ml', 'oz', 'lb', 'cup', 'tbsp', 'tsp'];
  if (servingSizeG && servingSizeG > 0) base.push('unit');
  return base;
}

export { FOOD_UNITS };
export type { FoodUnitMeta };
