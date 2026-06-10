import { showPremiumLock } from './premiumLock';

/**
 * Error 403 de `require_vision` (análisis por foto / escáner con IA), p. ej.:
 * "Análisis por foto: límite del plan Free (...)"
 */
export function isVisionQuotaErrorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('análisis por foto') || m.includes('analisis por foto');
}

type VisionQuotaAlertOptions = {
  /** Tras cerrar sin ir a Premium (p. ej. volver al escáner). */
  onDismiss?: () => void;
};

export function alertVisionQuotaExceeded(options?: VisionQuotaAlertOptions) {
  showPremiumLock({
    featureName: 'el escáner con IA',
    title: 'Has agotado tus análisis con IA',
    message:
      'Has alcanzado el límite mensual del plan gratuito para análisis por foto y escáner con IA. Con NutrIA Premium tienes uso ilimitado de escáner, visión y el resto de funciones de la app.',
    onDismiss: options?.onDismiss,
  });
}
