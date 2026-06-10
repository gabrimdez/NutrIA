/** kcal aproximadas desde macros (4/4/9 por gramo). */
export function kcalFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return Math.round((4 * proteinG + 4 * carbsG + 9 * fatG) * 10) / 10;
}

/** Gramos de P/C/G a 1 decimal (evita basura float en UI y al guardar). */
export function roundMacroG(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

/** Texto estable para inputs de macros (1 decimal; enteros sin “.0”). */
export function formatMacroGForInput(n: number): string {
  if (!Number.isFinite(n)) return '';
  const r = roundMacroG(n);
  if (Math.abs(r - Math.round(r)) < 1e-6) return String(Math.round(r));
  return r.toFixed(1);
}

export type Per100g = {
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
};

export function macrosFromPer100g(grams: number, per: Per100g) {
  const f = grams / 100;
  return {
    grams,
    kcal: Math.round(per.kcal_per_100g * f * 10) / 10,
    protein_g: Math.round(per.protein_per_100g * f * 10) / 10,
    carbs_g: Math.round(per.carbs_per_100g * f * 10) / 10,
    fat_g: Math.round(per.fat_per_100g * f * 10) / 10,
  };
}

/** Escala P/C/G/kcal proporcionalmente al cambiar gramos. */
export function scaleMacrosToGrams(
  prevGrams: number,
  nextGrams: number,
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
) {
  if (prevGrams <= 0) {
    return { kcal, protein_g: proteinG, carbs_g: carbsG, fat_g: fatG, grams: nextGrams };
  }
  const r = nextGrams / prevGrams;
  return {
    grams: nextGrams,
    kcal: Math.round(kcal * r * 10) / 10,
    protein_g: Math.round(proteinG * r * 10) / 10,
    carbs_g: Math.round(carbsG * r * 10) / 10,
    fat_g: Math.round(fatG * r * 10) / 10,
  };
}
