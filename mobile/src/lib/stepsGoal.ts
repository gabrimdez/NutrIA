/** Metas rápidas alineadas con el selector del inicio (BottomSheet). */
export const STEPS_GOAL_PRESETS = [5000, 8000, 10_000, 12_000, 15_000] as const;

export const STEPS_TARGET_MIN = 1000;
export const STEPS_TARGET_MAX = 50_000;

export function parseStepsTargetInput(s: string): number | null {
  const digits = s.replace(/[^\d]/g, '').trim();
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

export function isStepsTargetInValidRange(n: number | null): boolean {
  return n != null && n >= STEPS_TARGET_MIN && n <= STEPS_TARGET_MAX;
}
