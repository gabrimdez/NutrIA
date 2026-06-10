import { Platform } from 'react-native';
import { getApiBaseUrl } from './appEnv';
import { showEmailVerificationRequired } from './emailVerificationRequired';
import { toUserFacingErrorMessage } from './userFacingError';
import { useAuthStore } from '../store/authStore';

/** Por encima de timeouts de BD en el servidor (~25s) para poder recibir 5xx con cuerpo en vez de AbortError. */
const FETCH_TIMEOUT_MS = Platform.OS === 'web' ? 35_000 : 25_000;

/** Forma estable que el backend FastAPI devuelve en respuestas no-OK. */
export type ApiErrorBody = {
  detail?: unknown;
  error_code?: string;
};

export class ApiError extends Error {
  status: number;
  detail: unknown;
  errorCode?: string;

  constructor(message: string, status: number, detail?: unknown, errorCode?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.errorCode = errorCode;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export type ApiRequestOptions = {
  timeoutMs?: number;
  /** Si el servidor responde 404, devuelve `null` en lugar de lanzar (útil p.ej. sin plan activo). Solo GET. */
  nullOn404?: boolean;
};

export const WEB_COOKIE_SESSION_TOKEN = '__web_cookie_session__';
const CSRF_COOKIE_NAME = 'nutriforce_csrf_token';

function buildBackendOfflineMessage(): string {
  return `No se pudo conectar con el servidor. Comprueba tu conexión a internet e inténtalo de nuevo.`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        `El servidor no respondió a tiempo. Comprueba tu conexión e inténtalo de nuevo.`,
      );
    }
    if (e instanceof Error) {
      const message = e.message.toLowerCase();
      if (
        message.includes('failed to fetch') ||
        message.includes('network request failed') ||
        message.includes('load failed') ||
        message.includes('connection reset') ||
        message.includes('err_connection_reset') ||
        message.includes('ecconnreset') ||
        message.includes('network connection was lost')
      ) {
        throw new Error(buildBackendOfflineMessage());
      }
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function formatApiDetail(detail: unknown, status: number): string {
  if (typeof detail === 'string') return toUserFacingErrorMessage(detail, `Error ${status}`);
  if (Array.isArray(detail)) {
    const merged = detail
      .map((d) =>
        typeof d === 'object' && d !== null && 'msg' in d ? String((d as { msg: string }).msg) : JSON.stringify(d),
      )
      .join('; ');
    return toUserFacingErrorMessage(merged, `Error ${status}`);
  }
  return toUserFacingErrorMessage(`Error ${status}`, `Error ${status}`);
}

function isEmailVerificationRequired(status: number, message: string): boolean {
  return status === 403 && message.toLowerCase().includes('verifica tu email');
}

function readCookie(name: string): string | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const part = document.cookie
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : null;
}

export function getCsrfHeaders(): Record<string, string> {
  const token = readCookie(CSRF_COOKIE_NAME);
  return token ? { 'X-CSRF-Token': token } : {};
}

async function resolveAccessToken(): Promise<string> {
  const token = useAuthStore.getState().session?.access_token;
  if (token) return token;
  throw new Error('No hay sesión activa. Inicia sesión de nuevo.');
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const access_token = await resolveAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!(Platform.OS === 'web' && access_token === WEB_COOKIE_SESSION_TOKEN)) {
    headers.Authorization = `Bearer ${access_token}`;
  } else {
    Object.assign(headers, getCsrfHeaders());
  }
  return headers;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { refreshAuth } = await import('./authStorage');
      const refreshed = await refreshAuth();
      if (!refreshed) {
        useAuthStore.getState().signOut();
        return false;
      }
      useAuthStore.getState().setAuth(refreshed.token, refreshed.user, refreshed.refreshToken);
      return true;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: ApiRequestOptions,
  didRetryAuth = false,
): Promise<T> {
  const headers = await getAuthHeaders();
  const url = `${getApiBaseUrl()}${path}`;
  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;

  const config: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  const response = await fetchWithTimeout(
    url,
    { ...config, credentials: Platform.OS === 'web' ? 'include' : 'same-origin' },
    timeoutMs,
  );

  if (!response.ok) {
    if (method === 'GET' && options?.nullOn404 && response.status === 404) {
      return null as T;
    }
    if (response.status === 401 && !didRetryAuth && !path.includes('/api/v1/auth/')) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return apiRequest<T>(method, path, body, options, true);
      }
    }
    const error: ApiErrorBody = await response.json().catch(() => ({ detail: 'Algo salió mal' }));
    let msg = formatApiDetail(error.detail, response.status);
    if (response.status === 401) {
      msg += ' Tu sesión puede haber expirado. Inicia sesión de nuevo.';
    }
    if (isEmailVerificationRequired(response.status, msg)) {
      showEmailVerificationRequired(msg);
    }
    throw new ApiError(msg || `Error ${response.status}`, response.status, error.detail, error.error_code);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

/** Generación de plan / sustitutos Groq: el backend puede tardar varios minutos (TPM). */
export const PLAN_API_TIMEOUT_MS = 600_000;

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) => apiRequest<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: ApiRequestOptions) => apiRequest<T>('DELETE', path, undefined, options),
};

/** Login / registro (sin cabecera Authorization). */
export async function authPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Platform': Platform.OS,
      ...getCsrfHeaders(),
    },
    body: JSON.stringify(body),
    credentials: Platform.OS === 'web' ? 'include' : 'same-origin',
  });
  if (!response.ok) {
    const error: ApiErrorBody = await response.json().catch(() => ({ detail: 'Algo salió mal' }));
    throw new ApiError(
      toUserFacingErrorMessage(formatApiDetail(error.detail, response.status), `Error ${response.status}`) ||
        `Error ${response.status}`,
      response.status,
      error.detail,
      error.error_code,
    );
  }
  return response.json();
}

export async function authGet<T>(path: string, accessToken?: string | null): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken?.trim() && accessToken !== WEB_COOKIE_SESSION_TOKEN) {
    headers.Authorization = `Bearer ${accessToken.trim()}`;
  }
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers,
    credentials: Platform.OS === 'web' ? 'include' : 'same-origin',
  });
  if (!response.ok) {
    const error: ApiErrorBody = await response.json().catch(() => ({ detail: 'Algo salió mal' }));
    throw new ApiError(
      toUserFacingErrorMessage(formatApiDetail(error.detail, response.status), `Error ${response.status}`) ||
        `Error ${response.status}`,
      response.status,
      error.detail,
      error.error_code,
    );
  }
  return response.json();
}
