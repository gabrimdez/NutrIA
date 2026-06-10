import { getApiBaseUrl, normalizeBackendAssetUrl } from './appEnv';

export function resolveBadgeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return normalizeBackendAssetUrl(url);
  const path = url.startsWith('/') ? url : `/${url}`;
  return normalizeBackendAssetUrl(`${getApiBaseUrl()}${path}`);
}
