import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ApiError, authGet, authPost, WEB_COOKIE_SESSION_TOKEN } from './api';

/** SecureStore only allows [a-zA-Z0-9._-] — no @ or / */
const TOKEN_KEY = 'nutriforce_access_token';
const LEGACY_TOKEN_KEY = '@nutriforce/access_token';
const REFRESH_TOKEN_KEY = 'nutriforce_refresh_token';
const USER_KEY = 'nutriforce_user_json';
const LEGACY_USER_KEY = '@nutriforce/user_json';

export type StoredUser = { id: string; email: string; email_verified?: boolean };
type AuthResponse = { access_token: string; refresh_token?: string | null; user: StoredUser };

async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return;
  }
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  }
}

async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const stored = await AsyncStorage.getItem(TOKEN_KEY);
    return stored?.trim() || null;
  }

  const secureToken = await SecureStore.getItemAsync(TOKEN_KEY);
  if (secureToken?.trim()) return secureToken;

  for (const key of [TOKEN_KEY, LEGACY_TOKEN_KEY] as const) {
    const legacyToken = await AsyncStorage.getItem(key);
    if (!legacyToken?.trim()) continue;
    await setToken(legacyToken.trim());
    await AsyncStorage.removeItem(key);
    return legacyToken.trim();
  }
  return null;
}

async function deleteToken(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.multiRemove([TOKEN_KEY, LEGACY_TOKEN_KEY]);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Continue with AsyncStorage cleanup regardless
  }
  await AsyncStorage.multiRemove([TOKEN_KEY, LEGACY_TOKEN_KEY]);
}

async function setRefreshToken(token: string | null | undefined): Promise<void> {
  if (Platform.OS === 'web') {
    if (token?.trim()) {
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token.trim());
    } else {
      await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
    }
    return;
  }
  if (token?.trim()) {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token.trim(), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token.trim());
    }
  } else {
    try {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      // Ignore — best effort
    }
  }
}

async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const token = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    return token?.trim() || null;
  }
  const token = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  return token?.trim() || null;
}

async function deleteRefreshToken(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Ignore — best effort
  }
}

async function setStoredUser(user: StoredUser): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    return;
  }
  try {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  await AsyncStorage.removeItem(LEGACY_USER_KEY);
}

async function getStoredUser(): Promise<StoredUser | null> {
  if (Platform.OS === 'web') {
    const raw = await AsyncStorage.getItem(USER_KEY);
    if (!raw?.trim()) return null;
    try {
      const user = JSON.parse(raw) as StoredUser;
      return user?.id ? user : null;
    } catch {
      return null;
    }
  }

  const rawSecure = await SecureStore.getItemAsync(USER_KEY);
  const raw = rawSecure?.trim() ? rawSecure : await AsyncStorage.getItem(LEGACY_USER_KEY);
  if (!raw?.trim()) return null;

  try {
    const user = JSON.parse(raw) as StoredUser;
    if (!user?.id) return null;
    if (!rawSecure?.trim()) {
      await setStoredUser(user);
    }
    return user;
  } catch {
    return null;
  }
}

async function deleteStoredUser(): Promise<void> {
  if (Platform.OS !== 'web') {
    try {
      await SecureStore.deleteItemAsync(USER_KEY);
    } catch {
      // Ignore — best effort
    }
  }
  await AsyncStorage.removeItem(LEGACY_USER_KEY);
}

export async function saveAuth(token: string, user: StoredUser, refreshToken?: string | null): Promise<void> {
  await Promise.all([
    setToken(token),
    setStoredUser(user),
    setRefreshToken(refreshToken),
  ]);
}

export async function refreshAuth(): Promise<{ token: string; user: StoredUser; refreshToken?: string | null } | null> {
  const refreshToken = await getRefreshToken();
  try {
    const data = await authPost<AuthResponse>('/api/v1/auth/refresh', refreshToken ? { refresh_token: refreshToken } : {});
    if (!data?.user?.id) return null;
    const sessionToken = Platform.OS === 'web' ? WEB_COOKIE_SESSION_TOKEN : data.access_token;
    await saveAuth(sessionToken, data.user, data.refresh_token ?? null);
    return { token: sessionToken, user: data.user, refreshToken: data.refresh_token ?? null };
  } catch {
    await Promise.all([deleteToken(), deleteRefreshToken(), deleteStoredUser()]);
    return null;
  }
}

export async function loadAuth(): Promise<{ token: string; user: StoredUser; refreshToken?: string | null } | null> {
  if (Platform.OS === 'web') {
    const [token, raw, refreshToken] = await Promise.all([
      getToken(),
      getStoredUser(),
      getRefreshToken(),
    ]);
    if (!token?.trim()) return refreshToken ? refreshAuth() : null;
    try {
      const user = await authGet<StoredUser>('/api/v1/auth/session', token.trim());
      if (user?.id) return { token: token.trim(), user, refreshToken };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        return refreshAuth();
      }
    }
    return raw?.id ? { token: token.trim(), user: raw, refreshToken } : null;
  }

  const [token, raw, refreshToken] = await Promise.all([
    getToken(),
    getStoredUser(),
    getRefreshToken(),
  ]);
  if (!raw?.id) return null;
  if (!token?.trim()) return refreshToken ? refreshAuth() : null;
  try {
    const user = await authGet<StoredUser>('/api/v1/auth/session', token.trim());
    if (user?.id) {
      await saveAuth(token.trim(), user, refreshToken);
      return { token: token.trim(), user, refreshToken };
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      return refreshAuth();
    }
    return { token: token.trim(), user: raw, refreshToken };
  }
  return { token: token.trim(), user: raw, refreshToken };
}

export async function clearAuth(): Promise<void> {
  const refreshToken = await getRefreshToken();
  await authPost('/api/v1/auth/logout', refreshToken ? { refresh_token: refreshToken } : {}).catch(() => {});
  await Promise.all([
    deleteToken(),
    deleteRefreshToken(),
    deleteStoredUser(),
  ]);
}
