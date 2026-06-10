import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

type Extra = {
  apiUrl?: string;
  apiUrlWeb?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function pick(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/** URL del API tal como viene del .env (útil para móvil / LAN). */
const apiUrlFromEnv = pick(process.env.EXPO_PUBLIC_API_URL, extra.apiUrl);

/** Host del packager (LAN) que Metro/Expo inyecta; en dev build a veces falta `hostUri`. */
function hostFromExpoDevHostUri(): string | null {
  const raw = Constants.expoConfig?.hostUri;
  if (raw && typeof raw === 'string') {
    const host = raw.split(':')[0]?.trim();
    if (host) return host;
  }
  return null;
}

/** p. ej. `exp://192.168.1.10:8080` en sesión de desarrollo. */
function hostFromExperienceUrl(): string | null {
  const exp = (Constants as { experienceUrl?: string }).experienceUrl;
  if (!exp || typeof exp !== 'string') return null;
  const normalized = exp.startsWith('exp:') ? `http:${exp.slice(4)}` : exp;
  try {
    const u = new URL(normalized);
    return u.hostname || null;
  } catch {
    return null;
  }
}

/** URL del bundle HTTP (misma máquina que Metro) — útil cuando `hostUri` es null. */
function hostFromBundleScriptURL(): string | null {
  try {
    const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL;
    if (!scriptURL || scriptURL.startsWith('file:')) return null;
    const u = new URL(scriptURL);
    return u.hostname || null;
  } catch {
    return null;
  }
}

function packagerPrivateLanHost(): string | null {
  for (const h of [hostFromExpoDevHostUri(), hostFromExperienceUrl(), hostFromBundleScriptURL()]) {
    if (h && isPrivateLanIpv4(h)) return h;
  }
  return null;
}

/** Solo IPs privadas típicas de Wi‑Fi; evita usar túneles tipo `*.exp.direct` como API local. */
function isPrivateLanIpv4(host: string): boolean {
  if (!host || host === 'localhost' || host === '127.0.0.1') return false;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const m = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!m) return false;
  const second = Number(m[1]);
  return second >= 16 && second <= 31;
}

/**
 * En Expo Go / dev, si no hay `.env`, deduce `http://<misma-IP-que-Metro>:8000`.
 * Así el teléfono no usa `localhost` (que es el propio móvil).
 */
function devLanApiBaseFromPackagerHost(): string | null {
  if (!__DEV__) return null;
  const host = packagerPrivateLanHost();
  if (!host) return null;
  return `http://${host}:8000`;
}

function apiUrlLooksLikeLocalhost(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url.trim());
}

function assertProductionHttps(url: string): string {
  if (__DEV__) return url;
  const trimmed = url.trim();
  if (/^https:\/\//i.test(trimmed)) return url;
  throw new Error('La URL del API en producción debe usar HTTPS.');
}

/**
 * Detecta si `envUrl` apunta a una IP LAN diferente de la del packager (`inferredUrl`).
 * Ej.: .env tiene `172.31.28.12` (WSL) pero Metro corre en `192.168.1.10` (Wi-Fi real).
 * En ese caso el teléfono no puede alcanzar la IP de WSL.
 */
function apiUrlIsUnreachableLan(envUrl: string, inferredUrl: string): boolean {
  try {
    const envHost = new URL(envUrl.trim()).hostname;
    const inferredHost = new URL(inferredUrl.trim()).hostname;
    if (!isPrivateLanIpv4(envHost)) return false;
    return envHost !== inferredHost;
  } catch {
    return false;
  }
}

/** En dispositivo real, 127.0.0.1/localhost en EXPO_PUBLIC apunta al móvil, no al PC. */
function warnIfLocalhostOnNativeDevice(url: string) {
  if (!__DEV__ || Platform.OS === 'web') return;
  if (!apiUrlLooksLikeLocalhost(url)) return;
  console.warn(
    '[appEnv] EXPO_PUBLIC_API_URL es localhost: en un móvil físico el API no es alcanzable. ' +
      'Usa la IP de tu PC (ipconfig) o `npm run adb:reverse-api` y http://127.0.0.1:8000 por USB.',
  );
}

/**
 * Si la web se abre desde la LAN (p. ej. `http://192.168.1.10:8081` en el móvil),
 * el backend suele estar en el mismo host con el puerto 8000 — no en `127.0.0.1`
 * (eso apuntaría al propio teléfono y rompería avatares e imágenes).
 */
function webLanApiBaseFromWindow(): string | null {
  if (typeof window === 'undefined' || !window.location?.hostname) return null;
  const hostname = window.location.hostname.trim();
  if (!isPrivateLanIpv4(hostname)) return null;
  return `http://${hostname}:8000`;
}

/**
 * URL base del backend para peticiones HTTP.
 * En **web** en `localhost` / `127.0.0.1`, se usa el mismo hostname para que la cookie HttpOnly de sesión coincida.
 * Si abres la app desde la Wi‑Fi (`http://192.168.x.x:8081`), se usa `http://<esa-IP>:8000`
 * para que imágenes y fetch no apunten al propio móvil.
 * Opcional: `EXPO_PUBLIC_API_URL_WEB` para forzar otra URL en web.
 */
export function getApiBaseUrl(): string {
  const u = apiUrlFromEnv.trim();
  if (Platform.OS === 'web') {
    const webOverride = pick(process.env.EXPO_PUBLIC_API_URL_WEB, extra.apiUrlWeb);
    if (webOverride) return assertProductionHttps(webOverride);
    // Mismo host que la página web: evita desajustes localhost vs 127.0.0.1 (Chrome + fetch a loopback).
    if (typeof window !== 'undefined') {
      const h = window.location.hostname;
      // Misma máquina que el bundler: usar IPv4 literal evita que `localhost` resuelva a ::1
      // (uvicorn suele estar solo en IPv4) y errores tipo net::ERR_CONNECTION_RESET en Chrome/Edge.
      if (h === 'localhost' || h === '127.0.0.1') {
        return assertProductionHttps(`http://${h}:8000`);
      }
    }
    const winLan = webLanApiBaseFromWindow();
    if (winLan) {
      return assertProductionHttps(winLan);
    }
    if (!u || /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u)) {
      return assertProductionHttps('http://127.0.0.1:8000');
    }
    return assertProductionHttps(u);
  }

  const inferred = devLanApiBaseFromPackagerHost();
  let nativeBase: string;
  if (!u) {
    nativeBase = inferred ?? 'http://localhost:8000';
  } else if (__DEV__ && inferred && (apiUrlLooksLikeLocalhost(u) || apiUrlIsUnreachableLan(u, inferred))) {
    nativeBase = inferred;
  } else {
    nativeBase = u;
  }
  warnIfLocalhostOnNativeDevice(nativeBase);
  return assertProductionHttps(nativeBase);
}

/**
 * Sustituye el origen de una URL de asset (avatar, etc.) por el de `getApiBaseUrl()` actual.
 * Cubre: localhost, 127.0.0.1, y cualquier IP de LAN que ya no sea la IP activa del backend.
 */
export function normalizeBackendAssetUrl(absoluteUrl: string): string {
  const raw = absoluteUrl.trim();
  try {
    const parsed = new URL(raw);
    const currentBase = new URL(getApiBaseUrl().replace(/\/$/, ''));
    if (parsed.origin === currentBase.origin) return raw;
    return `${currentBase.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return raw;
  }
}

export const appEnv = {
  apiUrl: apiUrlFromEnv,
};
