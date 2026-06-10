import type { AppSettings } from '../types';
import { DEFAULT_APP_SETTINGS } from './appSettings';
import type { ActivityData, WearableConnectionState, WearableProviderId } from './wearableActivityTypes';
import type { WearableHubLocalState } from './wearableLocalStore';
import { getConnectionStatus } from '../services/wearableActivityService';

export type { WearableProviderId } from './wearableActivityTypes';

/** Métricas que en el futuro podrán sincronizarse desde wearables / salud. */
export type WearableMetricKey =
  | 'steps'
  | 'distance'
  | 'active_calories'
  | 'active_minutes'
  | 'heart_rate'
  | 'sleep'
  | 'workouts';

export const WEARABLE_METRIC_LABELS: Record<WearableMetricKey, string> = {
  steps: 'Pasos',
  distance: 'Distancia recorrida',
  active_calories: 'Calorías quemadas (actividad)',
  active_minutes: 'Minutos de actividad',
  heart_rate: 'Frecuencia cardíaca',
  sleep: 'Sueño (si el dispositivo lo expone)',
  workouts: 'Entrenamientos o sesiones de ejercicio',
};

export const WEARABLE_METRIC_ORDER: WearableMetricKey[] = [
  'steps',
  'distance',
  'active_calories',
  'active_minutes',
  'heart_rate',
  'sleep',
  'workouts',
];

/** Badge en lista = estado de conexión + transitorio “conectando”. */
export type WearableListBadge = WearableConnectionState | 'connecting';

export type WearableProviderAuthPlaceholder = {
  oauthClientId?: string;
  scopes?: string[];
  nativeModuleKey?: string;
};

export type WearableProviderRow = {
  id: WearableProviderId;
  title: string;
  subtitle: string;
  icon: 'logo-apple' | 'logo-android' | 'phone-portrait-outline' | 'navigate-outline' | 'ellipsis-horizontal-outline';
  uiKind: WearableListBadge;
  auth?: WearableProviderAuthPlaceholder;
};

function rowBadge(
  id: WearableProviderId,
  settings: AppSettings,
  hubLocal: WearableHubLocalState,
  transient?: Partial<Record<WearableProviderId, 'connecting'>>,
): WearableListBadge {
  if (transient?.[id] === 'connecting') return 'connecting';
  return getConnectionStatus(id, settings, hubLocal);
}

function fmtDistanceShort(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

/** Resumen breve desde snapshot local (solo lectura real o mock dev). */
function snapshotSummaryLine(snap: ActivityData | undefined): string | null {
  if (!snap?.lastSyncAt) return null;
  if (snap.source !== 'healthkit' && snap.source !== 'health_connect' && snap.source !== 'dev_mock') return null;
  const parts: string[] = [];
  if (snap.steps != null) parts.push(`${snap.steps.toLocaleString('es-ES')} pasos`);
  if (snap.calories != null) parts.push(`~${snap.calories} kcal`);
  if (snap.distanceMeters != null && snap.distanceMeters > 0) parts.push(fmtDistanceShort(snap.distanceMeters));
  if (!parts.length) return null;
  return `Datos en app: ${parts.join(' · ')}.`;
}

function appleHealthSubtitle(hubLocal: WearableHubLocalState): string {
  const base =
    'Integración activa en iPhone/iPad: Apple Salud lee pasos, distancia caminando/correr y energía activa (solo datos reales).';
  const extra = snapshotSummaryLine(hubLocal.snapshots.apple_health);
  return extra ? `${base} ${extra}` : base;
}

function androidHealthSubtitle(hubLocal: WearableHubLocalState): string {
  const base =
    'Integración activa en Android: Health Connect agrega pasos, distancia y calorías activas (solo datos reales).';
  const extra = snapshotSummaryLine(hubLocal.snapshots.android_health_connect);
  return extra ? `${base} ${extra}` : base;
}

/**
 * Filas del hub: estados solo desde integración real o `dev_mock` en desarrollo explícito.
 */
export function getWearableRowsMerged(
  settings: AppSettings,
  hubLocal: WearableHubLocalState,
  transient?: Partial<Record<WearableProviderId, 'connecting'>>,
): WearableProviderRow[] {
  return [
    {
      id: 'apple_health',
      title: 'Apple Watch / Apple Health',
      subtitle: appleHealthSubtitle(hubLocal),
      icon: 'logo-apple',
      uiKind: rowBadge('apple_health', settings, hubLocal, transient),
    },
    {
      id: 'android_health_connect',
      title: 'Android / Google Fit o Health Connect',
      subtitle: androidHealthSubtitle(hubLocal),
      icon: 'logo-android',
      uiKind: rowBadge('android_health_connect', settings, hubLocal, transient),
    },
    {
      id: 'xiaomi_mi_fitness',
      title: 'Xiaomi / Mi Fitness',
      subtitle:
        'Sin enlace directo con NutrIA. Si Mi Fitness escribe en Apple Salud o Health Connect, conecta esa integración arriba para ver pasos, distancia y energía.',
      icon: 'phone-portrait-outline',
      uiKind: rowBadge('xiaomi_mi_fitness', settings, hubLocal, transient),
    },
    {
      id: 'garmin',
      title: 'Garmin',
      subtitle:
        'Sin enlace directo con NutrIA. Si Garmin Connect rellena Apple Salud o Health Connect en el teléfono, usa esas filas para lectura real en la app.',
      icon: 'navigate-outline',
      uiKind: rowBadge('garmin', settings, hubLocal, transient),
    },
    {
      id: 'other_device',
      title: 'Otro dispositivo',
      subtitle:
        'Cualquier pulsera o app que deje datos en Apple Salud (iOS) o Health Connect (Android) cuenta: elige la integración del sistema correspondiente.',
      icon: 'ellipsis-horizontal-outline',
      uiKind: rowBadge('other_device', settings, hubLocal, transient),
    },
  ];
}

/** Compatibilidad: sin estado AsyncStorage. */
export function getWearableRows(
  integrationStatus: AppSettings['integration_status'],
  integrationPreferences: AppSettings['integration_preferences'],
): WearableProviderRow[] {
  const settings: AppSettings = {
    ...DEFAULT_APP_SETTINGS,
    integration_status: integrationStatus,
    integration_preferences: integrationPreferences,
  };
  return getWearableRowsMerged(settings, { mockDemoByProvider: {}, snapshots: {} });
}

export const WEARABLE_UI_LABELS: Record<WearableListBadge, string> = {
  connected: 'Conectado',
  not_connected: 'No conectado',
  unavailable: 'No disponible',
  connecting: 'Conectando…',
  permission_denied: 'Sin permiso',
  sync_error: 'Error de sync',
  disconnected: 'Desconectado',
  dev_mock: 'Simulación (solo dev)',
};
