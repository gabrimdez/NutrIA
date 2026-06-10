/** Estimación kcal desde pasos (sin lectura nativa). */
export const STEPS_KCAL_PER_STEP = 0.04;

export function estimateStepsKcal(steps: number): number {
  return Math.max(0, Math.round(steps * STEPS_KCAL_PER_STEP));
}

/**
 * Kcal para UI/sync: energía activa del sistema si existe; si no, estimación por pasos.
 * No inventa: si ambos faltan → null.
 */
export function pickResolvedActivityKcal(activeEnergyKcal: number | null, steps: number | null): number | null {
  if (activeEnergyKcal != null && Number.isFinite(activeEnergyKcal) && activeEnergyKcal >= 0) {
    return Math.round(activeEnergyKcal);
  }
  if (steps != null && Number.isFinite(steps) && steps >= 0) {
    return estimateStepsKcal(Math.round(steps));
  }
  return null;
}
