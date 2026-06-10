import { showPremiumLock } from './premiumLock';

/** 403 de `require_chat_turn` (NutriCoach o parse-text de comida). */
export function isNutriCoachTurnLimitErrorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('nutricoach') && (m.includes('límite') || m.includes('limite'));
}

/** Compatibilidad con mensajes antiguos; Premium ya no tiene cupo de producto. */
export function isNutriCoachDailyLimitErrorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('diario') && m.includes('nutricoach');
}

const PARSE_TEXT_PREMIUM_COPY = {
  featureName: '“Analiza tu comida” (texto con IA)',
  title: 'Analizar con IA es una función Premium',
  message:
    'Escribir lo que comiste y que la IA calcule calorías y macros usa NutriCoach. Con NutrIA Premium lo tienes ilimitado junto al resto de la app.',
} as const;

export function showParseTextPremiumLock() {
  showPremiumLock({ ...PARSE_TEXT_PREMIUM_COPY });
}

const TRAINING_BURN_IA_PREMIUM_COPY = {
  featureName: 'la estimación de calorías del entreno (IA)',
  title: 'Calorías del entreno con IA es Premium',
  message:
    'Describir el entreno y que la IA estime calorías quemadas es Premium. Suscríbete para usarlo sin cupos junto al resto de funciones IA.',
} as const;

export function showTrainingBurnPremiumLock() {
  showPremiumLock({ ...TRAINING_BURN_IA_PREMIUM_COPY });
}

const RECIPE_IA_SUGGESTIONS_PREMIUM_COPY = {
  featureName: 'las sugerencias de recetas con IA',
  title: 'Recetas sugeridas con IA',
  message:
    'Ver ideas de recetas personalizadas con IA es Premium. Con NutrIA Premium tienes recetas, NutriCoach, escáner y planes sin cupos.',
} as const;

export function showRecipeIaSuggestionsPremiumLock() {
  showPremiumLock({ ...RECIPE_IA_SUGGESTIONS_PREMIUM_COPY });
}

const RECIPE_FROM_PHOTO_IA_PREMIUM_COPY = {
  featureName: 'crear receta desde foto (IA visual)',
  title: 'Receta desde foto con IA',
  message:
    'Analizar una foto del plato para rellenar la receta con visión e IA es Premium. Suscríbete para usar visión y recetas sin cupos.',
} as const;

export function showRecipeFromPhotoIaPremiumLock() {
  showPremiumLock({ ...RECIPE_FROM_PHOTO_IA_PREMIUM_COPY });
}

const IMAGINE_RECIPE_IA_PREMIUM_COPY = {
  featureName: '“Imaginar con IA” (receta desde texto)',
  title: 'Imaginar recetas con IA',
  message:
    'Generar la receta a partir de una descripción con IA es Premium. Con NutrIA Premium puedes crear recetas con IA sin cupos.',
} as const;

export function showImagineRecipeIaPremiumLock() {
  showPremiumLock({ ...IMAGINE_RECIPE_IA_PREMIUM_COPY });
}

const PLAN_SUBSTITUTE_FOOD_IA_PREMIUM_COPY = {
  featureName: 'sustituir un alimento del plan con IA',
  title: 'Rehacer alimento con IA',
  message:
    'Sustituir un alimento de tu plan con IA es Premium. Suscríbete para editar planes con IA sin cupos.',
} as const;

export function showPlanSubstituteFoodIaPremiumLock() {
  showPremiumLock({ ...PLAN_SUBSTITUTE_FOOD_IA_PREMIUM_COPY });
}

const PLAN_REGENERATE_MEAL_IA_PREMIUM_COPY = {
  featureName: 'rehacer la comida del plan con IA',
  title: 'Rehacer comida con IA',
  message:
    'Regenerar una comida del plan con IA es Premium. Con NutrIA Premium puedes rehacer comidas y planes sin cupos.',
} as const;

export function showPlanRegenerateMealIaPremiumLock() {
  showPremiumLock({ ...PLAN_REGENERATE_MEAL_IA_PREMIUM_COPY });
}

const REGENERATE_FULL_WEEK_PLAN_IA_PREMIUM_COPY = {
  featureName: 'regenerar el plan semanal completo con IA',
  title: 'Regenerar plan con IA',
  message:
    'Sustituir la semana entera del plan con IA es Premium. Suscríbete para usar planes, recetas y NutriCoach sin cupos.',
} as const;

export function showRegenerateFullWeekPlanIaPremiumLock() {
  showPremiumLock({ ...REGENERATE_FULL_WEEK_PLAN_IA_PREMIUM_COPY });
}
