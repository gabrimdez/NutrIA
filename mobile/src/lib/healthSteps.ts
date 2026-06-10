/**
 * Actividad del día vía HealthKit (iOS) o Health Connect (Android).
 * Requiere development build con módulos nativos. En Expo Go el require puede existir
 * pero `initHealthKit` / Health Connect no están enlazados: devolvemos
 * `native_module_unavailable` (o null en getters) en lugar de lanzar.
 * Ver app.json: permisos y plugins react-native-health / react-native-health-connect.
 *
 * Permisos HealthKit (react-native-health `Constants.Permissions`, doc oficial del paquete):
 * - Steps, StepCount — pasos
 * - DistanceWalkingRunning — distancia caminar/correr
 * - ActiveEnergyBurned — energía activa (kcal)
 * - Workout — entrenos (lectura agregada vía getSamples)
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import type { Permission } from 'react-native-health-connect';

export {
  STEPS_KCAL_PER_STEP,
  estimateStepsKcal,
  pickResolvedActivityKcal,
} from './wearableActivityCalories';

export type NativeActivitySummaryToday = {
  steps: number | null;
  distanceMeters: number | null;
  activeEnergyKcal: number | null;
  activeMinutes: number | null;
  workoutCount: number | null;
  workoutKcal: number | null;
  workoutDurationMin: number | null;
};

function warnHealth(scope: 'healthkit' | 'healthconnect', e: unknown) {
  if (__DEV__) {
    console.warn(`[${scope}]`, e);
  }
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ---------------------------------------------------------------------------
// iOS: Apple HealthKit (react-native-health)
// ---------------------------------------------------------------------------

export type AppleHealthConnectResult =
  | {
      ok: true;
      steps: number;
      distanceMeters: number | null;
      activeEnergyKcal: number | null;
      workoutCount: number | null;
      workoutKcal: number | null;
      workoutDurationMin: number | null;
    }
  | {
      ok: false;
      code:
        | 'init_failed'
        | 'native_module_unavailable'
        | 'permission_denied'
        | 'read_failed'
        | 'unsupported_platform';
      message?: string;
    };

const APPLE_HEALTH_EXPO_GO_MESSAGE =
  'Apple Salud requiere un build de desarrollo o producción con módulo nativo (p. ej. EAS build). No está disponible en Expo Go.';

function appleHealthNativeUnavailableMessage(): string {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return APPLE_HEALTH_EXPO_GO_MESSAGE;
  }
  return (
    'Apple Salud no está enlazada en esta instalación (el módulo nativo no cargó). ' +
    'Abre la app «NutrIA» instalada desde Xcode / `expo run:ios`, no Expo Go. ' +
    'Si ya la usas: borra NutrIA del iPhone, vuelve a ejecutar `npx expo run:ios --device` y concede permisos en Ajustes → Salud.'
  );
}

type AppleHealthKitModule = {
  initHealthKit?: (opts: unknown, cb: (err: string) => void) => void;
  getStepCount?: (
    opts: { date?: string; includeManuallyAdded?: boolean },
    cb: (err: unknown, results: { value?: number }) => void,
  ) => void;
  getDailyStepCountSamples?: (
    opts: { startDate: string; endDate: string; includeManuallyAdded?: boolean },
    cb: (err: unknown, results: unknown) => void,
  ) => void;
  getDistanceWalkingRunning?: (
    opts: { unit?: string; date?: string; includeManuallyAdded?: boolean },
    cb: (err: unknown, results: { value?: number } | unknown) => void,
  ) => void;
  getActiveEnergyBurned?: (
    opts: { startDate: string; endDate?: string; includeManuallyAdded?: boolean },
    cb: (err: unknown, results: unknown) => void,
  ) => void;
  getSamples?: (
    opts: {
      type?: string;
      startDate?: string;
      endDate?: string;
      ascending?: boolean;
      limit?: number;
    },
    cb: (err: unknown, results: unknown) => void,
  ) => void;
  Constants?: {
    Permissions?: Partial<
      Record<
        'Steps' | 'StepCount' | 'DistanceWalkingRunning' | 'ActiveEnergyBurned' | 'Workout',
        string
      >
    >;
  };
};

/**
 * No hacer `{ ...pkg, ...native }`: en Hermes el spread sobre el Proxy del parche de
 * `react-native-health` puede dejar `initHealthKit`/`Constants` incoherentes; el Proxy ya
 * delega en nativo al llamar.
 */
async function getMergedAppleHealthKitModule(): Promise<AppleHealthKitModule> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-health') as AppleHealthKitModule;
}

async function readAppleDistanceMetersToday(AHK: AppleHealthKitModule): Promise<number | null> {
  if (typeof AHK.getDistanceWalkingRunning !== 'function') return null;
  return new Promise((resolve) => {
    try {
      // Sin `date`: el nativo usa [NSDate date] → día civil local (evita desajuste ISO/TZ).
      AHK.getDistanceWalkingRunning!(
        { unit: 'meter', includeManuallyAdded: true },
        (err: unknown, results: { value?: number } | unknown) => {
          if (err) {
            warnHealth('healthkit', err);
            resolve(null);
            return;
          }
          const v =
            results && typeof results === 'object' && 'value' in results
              ? Number((results as { value?: number }).value)
              : NaN;
          if (!Number.isFinite(v) || v < 0) resolve(null);
          else resolve(Math.round(v));
        },
      );
    } catch (e) {
      warnHealth('healthkit', e);
      resolve(null);
    }
  });
}

/** Minutos de un workout: el bridge usa `start`/`end` ISO; si solo hay `duration`, se asume segundos si es alto. */
function workoutSampleDurationMinutes(row: unknown): number {
  if (!row || typeof row !== 'object') return 0;
  const o = row as { duration?: number; start?: string; end?: string; startDate?: string; endDate?: string };
  const s = o.start ?? o.startDate;
  const e = o.end ?? o.endDate;
  if (typeof s === 'string' && typeof e === 'string') {
    const a = Date.parse(s);
    const b = Date.parse(e);
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) return (b - a) / 60000;
  }
  if (typeof o.duration === 'number' && Number.isFinite(o.duration) && o.duration > 0) {
    return o.duration > 120 ? o.duration / 60 : o.duration;
  }
  return 0;
}

/**
 * Entrenos del día (local): conteo + kcal + duración total. Devuelve null si falla la lectura.
 */
async function readAppleWorkoutsSummaryToday(
  AHK: AppleHealthKitModule,
): Promise<{ count: number; totalKcal: number; totalDurationMin: number } | null> {
  if (typeof AHK.getSamples !== 'function') return null;
  const end = new Date();
  const start = startOfLocalDay(end);
  return new Promise((resolve) => {
    try {
      AHK.getSamples!(
        {
          type: 'Workout',
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          ascending: false,
        },
        (err: unknown, results: unknown) => {
          if (err) {
            warnHealth('healthkit', err);
            resolve(null);
            return;
          }
          if (!Array.isArray(results)) {
            resolve({ count: 0, totalKcal: 0, totalDurationMin: 0 });
            return;
          }
          let totalKcal = 0;
          let totalDurationMin = 0;
          for (const row of results) {
            if (row && typeof row === 'object' && 'calories' in row) {
              const k = Number((row as { calories?: number }).calories);
              if (Number.isFinite(k) && k > 0) totalKcal += k;
            }
            totalDurationMin += workoutSampleDurationMinutes(row);
          }
          resolve({
            count: results.length,
            totalKcal: Math.round(totalKcal),
            totalDurationMin: Math.round(totalDurationMin * 10) / 10,
          });
        },
      );
    } catch (e) {
      warnHealth('healthkit', e);
      resolve(null);
    }
  });
}

async function readAppleActiveEnergyKcalToday(AHK: AppleHealthKitModule): Promise<number | null> {
  if (typeof AHK.getActiveEnergyBurned !== 'function') return null;
  const end = new Date();
  const start = startOfLocalDay(end);
  return new Promise((resolve) => {
    try {
      AHK.getActiveEnergyBurned!(
        {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          includeManuallyAdded: true,
        },
        (err: unknown, results: unknown) => {
          if (err) {
            warnHealth('healthkit', err);
            resolve(null);
            return;
          }
          if (!Array.isArray(results)) {
            resolve(null);
            return;
          }
          let sum = 0;
          for (const row of results) {
            if (row && typeof row === 'object' && 'value' in row) {
              const n = Number((row as { value?: number }).value);
              if (Number.isFinite(n) && n > 0) sum += n;
            }
          }
          resolve(sum > 0 ? Math.round(sum) : null);
        },
      );
    } catch (e) {
      warnHealth('healthkit', e);
      resolve(null);
    }
  });
}

/**
 * Pasos del día: primero `getStepCount` sin fecha (día local nativo). Si devuelve 0, fallback
 * agregando intervalos de `getDailyStepCountSamples` (algunos dispositivos/ZD fallan con ISO en date).
 */
async function readAppleStepsCountToday(
  AHK: AppleHealthKitModule,
): Promise<{ ok: true; value: number } | { ok: false; message: string }> {
  const primary = await new Promise<{ ok: true; value: number } | { ok: false; message: string }>(
    (resolve) => {
      AHK.getStepCount!(
        { includeManuallyAdded: true },
        (err: unknown, results: { value?: number }) => {
          if (err) resolve({ ok: false, message: String(err) });
          else resolve({ ok: true, value: Math.round(Number(results?.value) || 0) });
        },
      );
    },
  );

  if (!primary.ok) return primary;
  if (primary.value > 0) return primary;
  if (typeof AHK.getDailyStepCountSamples !== 'function') return primary;

  const end = new Date();
  const start = startOfLocalDay(end);
  return new Promise((resolve) => {
    AHK.getDailyStepCountSamples!(
      {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        includeManuallyAdded: true,
      },
      (err: unknown, results: unknown) => {
        if (err || !Array.isArray(results)) {
          resolve(primary);
          return;
        }
        let sum = 0;
        for (const row of results) {
          if (row && typeof row === 'object' && 'value' in row) {
            const n = Number((row as { value?: number }).value);
            if (Number.isFinite(n) && n > 0) sum += n;
          }
        }
        const rounded = Math.round(sum);
        resolve(rounded > 0 ? { ok: true, value: rounded } : primary);
      },
    );
  });
}

/**
 * Inicializa HealthKit, pide lectura MVP (pasos + distancia + energía activa) y devuelve pasos de hoy
 * más métricas opcionales (null si fallan lecturas secundarias o permiso parcial).
 */
export async function connectAppleHealthAndReadStepsToday(): Promise<AppleHealthConnectResult> {
  if (Platform.OS !== 'ios') {
    return { ok: false, code: 'unsupported_platform' };
  }
  try {
    const AppleHealthKit = await getMergedAppleHealthKitModule();
    /** Cadenas canónicas HK (coinciden con react-native-health `Permissions.js`). */
    const P = AppleHealthKit.Constants?.Permissions;
    const readPerms = [
      ...new Set([
        P?.StepCount ?? P?.Steps ?? 'StepCount',
        P?.DistanceWalkingRunning ?? 'DistanceWalkingRunning',
        P?.ActiveEnergyBurned ?? 'ActiveEnergyBurned',
        P?.Workout ?? 'Workout',
      ]),
    ].filter((x): x is string => typeof x === 'string' && x.length > 0);

    const permissions = {
      permissions: {
        read: readPerms,
        write: [] as string[],
      },
    };
    try {
      await new Promise<void>((resolve, reject) => {
        AppleHealthKit.initHealthKit!(permissions, (err: string) => {
          if (err) reject(new Error(String(err)));
          else resolve();
        });
      });
    } catch (e) {
      warnHealth('healthkit', e);
      const msg = e instanceof Error ? e.message : 'No se pudo inicializar Apple Salud.';
      if (/no está enlazado|AppleHealthKit/i.test(msg)) {
        return {
          ok: false,
          code: 'native_module_unavailable',
          message: appleHealthNativeUnavailableMessage(),
        };
      }
      return {
        ok: false,
        code: 'init_failed',
        message: msg,
      };
    }
    const readResult = await readAppleStepsCountToday(AppleHealthKit);
    if (!readResult.ok) {
      return { ok: false, code: 'read_failed', message: readResult.message };
    }

    const [distanceMeters, activeEnergyKcal, workoutSummary] = await Promise.all([
      readAppleDistanceMetersToday(AppleHealthKit),
      readAppleActiveEnergyKcalToday(AppleHealthKit),
      readAppleWorkoutsSummaryToday(AppleHealthKit),
    ]);

    return {
      ok: true,
      steps: readResult.value,
      distanceMeters,
      activeEnergyKcal,
      workoutCount: workoutSummary?.count ?? null,
      workoutKcal: workoutSummary ? workoutSummary.totalKcal : null,
      workoutDurationMin: workoutSummary ? workoutSummary.totalDurationMin : null,
    };
  } catch (e) {
    warnHealth('healthkit', e);
    return {
      ok: false,
      code: 'init_failed',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

async function getIosStepsToday(): Promise<number | null> {
  const r = await connectAppleHealthAndReadStepsToday();
  if (!r.ok) return null;
  return r.steps;
}

// ---------------------------------------------------------------------------
// Android: Health Connect (react-native-health-connect)
// ---------------------------------------------------------------------------

type HealthConnectModule = typeof import('react-native-health-connect');

function hasReadStepsPermission(
  granted: Array<{ accessType?: string; recordType?: string }> | null | undefined,
): boolean {
  if (!Array.isArray(granted)) return false;
  return granted.some((p) => p?.accessType === 'read' && p?.recordType === 'Steps');
}

function getGrantedHealthConnectPermissions(
  hc: HealthConnectModule,
): Promise<Array<{ accessType?: string; recordType?: string }>> {
  if (typeof hc.getGrantedPermissions !== 'function') return Promise.resolve([]);
  return hc.getGrantedPermissions() as Promise<Array<{ accessType?: string; recordType?: string }>>;
}

async function aggregateStepsToday(hc: HealthConnectModule): Promise<number> {
  const end = new Date();
  const start = startOfLocalDay(end);
  const result = await hc.aggregateRecord({
    recordType: 'Steps',
    timeRangeFilter: {
      operator: 'between',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
  });
  const n = typeof result?.COUNT_TOTAL === 'number' ? result.COUNT_TOTAL : 0;
  return Math.round(n);
}

async function aggregateDistanceMetersToday(hc: HealthConnectModule): Promise<number | null> {
  const end = new Date();
  const start = startOfLocalDay(end);
  try {
    const result = await hc.aggregateRecord({
      recordType: 'Distance',
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
    const dist = (result as { DISTANCE?: { inMeters?: number } })?.DISTANCE?.inMeters;
    if (typeof dist === 'number' && Number.isFinite(dist) && dist >= 0) {
      return Math.round(dist);
    }
    return null;
  } catch (e) {
    warnHealth('healthconnect', e);
    return null;
  }
}

async function aggregateActiveEnergyKcalToday(hc: HealthConnectModule): Promise<number | null> {
  const end = new Date();
  const start = startOfLocalDay(end);
  try {
    const result = await hc.aggregateRecord({
      recordType: 'ActiveCaloriesBurned',
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
    const k = (result as { ACTIVE_CALORIES_TOTAL?: { inKilocalories?: number } })?.ACTIVE_CALORIES_TOTAL
      ?.inKilocalories;
    if (typeof k === 'number' && Number.isFinite(k) && k >= 0) {
      return Math.round(k);
    }
    return null;
  } catch (e) {
    warnHealth('healthconnect', e);
    return null;
  }
}

export type AndroidHealthConnectConnectResult =
  | { ok: true; steps: number; distanceMeters: number | null; activeEnergyKcal: number | null }
  | {
      ok: false;
      code:
        | 'init_failed'
        | 'native_module_unavailable'
        | 'provider_update_required'
        | 'permission_denied'
        | 'read_failed'
        | 'unsupported_platform';
      message?: string;
    };

function isHealthConnectNotLinkedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("doesn't seem to be linked") ||
    msg.includes('rebuilt the app') ||
    msg.includes('not using Expo Go')
  );
}

const HC_READ_MVP: Permission[] = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
];

export async function connectAndroidHealthConnectAndReadStepsToday(): Promise<AndroidHealthConnectConnectResult> {
  return readAndroidHealthConnectSummaryToday({ requestPermissions: true });
}

async function readAndroidHealthConnectSummaryToday(opts: {
  requestPermissions: boolean;
}): Promise<AndroidHealthConnectConnectResult> {
  if (Platform.OS !== 'android') {
    return { ok: false, code: 'unsupported_platform' };
  }
  const HEALTH_CONNECT_EXPO_GO_MESSAGE =
    'Health Connect requiere un build con módulo nativo (EAS o development build). No está disponible en Expo Go.';

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hc = require('react-native-health-connect') as HealthConnectModule & { getSdkStatus?: () => Promise<unknown> };
    if (typeof hc.getSdkStatus !== 'function' || typeof hc.initialize !== 'function') {
      return { ok: false, code: 'native_module_unavailable', message: HEALTH_CONNECT_EXPO_GO_MESSAGE };
    }
    // Si Health Connect se actualiza en background, el binding al servicio puede caer y
    // getSdkStatus tira un error genérico. Reintentamos una vez tras un breve delay.
    let status: unknown;
    let sdkStatusFailed = false;
    try {
      status = await hc.getSdkStatus();
    } catch (e) {
      if (isHealthConnectNotLinkedError(e)) {
        return { ok: false, code: 'native_module_unavailable', message: HEALTH_CONNECT_EXPO_GO_MESSAGE };
      }
      try {
        await new Promise((r) => setTimeout(r, 250));
        status = await hc.getSdkStatus();
      } catch (e2) {
        if (isHealthConnectNotLinkedError(e2)) {
          return { ok: false, code: 'native_module_unavailable', message: HEALTH_CONNECT_EXPO_GO_MESSAGE };
        }
        warnHealth('healthconnect', e2);
        sdkStatusFailed = true;
        status = 0;
      }
    }
    const SdkAvailabilityStatus = hc.SdkAvailabilityStatus;
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return {
        ok: false,
        code: 'provider_update_required',
        message:
          'Actualiza «Health Connect» desde Play Store para que NutrIA pueda leer tus pasos.',
      };
    }
    // Si el status falló pero no era "not linked", seguimos intentando initialize()
    // — el binding puede recuperarse al re-llamar al módulo nativo.
    if (!sdkStatusFailed && status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
      return {
        ok: false,
        code: 'init_failed',
        message:
          'Health Connect no está disponible en este dispositivo. En Android 13 o inferior instala «Health Connect» desde Play Store.',
      };
    }
    let ok = false;
    try {
      ok = await hc.initialize();
    } catch (e) {
      if (isHealthConnectNotLinkedError(e)) {
        return { ok: false, code: 'native_module_unavailable', message: HEALTH_CONNECT_EXPO_GO_MESSAGE };
      }
      warnHealth('healthconnect', e);
    }
    if (!ok) {
      // Reintento único de initialize tras un breve delay, por si el servicio
      // estaba reiniciándose (típico tras update en background de Health Connect).
      try {
        await new Promise((r) => setTimeout(r, 300));
        ok = await hc.initialize();
      } catch (e) {
        if (isHealthConnectNotLinkedError(e)) {
          return { ok: false, code: 'native_module_unavailable', message: HEALTH_CONNECT_EXPO_GO_MESSAGE };
        }
        warnHealth('healthconnect', e);
      }
    }
    if (!ok) {
      return {
        ok: false,
        code: 'init_failed',
        message:
          'No se pudo inicializar Health Connect. Comprueba que esté instalado y actualizado.',
      };
    }
    const granted = opts.requestPermissions
      ? await hc.requestPermission(HC_READ_MVP)
      : await getGrantedHealthConnectPermissions(hc);
    if (!hasReadStepsPermission(granted)) {
      return { ok: false, code: 'permission_denied' };
    }
    try {
      const steps = await aggregateStepsToday(hc);
      const [distanceMeters, activeEnergyKcal] = await Promise.all([
        aggregateDistanceMetersToday(hc),
        aggregateActiveEnergyKcalToday(hc),
      ]);
      return { ok: true, steps, distanceMeters, activeEnergyKcal };
    } catch (e) {
      if (isHealthConnectNotLinkedError(e)) {
        return { ok: false, code: 'native_module_unavailable', message: HEALTH_CONNECT_EXPO_GO_MESSAGE };
      }
      warnHealth('healthconnect', e);
      return {
        ok: false,
        code: 'read_failed',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  } catch (e) {
    if (isHealthConnectNotLinkedError(e)) {
      return { ok: false, code: 'native_module_unavailable', message: HEALTH_CONNECT_EXPO_GO_MESSAGE };
    }
    warnHealth('healthconnect', e);
    return {
      ok: false,
      code: 'read_failed',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

type HealthConnectIntentsNative = {
  openManageHealthPermissionsForThisApp?: () => void;
  openHealthConnectSettings?: () => void;
};

function getHealthConnectIntentsModule(): HealthConnectIntentsNative | undefined {
  return NativeModules.HealthConnectIntents as HealthConnectIntentsNative | undefined;
}

export function openAndroidHealthConnectPermissionForThisApp(): void {
  if (Platform.OS !== 'android') return;
  try {
    getHealthConnectIntentsModule()?.openManageHealthPermissionsForThisApp?.();
  } catch {
    /* ignore */
  }
}

export function openAndroidHealthConnectSettings(): void {
  if (Platform.OS !== 'android') return;
  try {
    const nativeMod = getHealthConnectIntentsModule();
    if (nativeMod?.openHealthConnectSettings) {
      nativeMod.openHealthConnectSettings();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openHealthConnectSettings } = require('react-native-health-connect') as {
      openHealthConnectSettings: () => void;
    };
    openHealthConnectSettings();
  } catch {
    /* ignore */
  }
}

async function getAndroidStepsToday(): Promise<number | null> {
  const r = await readAndroidHealthConnectSummaryToday({ requestPermissions: false });
  if (!r.ok) return null;
  return r.steps;
}

// ---------------------------------------------------------------------------
// API pública multi-plataforma
// ---------------------------------------------------------------------------

export type HealthIntegrationFlags = {
  appleHealthEnabled?: boolean;
  googleFitEnabled?: boolean;
};

/**
 * Resumen nativo de hoy (zona horaria local). null si plataforma/web o integración desactivada.
 * Pasos null solo si la lectura principal falla; el resto puede ser null con permisos parciales.
 */
export async function getNativeActivitySummaryToday(
  flags: HealthIntegrationFlags,
): Promise<NativeActivitySummaryToday | null> {
  const r = await readNativeActivitySummaryTodayDetailed(flags);
  return r.ok ? r.summary : null;
}

export type NativeActivityReadFailureCode =
  | 'unsupported_platform'
  | 'integration_disabled'
  | 'native_module_unavailable'
  | 'permission_denied'
  | 'provider_update_required'
  | 'init_failed'
  | 'read_failed';

export type NativeActivityReadResult =
  | { ok: true; summary: NativeActivitySummaryToday }
  | { ok: false; code: NativeActivityReadFailureCode };

/**
 * Igual que getNativeActivitySummaryToday pero conservando el código de fallo,
 * para que callers puedan decidir si auto-recuperar (init_failed / read_failed transitorios).
 */
export async function readNativeActivitySummaryTodayDetailed(
  flags: HealthIntegrationFlags,
): Promise<NativeActivityReadResult> {
  if (Platform.OS === 'web') return { ok: false, code: 'unsupported_platform' };
  if (Platform.OS === 'ios') {
    if (!flags.appleHealthEnabled) return { ok: false, code: 'integration_disabled' };
    const r = await connectAppleHealthAndReadStepsToday();
    if (!r.ok) return { ok: false, code: r.code === 'unsupported_platform' ? 'unsupported_platform' : r.code };
    return {
      ok: true,
      summary: {
        steps: r.steps,
        distanceMeters: r.distanceMeters,
        activeEnergyKcal: r.activeEnergyKcal,
        activeMinutes: null,
        workoutCount: r.workoutCount,
        workoutKcal: r.workoutKcal,
        workoutDurationMin: r.workoutDurationMin,
      },
    };
  }
  if (Platform.OS === 'android') {
    if (!flags.googleFitEnabled) return { ok: false, code: 'integration_disabled' };
    const r = await readAndroidHealthConnectSummaryToday({ requestPermissions: false });
    if (!r.ok) return { ok: false, code: r.code === 'unsupported_platform' ? 'unsupported_platform' : r.code };
    return {
      ok: true,
      summary: {
        steps: r.steps,
        distanceMeters: r.distanceMeters,
        activeEnergyKcal: r.activeEnergyKcal,
        activeMinutes: null,
        workoutCount: null,
        workoutKcal: null,
        workoutDurationMin: null,
      },
    };
  }
  return { ok: false, code: 'unsupported_platform' };
}

/**
 * Lee pasos del sistema si el usuario activó la integración en ajustes.
 * Devuelve null cuando no hay datos válidos (no sobrescribir el backend en ese caso).
 */
export async function getNativeStepsToday(flags: HealthIntegrationFlags): Promise<number | null> {
  if (Platform.OS === 'web') return null;
  if (Platform.OS === 'ios' && !flags.appleHealthEnabled) return null;
  if (Platform.OS === 'android' && !flags.googleFitEnabled) return null;
  if (Platform.OS === 'ios') return getIosStepsToday();
  if (Platform.OS === 'android') return getAndroidStepsToday();
  return null;
}
