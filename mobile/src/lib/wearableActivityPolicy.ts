/**
 * Reglas estrictas: sin datos de salud inventados; mocks solo en __DEV__ + EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS=true.
 * Sin dependencias de react-native (testable en Node).
 */
import type { WearableProviderId } from './wearableActivityTypes';
import type { AppSettings } from '../types';

declare const __DEV__: boolean | undefined;

export function areWearableMocksEnabled(devOverride?: boolean): boolean {
  const dev =
    devOverride !== undefined
      ? devOverride
      : typeof __DEV__ !== 'undefined' && __DEV__ === true;
  return dev === true && process.env.EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS === 'true';
}

export const MSG_UNAVAILABLE_PROVIDER =
  'No se ha podido conectar ningún dispositivo. Este proveedor todavía no está disponible en esta plataforma.';

export const MSG_WEB_NO_DIRECT =
  'Desde esta plataforma no se puede acceder directamente a los datos del smartwatch. Necesitas conectar un proveedor compatible mediante una integración real.';

export const MSG_SYNC_NO_DEVICE =
  'No hay ningún dispositivo conectado. Conecta un smartwatch compatible antes de sincronizar.';

export const MSG_SYNC_DEVICE_FAILED =
  'No se han podido sincronizar los datos del dispositivo.';

export const MSG_NO_ACTIVITY_DATA = 'No hay datos de actividad disponibles.';

export const MSG_DEV_MOCK_SYNC_DISABLED =
  'La sincronización de datos simulados está desactivada. Usa un dispositivo con integración real.';

/** Solo lecturas nativas HealthKit / Health Connect cuentan como “fuente real”. */
export type RealActivitySource = 'healthkit' | 'health_connect';

export function isRealActivitySnapshot(source: unknown): source is RealActivitySource {
  return source === 'healthkit' || source === 'health_connect';
}

/** ¿Se puede intentar sync con fuente real (conexión servidor + plataforma + permisos de integración)? */
export function canSyncRealWearableData(
  provider: WearableProviderId,
  platform: 'ios' | 'android' | 'web',
  settings: AppSettings,
): { ok: true } | { ok: false; reason: string } {
  if (platform === 'web') {
    return { ok: false, reason: MSG_WEB_NO_DIRECT };
  }
  if (provider === 'apple_health') {
    if (platform !== 'ios') {
      return { ok: false, reason: MSG_UNAVAILABLE_PROVIDER };
    }
    if (!settings.integration_preferences.apple_health_enabled) {
      return { ok: false, reason: MSG_SYNC_NO_DEVICE };
    }
    if (settings.integration_status.apple_health !== 'connected') {
      return { ok: false, reason: MSG_SYNC_NO_DEVICE };
    }
    return { ok: true };
  }
  if (provider === 'android_health_connect') {
    if (platform !== 'android') {
      return { ok: false, reason: MSG_UNAVAILABLE_PROVIDER };
    }
    if (!settings.integration_preferences.google_fit_enabled) {
      return { ok: false, reason: MSG_SYNC_NO_DEVICE };
    }
    if (settings.integration_status.google_fit !== 'connected') {
      return { ok: false, reason: MSG_SYNC_NO_DEVICE };
    }
    return { ok: true };
  }
  return { ok: false, reason: MSG_UNAVAILABLE_PROVIDER };
}
