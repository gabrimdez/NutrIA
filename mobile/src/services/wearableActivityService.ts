/**
 * Hub de wearables: solo conexiones y datos reales (HealthKit / Health Connect).
 * Mocks solo con __DEV__ + EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS=true (nunca como datos reales).
 */
import { Platform } from 'react-native';
import { api } from '../lib/api';
import { toLocalYmd } from '../lib/diaryDate';
import { persistAppSettingsIntegration } from '../lib/appSettingsIntegration';
import {
  areWearableMocksEnabled,
  canSyncRealWearableData,
  isRealActivitySnapshot,
  MSG_DEV_MOCK_SYNC_DISABLED,
  MSG_NO_ACTIVITY_DATA,
  MSG_SYNC_DEVICE_FAILED,
  MSG_SYNC_NO_DEVICE,
  MSG_UNAVAILABLE_PROVIDER,
  MSG_WEB_NO_DIRECT,
} from '../lib/wearableActivityPolicy';
import {
  getNativeActivitySummaryToday,
  pickResolvedActivityKcal,
  readNativeActivitySummaryTodayDetailed,
} from '../lib/healthSteps';
import { loadWearableHubLocal, patchWearableHubLocal, type WearableHubLocalState } from '../lib/wearableLocalStore';
import {
  nativeConnectAndroid,
  nativeConnectApple,
  nativeDisconnectAndroid,
  nativeDisconnectApple,
} from '../lib/wearableNativeFlows';
import type { ActivityData, WearableConnectionState, WearableProviderId } from '../lib/wearableActivityTypes';
import { emptyActivityData, WEARABLE_SYNC_ACTIVITY_TRAINING_TYPE } from '../lib/wearableActivityTypes';
import type { AppSettings } from '../types';

const MOCK_VENDOR_IDS: WearableProviderId[] = ['xiaomi_mi_fitness', 'garmin', 'other_device'];

function platformTri(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

function todayYmd(): string {
  return toLocalYmd(new Date());
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pushWearableActivityToServer(args: {
  steps: number;
  activeEnergyKcal: number | null;
}): Promise<void> {
  const payload: {
    date: string;
    steps: number;
    training_type: string;
    estimated_burn_kcal?: number;
  } = {
    date: todayYmd(),
    steps: Math.max(0, Math.min(100_000, Math.round(args.steps))),
    training_type: WEARABLE_SYNC_ACTIVITY_TRAINING_TYPE,
  };
  if (args.activeEnergyKcal != null) {
    payload.estimated_burn_kcal = Math.max(0, Math.min(20_000, Math.round(args.activeEnergyKcal)));
  }
  await api.post('/api/v1/progress/activity', payload);
}

export function getConnectionStatus(
  provider: WearableProviderId,
  settings: AppSettings,
  local: WearableHubLocalState,
): WearableConnectionState {
  const int = settings.integration_preferences;
  const st = settings.integration_status;
  const pl = platformTri();

  if (provider === 'apple_health') {
    if (pl === 'web') return 'unavailable';
    if (pl !== 'ios') return 'unavailable';
    if (areWearableMocksEnabled() && local.mockDemoByProvider.apple_health) return 'dev_mock';
    if (int.apple_health_enabled && st.apple_health === 'connected') return 'connected';
    if (int.apple_health_enabled && st.apple_health === 'permission_denied') return 'permission_denied';
    if (int.apple_health_enabled && st.apple_health === 'sync_error') return 'sync_error';
    return 'not_connected';
  }

  if (provider === 'android_health_connect') {
    if (pl === 'web') return 'unavailable';
    if (pl !== 'android') return 'unavailable';
    if (areWearableMocksEnabled() && local.mockDemoByProvider.android_health_connect) return 'dev_mock';
    if (int.google_fit_enabled && st.google_fit === 'connected') return 'connected';
    if (int.google_fit_enabled && st.google_fit === 'permission_denied') return 'permission_denied';
    if (int.google_fit_enabled && st.google_fit === 'sync_error') return 'sync_error';
    return 'not_connected';
  }

  if (MOCK_VENDOR_IDS.includes(provider)) {
    if (areWearableMocksEnabled() && local.mockDemoByProvider[provider]) return 'dev_mock';
    return 'unavailable';
  }

  return 'unavailable';
}

export type ConnectProviderResult = {
  ok: boolean;
  settings: AppSettings;
  message?: string;
  code?:
    | 'permission_denied'
    | 'provider_update_required'
    | 'native_module_unavailable'
    | 'init_failed'
    | 'unavailable';
};

export async function connectProvider(
  provider: WearableProviderId,
  draft: AppSettings,
): Promise<ConnectProviderResult> {
  const pl = platformTri();

  if (MOCK_VENDOR_IDS.includes(provider)) {
    if (!areWearableMocksEnabled()) {
      return { ok: false, settings: draft, message: MSG_UNAVAILABLE_PROVIDER, code: 'unavailable' };
    }
    await delay(320);
    const now = new Date().toISOString();
    await patchWearableHubLocal((prev) => ({
      ...prev,
      mockDemoByProvider: { ...prev.mockDemoByProvider, [provider]: { lastSyncAt: now } },
    }));
    return {
      ok: true,
      settings: draft,
      message:
        'Modo desarrollo: conexión simulada. No son datos reales. La sincronización de datos simulados está desactivada.',
    };
  }

  if (provider === 'apple_health' || provider === 'android_health_connect') {
    if (pl === 'web') {
      return { ok: false, settings: draft, message: MSG_WEB_NO_DIRECT, code: 'unavailable' };
    }
  }

  if (provider === 'apple_health') {
    if (pl !== 'ios') {
      return { ok: false, settings: draft, message: MSG_UNAVAILABLE_PROVIDER, code: 'unavailable' };
    }
    const r = await nativeConnectApple(draft);
    if (!r.ok) return { ok: false, settings: r.settings, message: r.message, code: r.code };
    const now = new Date().toISOString();
    const snap: ActivityData = {
      ...emptyActivityData('apple_health', now),
      steps: r.steps,
      distanceMeters: r.distanceMeters,
      calories: pickResolvedActivityKcal(r.activeEnergyKcal, r.steps),
      source: 'healthkit',
      workouts: r.workoutCount ?? null,
      workoutKcal: r.workoutKcal,
      workoutDurationMin: r.workoutDurationMin,
    };
    await patchWearableHubLocal((prev) => ({
      ...prev,
      snapshots: { ...prev.snapshots, apple_health: snap },
    }));
    const extra: string[] = [];
    if (r.activeEnergyKcal != null) extra.push(`~${r.activeEnergyKcal} kcal activas`);
    if (r.distanceMeters != null && r.distanceMeters > 0) {
      extra.push(r.distanceMeters >= 1000 ? `~${(r.distanceMeters / 1000).toFixed(1)} km` : `~${r.distanceMeters} m`);
    }
    if (r.workoutCount != null && r.workoutCount > 0) {
      extra.push(`${r.workoutCount} entreno(s)`);
    }
    if (r.workoutKcal != null && r.workoutKcal > 0) {
      extra.push(`~${r.workoutKcal} kcal entrenos`);
    }
    if (r.workoutDurationMin != null && r.workoutDurationMin > 0) {
      extra.push(`~${r.workoutDurationMin} min entrenos`);
    }
    const tail = extra.length ? ` ${extra.join(' · ')}.` : '';
    let syncTail = '';
    try {
      await pushWearableActivityToServer({ steps: r.steps, activeEnergyKcal: r.activeEnergyKcal });
    } catch {
      syncTail = ' Conectado, pero no se pudieron subir los pasos al servidor. Pulsa sincronizar para reintentarlo.';
    }
    return {
      ok: true,
      settings: r.settings,
      message: `Conectado. Pasos de hoy: ${r.steps.toLocaleString('es-ES')}.${tail}${syncTail}`,
    };
  }

  if (provider === 'android_health_connect') {
    if (pl !== 'android') {
      return { ok: false, settings: draft, message: MSG_UNAVAILABLE_PROVIDER, code: 'unavailable' };
    }
    const r = await nativeConnectAndroid(draft);
    if (!r.ok) return { ok: false, settings: r.settings, message: r.message, code: r.code };
    const now = new Date().toISOString();
    const snap: ActivityData = {
      ...emptyActivityData('android_health_connect', now),
      steps: r.steps,
      distanceMeters: r.distanceMeters,
      calories: pickResolvedActivityKcal(r.activeEnergyKcal, r.steps),
      source: 'health_connect',
    };
    await patchWearableHubLocal((prev) => ({
      ...prev,
      snapshots: { ...prev.snapshots, android_health_connect: snap },
    }));
    const extra: string[] = [];
    if (r.activeEnergyKcal != null) extra.push(`~${r.activeEnergyKcal} kcal activas`);
    if (r.distanceMeters != null && r.distanceMeters > 0) {
      extra.push(r.distanceMeters >= 1000 ? `~${(r.distanceMeters / 1000).toFixed(1)} km` : `~${r.distanceMeters} m`);
    }
    const tail = extra.length ? ` ${extra.join(' · ')}.` : '';
    let syncTail = '';
    try {
      await pushWearableActivityToServer({ steps: r.steps, activeEnergyKcal: r.activeEnergyKcal });
    } catch {
      syncTail = ' Conectado, pero no se pudieron subir los pasos al servidor. Pulsa sincronizar para reintentarlo.';
    }
    return {
      ok: true,
      settings: r.settings,
      message: `Conectado. Pasos de hoy: ${r.steps.toLocaleString('es-ES')}.${tail}${syncTail}`,
    };
  }

  return { ok: false, settings: draft, message: MSG_UNAVAILABLE_PROVIDER, code: 'unavailable' };
}

export async function disconnectProvider(
  provider: WearableProviderId,
  draft: AppSettings,
): Promise<{ settings: AppSettings }> {
  if (MOCK_VENDOR_IDS.includes(provider)) {
    await patchWearableHubLocal((prev) => {
      const nextDemo = { ...prev.mockDemoByProvider };
      delete nextDemo[provider];
      const nextSnap = { ...prev.snapshots };
      delete nextSnap[provider];
      return { ...prev, mockDemoByProvider: nextDemo, snapshots: nextSnap };
    });
    return { settings: draft };
  }

  if (provider === 'apple_health') {
    await patchWearableHubLocal((prev) => {
      const nextDemo = { ...prev.mockDemoByProvider };
      delete nextDemo.apple_health;
      const nextSnap = { ...prev.snapshots };
      delete nextSnap.apple_health;
      return { ...prev, mockDemoByProvider: nextDemo, snapshots: nextSnap };
    });
    const saved = await nativeDisconnectApple(draft);
    return { settings: saved };
  }

  if (provider === 'android_health_connect') {
    await patchWearableHubLocal((prev) => {
      const nextDemo = { ...prev.mockDemoByProvider };
      delete nextDemo.android_health_connect;
      const nextSnap = { ...prev.snapshots };
      delete nextSnap.android_health_connect;
      return { ...prev, mockDemoByProvider: nextDemo, snapshots: nextSnap };
    });
    const saved = await nativeDisconnectAndroid(draft);
    return { settings: saved };
  }

  return { settings: draft };
}

export type SyncActivityResult = {
  ok: boolean;
  data: ActivityData | null;
  message?: string;
};

export async function syncActivityData(
  provider: WearableProviderId,
  draft: AppSettings,
  options?: { pushStepsToServer?: boolean },
): Promise<SyncActivityResult> {
  const push = options?.pushStepsToServer !== false;
  const pl = platformTri();
  const loc = await loadWearableHubLocal();
  const prevSnap = loc.snapshots[provider] ?? null;

  const st = getConnectionStatus(provider, draft, loc);
  if (st === 'dev_mock') {
    return { ok: false, data: null, message: MSG_DEV_MOCK_SYNC_DISABLED };
  }

  const gate = canSyncRealWearableData(provider, pl, draft);
  if (!gate.ok) {
    return { ok: false, data: null, message: gate.reason };
  }

  const now = new Date().toISOString();

  if (provider === 'apple_health' && pl === 'ios') {
    const sum = await getNativeActivitySummaryToday({
      appleHealthEnabled: true,
      googleFitEnabled: false,
    });
    if (sum == null || sum.steps == null) {
      return { ok: false, data: isRealActivitySnapshot(prevSnap?.source) ? prevSnap : null, message: MSG_SYNC_DEVICE_FAILED };
    }
    const steps = sum.steps;
    const data: ActivityData = {
      ...emptyActivityData(provider, now),
      steps: Math.round(steps),
      distanceMeters: sum.distanceMeters,
      calories: pickResolvedActivityKcal(sum.activeEnergyKcal, steps),
      source: 'healthkit',
      workouts: sum.workoutCount ?? null,
      workoutKcal: sum.workoutKcal,
      workoutDurationMin: sum.workoutDurationMin,
    };
    await patchWearableHubLocal((prev) => ({
      ...prev,
      snapshots: { ...prev.snapshots, [provider]: data },
    }));
    if (push) {
      try {
        await pushWearableActivityToServer({ steps, activeEnergyKcal: sum.activeEnergyKcal });
      } catch (e) {
        return {
          ok: false,
          data: isRealActivitySnapshot(prevSnap?.source) ? prevSnap : data,
          message: e instanceof Error ? e.message : MSG_SYNC_DEVICE_FAILED,
        };
      }
    }
    return { ok: true, data };
  }

  if (provider === 'android_health_connect' && pl === 'android') {
    const sum = await getNativeActivitySummaryToday({
      appleHealthEnabled: false,
      googleFitEnabled: true,
    });
    if (sum == null || sum.steps == null) {
      return { ok: false, data: isRealActivitySnapshot(prevSnap?.source) ? prevSnap : null, message: MSG_SYNC_DEVICE_FAILED };
    }
    const steps = sum.steps;
    const data: ActivityData = {
      ...emptyActivityData(provider, now),
      steps: Math.round(steps),
      distanceMeters: sum.distanceMeters,
      calories: pickResolvedActivityKcal(sum.activeEnergyKcal, steps),
      source: 'health_connect',
    };
    await patchWearableHubLocal((prev) => ({
      ...prev,
      snapshots: { ...prev.snapshots, [provider]: data },
    }));
    if (push) {
      try {
        await pushWearableActivityToServer({ steps, activeEnergyKcal: sum.activeEnergyKcal });
      } catch (e) {
        return {
          ok: false,
          data: isRealActivitySnapshot(prevSnap?.source) ? prevSnap : data,
          message: e instanceof Error ? e.message : MSG_SYNC_DEVICE_FAILED,
        };
      }
    }
    return { ok: true, data };
  }

  return { ok: false, data: null, message: MSG_SYNC_NO_DEVICE };
}

export type ProbeRepairResult = {
  /** Settings actualizados si hubo cambio de estado, o null si no hace falta persistir. */
  settings: AppSettings | null;
  /** Snapshot recién leído si la lectura nativa funcionó. */
  data: ActivityData | null;
  /** Energía activa "raw" leída del proveedor (null si el proveedor no la dio). Distinto de `data.calories`,
   *  que cae al estimado por pasos. Usar este al subir al backend para no inventar kcal. */
  rawActiveEnergyKcal: number | null;
  /** Verdadero si reparamos un estado previamente degradado a 'connected'. */
  repaired: boolean;
};

/**
 * Lectura silenciosa con auto-recuperación: si la integración está habilitada en preferencias,
 * intenta leer y, si funciona, repara el estado guardado a 'connected' (cuando estuviese
 * degradado). NO degrada el estado en caso de fallo aislado — solo el flujo de "Conectar"
 * (botón explícito) puede marcar sync_error / permission_denied.
 *
 * Si `requestPermissionsIfMissing: true` y la lectura silenciosa falla por falta de permisos
 * del sistema (caso típico tras reinstalar la app: la preferencia sigue ON pero los permisos
 * de Health Connect / HealthKit se borraron), dispara el flow nativo de pedir permisos.
 */
export async function probeAndRepairWearableConnection(
  provider: WearableProviderId,
  draft: AppSettings,
  options?: { requestPermissionsIfMissing?: boolean },
): Promise<ProbeRepairResult> {
  const pl = platformTri();
  const ints = draft.integration_preferences;
  const status = draft.integration_status;

  const empty: ProbeRepairResult = { settings: null, data: null, rawActiveEnergyKcal: null, repaired: false };
  let enabled = false;
  let prevStatus: string | undefined;
  if (provider === 'apple_health') {
    if (pl !== 'ios') return empty;
    enabled = !!ints.apple_health_enabled;
    prevStatus = status.apple_health;
  } else if (provider === 'android_health_connect') {
    if (pl !== 'android') return empty;
    enabled = !!ints.google_fit_enabled;
    prevStatus = status.google_fit;
  } else {
    return empty;
  }
  if (!enabled) return empty;

  const r = await readNativeActivitySummaryTodayDetailed({
    appleHealthEnabled: provider === 'apple_health',
    googleFitEnabled: provider === 'android_health_connect',
  });
  // Caso especial: la preferencia está ON pero los permisos del sistema no existen
  // (típico tras reinstalación). Si el caller lo permite, lanzamos el flow nativo
  // de pedir permisos — que abre el cuadro de Health Connect / HealthKit.
  if (!r.ok && r.code === 'permission_denied' && options?.requestPermissionsIfMissing) {
    const reconnect =
      provider === 'apple_health'
        ? await nativeConnectApple(draft)
        : await nativeConnectAndroid(draft);
    if (!reconnect.ok) {
      return { ...empty, settings: reconnect.settings };
    }
    const stepsNum = reconnect.steps;
    const now = new Date().toISOString();
    const data: ActivityData = {
      ...emptyActivityData(provider, now),
      steps: Math.round(stepsNum),
      distanceMeters: reconnect.distanceMeters,
      calories: pickResolvedActivityKcal(reconnect.activeEnergyKcal, stepsNum),
      source: provider === 'apple_health' ? 'healthkit' : 'health_connect',
      workouts: reconnect.workoutCount ?? null,
      workoutKcal: reconnect.workoutKcal,
      workoutDurationMin: reconnect.workoutDurationMin,
    };
    await patchWearableHubLocal((prev) => ({
      ...prev,
      snapshots: { ...prev.snapshots, [provider]: data },
    }));
    return {
      settings: reconnect.settings,
      data,
      rawActiveEnergyKcal: reconnect.activeEnergyKcal,
      repaired: prevStatus !== 'connected',
    };
  }
  if (!r.ok) {
    // Otros fallos silenciosos (init_failed, read_failed, native_module_unavailable):
    // no degradamos el estado guardado.
    return empty;
  }
  const sum = r.summary;
  if (sum.steps == null) return empty;
  const stepsNum = sum.steps;

  const now = new Date().toISOString();
  const data: ActivityData = {
    ...emptyActivityData(provider, now),
    steps: Math.round(stepsNum),
    distanceMeters: sum.distanceMeters,
    calories: pickResolvedActivityKcal(sum.activeEnergyKcal, stepsNum),
    source: provider === 'apple_health' ? 'healthkit' : 'health_connect',
    workouts: sum.workoutCount ?? null,
    workoutKcal: sum.workoutKcal,
    workoutDurationMin: sum.workoutDurationMin,
  };
  await patchWearableHubLocal((prev) => ({
    ...prev,
    snapshots: { ...prev.snapshots, [provider]: data },
  }));

  // Si el estado estaba degradado pero la lectura va bien, lo reparamos a 'connected'.
  const wasDegraded = prevStatus !== 'connected';
  if (wasDegraded) {
    const patch =
      provider === 'apple_health'
        ? { apple_health: 'connected' as const, last_sync_at: now, last_error: undefined }
        : { google_fit: 'connected' as const, last_sync_at: now, last_error: undefined };
    try {
      const settings = await persistAppSettingsIntegration(draft, {}, patch);
      return { settings, data, rawActiveEnergyKcal: sum.activeEnergyKcal, repaired: true };
    } catch {
      // Si falla la persistencia del estado reparado, mantenemos el snapshot leído.
      return { settings: null, data, rawActiveEnergyKcal: sum.activeEnergyKcal, repaired: false };
    }
  }
  return { settings: null, data, rawActiveEnergyKcal: sum.activeEnergyKcal, repaired: false };
}

/** Último snapshot con origen real (o dev_mock solo si mocks activos). */
export async function getActivityData(): Promise<ActivityData | null> {
  const loc = await loadWearableHubLocal();
  const mocksOn = areWearableMocksEnabled();
  let best: ActivityData | null = null;
  for (const snap of Object.values(loc.snapshots)) {
    if (!snap) continue;
    if (snap.source === 'dev_mock' && !mocksOn) continue;
    if (!isRealActivitySnapshot(snap.source) && snap.source !== 'dev_mock') continue;
    if (!best || snap.lastSyncAt > best.lastSyncAt) best = snap;
  }
  return best;
}

export { MSG_NO_ACTIVITY_DATA, MSG_SYNC_NO_DEVICE };
