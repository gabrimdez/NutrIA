/**
 * Debe coincidir con los valores por defecto del backend (Settings en config.py).
 * El consumo real lo marca la API; GET /api/v1/me/profile devuelve `usage` con límites efectivos.
 */
export const SUBSCRIPTION_LIMITS = {
  /** Plan Free: mensajes NutriCoach + texto→comida (mes calendario UTC). */
  freeChatUserMessagesPerMonth: 10,
  freeVisionAnalysesPerMonth: 1,
  freePlanRegenerationsPerWeek: 1,
  /** Plan Free: sugerencias de recetas con IA (día calendario UTC; ver config del backend). */
  freeRecipeRecommendationsPerDay: 12,
} as const;
