import { describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_APP_SETTINGS } from './appSettings';
import {
  areWearableMocksEnabled,
  canSyncRealWearableData,
  MSG_SYNC_NO_DEVICE,
  MSG_UNAVAILABLE_PROVIDER,
  MSG_WEB_NO_DIRECT,
} from './wearableActivityPolicy';
import type { AppSettings } from '../types';

function settings(partial: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...partial,
    integration_preferences: {
      ...DEFAULT_APP_SETTINGS.integration_preferences,
      ...(partial.integration_preferences ?? {}),
    },
    integration_status: {
      ...DEFAULT_APP_SETTINGS.integration_status,
      ...(partial.integration_status ?? {}),
    },
  };
}

describe('areWearableMocksEnabled', () => {
  const prev = process.env.EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS;

  afterEach(() => {
    process.env.EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS = prev;
  });

  it('returns false when dev is false', () => {
    expect(areWearableMocksEnabled(false)).toBe(false);
    process.env.EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS = 'true';
    expect(areWearableMocksEnabled(false)).toBe(false);
  });

  it('returns false when env is not true even if dev true', () => {
    delete process.env.EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS;
    expect(areWearableMocksEnabled(true)).toBe(false);
    process.env.EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS = '0';
    expect(areWearableMocksEnabled(true)).toBe(false);
  });

  it('returns true only when dev true and env true', () => {
    process.env.EXPO_PUBLIC_ENABLE_WEARABLE_MOCKS = 'true';
    expect(areWearableMocksEnabled(true)).toBe(true);
  });
});

describe('canSyncRealWearableData', () => {
  it('blocks web', () => {
    const s = settings({});
    const r = canSyncRealWearableData('apple_health', 'web', s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(MSG_WEB_NO_DIRECT);
  });

  it('blocks apple on android', () => {
    const s = settings({
      integration_preferences: { apple_health_enabled: true, google_fit_enabled: false, calendar_sync_enabled: false },
      integration_status: { apple_health: 'connected', google_fit: 'disabled', calendar: 'disabled' },
    });
    const r = canSyncRealWearableData('apple_health', 'android', s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(MSG_UNAVAILABLE_PROVIDER);
  });

  it('blocks sync when apple not connected on server', () => {
    const s = settings({
      integration_preferences: { apple_health_enabled: true, google_fit_enabled: false, calendar_sync_enabled: false },
      integration_status: { apple_health: 'permission_denied', google_fit: 'disabled', calendar: 'disabled' },
    });
    const r = canSyncRealWearableData('apple_health', 'ios', s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(MSG_SYNC_NO_DEVICE);
  });

  it('allows sync when apple connected on ios', () => {
    const s = settings({
      integration_preferences: { apple_health_enabled: true, google_fit_enabled: false, calendar_sync_enabled: false },
      integration_status: { apple_health: 'connected', google_fit: 'disabled', calendar: 'disabled' },
    });
    expect(canSyncRealWearableData('apple_health', 'ios', s)).toEqual({ ok: true });
  });

  it('blocks xiaomi always', () => {
    const s = settings({});
    const r = canSyncRealWearableData('xiaomi_mi_fitness', 'ios', s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(MSG_UNAVAILABLE_PROVIDER);
  });
});
