/**
 * Flujos nativos Apple Health / Health Connect + persistencia en cuenta.
 * Misma semántica que Integraciones en settings.tsx (sin Alert).
 */
import { Platform } from 'react-native';
import { persistAppSettingsIntegration } from './appSettingsIntegration';
import {
  connectAndroidHealthConnectAndReadStepsToday,
  connectAppleHealthAndReadStepsToday,
} from './healthSteps';
import type { AppSettings } from '../types';

export type NativeFlowResult =
  | {
      ok: true;
      settings: AppSettings;
      steps: number;
      distanceMeters: number | null;
      activeEnergyKcal: number | null;
      workoutCount: number | null;
      workoutKcal: number | null;
      workoutDurationMin: number | null;
    }
  | {
      ok: false;
      settings: AppSettings;
      message: string;
      /** Solo Android Health Connect: UI puede ofrecer abrir ajustes. */
      code?: 'permission_denied' | 'provider_update_required' | 'native_module_unavailable' | 'init_failed';
    };

export async function nativeDisconnectApple(draft: AppSettings): Promise<AppSettings> {
  return persistAppSettingsIntegration(draft, { apple_health_enabled: false }, { apple_health: 'disabled' });
}

export async function nativeConnectApple(draft: AppSettings): Promise<NativeFlowResult> {
  if (Platform.OS !== 'ios') {
    return { ok: false, settings: draft, message: 'Apple Salud solo está disponible en dispositivos iOS.' };
  }
  const now = new Date().toISOString();
  const result = await connectAppleHealthAndReadStepsToday();

  if (!result.ok) {
    if (result.code === 'native_module_unavailable') {
      const saved = await persistAppSettingsIntegration(draft, { apple_health_enabled: false }, {
        apple_health: 'disabled',
        last_error: result.message,
      });
      return {
        ok: false,
        settings: saved,
        code: 'native_module_unavailable',
        message: result.message ?? 'Módulo no disponible en este entorno.',
      };
    }
    if (result.code === 'init_failed') {
      const saved = await persistAppSettingsIntegration(draft, { apple_health_enabled: true }, {
        apple_health: 'sync_error',
        last_sync_at: now,
        last_error: result.message ?? 'No se pudo abrir Apple Salud',
      });
      return {
        ok: false,
        settings: saved,
        code: 'init_failed',
        message:
          result.message ??
          'No se pudo abrir Apple Salud. Comprueba que el permiso está concedido en Ajustes → Salud → Acceso y dispositivos → NutrIA.',
      };
    }
    if (result.code === 'read_failed') {
      const saved = await persistAppSettingsIntegration(draft, { apple_health_enabled: true }, {
        apple_health: 'permission_denied',
        last_error: 'No se pudieron leer pasos de Apple Salud',
      });
      return {
        ok: false,
        settings: saved,
        code: 'permission_denied',
        message:
          'No se pudieron leer tus pasos. Revisa Ajustes → Salud → Acceso y dispositivos → NutrIA y concede lectura de Pasos.',
      };
    }
    const saved = await persistAppSettingsIntegration(draft, { apple_health_enabled: true }, {
      apple_health: 'sync_error',
      last_sync_at: now,
      last_error: result.message ?? 'Error al leer pasos',
    });
    return {
      ok: false,
      settings: saved,
      code: 'init_failed',
      message: result.message ?? 'No se pudieron leer los pasos.',
    };
  }

  const saved = await persistAppSettingsIntegration(draft, { apple_health_enabled: true }, {
    apple_health: 'connected',
    last_sync_at: now,
    last_error: undefined,
  });
  return {
    ok: true,
    settings: saved,
    steps: result.steps,
    distanceMeters: result.distanceMeters,
    activeEnergyKcal: result.activeEnergyKcal,
    workoutCount: result.workoutCount,
    workoutKcal: result.workoutKcal,
    workoutDurationMin: result.workoutDurationMin,
  };
}

export async function nativeDisconnectAndroid(draft: AppSettings): Promise<AppSettings> {
  return persistAppSettingsIntegration(draft, { google_fit_enabled: false }, { google_fit: 'disabled' });
}

export async function nativeConnectAndroid(draft: AppSettings): Promise<NativeFlowResult> {
  if (Platform.OS !== 'android') {
    return {
      ok: false,
      settings: draft,
      message: 'Health Connect solo está disponible en la app para Android.',
    };
  }
  const now = new Date().toISOString();
  const result = await connectAndroidHealthConnectAndReadStepsToday();

  if (!result.ok) {
    if (result.code === 'native_module_unavailable') {
      const saved = await persistAppSettingsIntegration(draft, { google_fit_enabled: false }, {
        google_fit: 'disabled',
        last_error: result.message,
      });
      return {
        ok: false,
        settings: saved,
        code: 'native_module_unavailable',
        message: result.message ?? 'Módulo no disponible en este entorno.',
      };
    }
    if (result.code === 'provider_update_required') {
      const saved = await persistAppSettingsIntegration(draft, { google_fit_enabled: true }, {
        google_fit: 'sync_error',
        last_sync_at: now,
        last_error: result.message ?? 'Actualiza Health Connect',
      });
      return {
        ok: false,
        settings: saved,
        code: 'provider_update_required',
        message:
          result.message ??
          'Actualiza «Health Connect» desde Play Store para que NutrIA pueda leer tus pasos.',
      };
    }
    if (result.code === 'init_failed') {
      const saved = await persistAppSettingsIntegration(draft, { google_fit_enabled: true }, {
        google_fit: 'sync_error',
        last_sync_at: now,
        last_error: result.message ?? 'Health Connect no disponible',
      });
      return {
        ok: false,
        settings: saved,
        code: 'init_failed',
        message:
          result.message ??
          'No se pudo abrir Health Connect. Comprueba que esté instalado o actualizado en el dispositivo.',
      };
    }
    if (result.code === 'permission_denied') {
      const saved = await persistAppSettingsIntegration(draft, { google_fit_enabled: true }, {
        google_fit: 'permission_denied',
        last_error: 'Permiso de pasos denegado',
      });
      return {
        ok: false,
        settings: saved,
        code: 'permission_denied',
        message:
          'Sin permiso de «Pasos» no podemos leer tu actividad. Abre Health Connect o los permisos de NutrIA desde los ajustes del sistema.',
      };
    }
    const saved = await persistAppSettingsIntegration(draft, { google_fit_enabled: true }, {
      google_fit: 'sync_error',
      last_sync_at: now,
      last_error: result.message ?? 'Error al leer pasos',
    });
    return {
      ok: false,
      settings: saved,
      code: 'init_failed',
      message: result.message ?? 'No se pudieron leer los pasos.',
    };
  }

  const saved = await persistAppSettingsIntegration(draft, { google_fit_enabled: true }, {
    google_fit: 'connected',
    last_sync_at: now,
    last_error: undefined,
  });
  return {
    ok: true,
    settings: saved,
    steps: result.steps,
    distanceMeters: result.distanceMeters,
    activeEnergyKcal: result.activeEnergyKcal,
    workoutCount: null,
    workoutKcal: null,
    workoutDurationMin: null,
  };
}
