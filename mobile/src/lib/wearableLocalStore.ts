import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { areWearableMocksEnabled, isRealActivitySnapshot } from './wearableActivityPolicy';
import type { ActivityData } from './wearableActivityTypes';
import type { WearableProviderId } from './wearableActivityTypes';

/**
 * Caché local de snapshots con `source` explícita; flags de mock solo si mocks de desarrollo activos.
 * Al desactivar mocks se purgan datos no reales en `sanitizeWearableHubLocal`.
 */
const STORAGE_KEY = '@nutriforce/wearable_hub_local_v1';
const SECURE_STORAGE_KEY = 'nutriforce_wearable_hub_local_v1';

export type WearableHubLocalState = {
  mockDemoByProvider: Partial<Record<WearableProviderId, { lastSyncAt?: string }>>;
  snapshots: Partial<Record<WearableProviderId, ActivityData>>;
};

const EMPTY: WearableHubLocalState = {
  mockDemoByProvider: {},
  snapshots: {},
};

async function readStoredWearableHub(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(STORAGE_KEY);
  }

  const secure = await SecureStore.getItemAsync(SECURE_STORAGE_KEY);
  if (secure?.trim()) return secure;

  const legacy = await AsyncStorage.getItem(STORAGE_KEY);
  if (legacy?.trim()) {
    await SecureStore.setItemAsync(SECURE_STORAGE_KEY, legacy, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
  return legacy;
}

async function writeStoredWearableHub(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(STORAGE_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(SECURE_STORAGE_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function sanitizeWearableHubLocal(raw: WearableHubLocalState): WearableHubLocalState {
  const mocksOn = areWearableMocksEnabled();
  const nextDemo: WearableHubLocalState['mockDemoByProvider'] = {};
  if (mocksOn) {
    Object.assign(nextDemo, raw.mockDemoByProvider);
  }
  const nextSnap: WearableHubLocalState['snapshots'] = {};
  for (const [k, snap] of Object.entries(raw.snapshots)) {
    if (!snap) continue;
    const pid = k as WearableProviderId;
    if (snap.source === 'dev_mock') {
      if (mocksOn) nextSnap[pid] = snap;
      continue;
    }
    if (isRealActivitySnapshot(snap.source)) {
      nextSnap[pid] = snap;
    }
  }
  return { mockDemoByProvider: nextDemo, snapshots: nextSnap };
}

export async function loadWearableHubLocal(): Promise<WearableHubLocalState> {
  try {
    const raw = await readStoredWearableHub();
    if (!raw) return { ...EMPTY, mockDemoByProvider: {}, snapshots: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY, mockDemoByProvider: {}, snapshots: {} };
    const o = parsed as Partial<WearableHubLocalState>;
    const merged: WearableHubLocalState = {
      mockDemoByProvider: { ...(o.mockDemoByProvider ?? {}) },
      snapshots: { ...(o.snapshots ?? {}) },
    };
    const sanitized = sanitizeWearableHubLocal(merged);
    const dirty = JSON.stringify(merged) !== JSON.stringify(sanitized);
    if (dirty) {
      await writeStoredWearableHub(JSON.stringify(sanitized));
    }
    return sanitized;
  } catch {
    return { ...EMPTY, mockDemoByProvider: {}, snapshots: {} };
  }
}

export async function saveWearableHubLocal(next: WearableHubLocalState): Promise<void> {
  await writeStoredWearableHub(JSON.stringify(sanitizeWearableHubLocal(next)));
}

export async function patchWearableHubLocal(
  patch: (prev: WearableHubLocalState) => WearableHubLocalState,
): Promise<WearableHubLocalState> {
  const prev = await loadWearableHubLocal();
  const merged = patch(prev);
  const sanitized = sanitizeWearableHubLocal(merged);
  await saveWearableHubLocal(sanitized);
  return sanitized;
}
