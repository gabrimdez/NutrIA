import { showPremiumLock } from './premiumLock';

/**
 * 403 de `require_premium_for_plan_ai_generate` al llamar a POST /api/v1/plans/generate.
 */
export function isPlanGenerationPremiumRequiredMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('generar un plan semanal completo con ia') || m.includes('plan semanal completo con ia')
  );
}

/**
 * Muestra el modal global de Premium para funciones de planes con IA.
 * (Mantiene el nombre histórico por compatibilidad con los call-sites existentes.)
 */
export function navigateToPremiumUpgrade() {
  showPremiumLock({
    featureName: 'los planes con IA',
    title: 'Los planes con IA son Premium',
    message:
      'Generar, regenerar y adaptar planes de alimentación con IA es Premium. Suscríbete para usar la app sin cupos: planes, recetas, escáner y NutriCoach ilimitados.',
  });
}

/** Con perfil ya cargado: true si el usuario no tiene Premium. */
export function isNonPremiumTier(tier: 'free' | 'premium' | undefined | null): boolean {
  return tier !== 'premium';
}
