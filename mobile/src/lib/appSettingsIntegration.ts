import { api } from './api';
import { DEFAULT_INTEGRATION_STATUS, normalizeAppSettings } from './appSettings';
import type { AppSettings, IntegrationStatus } from '../types';

/**
 * Persiste solo el bloque de integración (preferencias + estado) manteniendo el resto del borrador.
 * Compartido entre Configuración y el hub de wearables.
 */
export async function persistAppSettingsIntegration(
  draft: AppSettings,
  integrationPatch: Partial<AppSettings['integration_preferences']>,
  statusPatch: Partial<IntegrationStatus>,
): Promise<AppSettings> {
  const base = draft.integration_status ?? DEFAULT_INTEGRATION_STATUS;
  return normalizeAppSettings(
    await api.put<AppSettings>('/api/v1/me/settings', {
      plan_preferences: draft.plan_preferences,
      notification_preferences: draft.notification_preferences,
      integration_preferences: { ...draft.integration_preferences, ...integrationPatch },
      integration_status: { ...base, ...statusPatch },
    }),
  );
}
