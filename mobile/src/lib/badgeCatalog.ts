import { Image as ExpoImage } from 'expo-image';
import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import { resolveBadgeImageUrl } from './badgeImageUrl';
import type { BadgeCatalogItem } from '../types/badges';

export const BADGE_CATALOG_STALE_MS = 1000 * 60 * 10;
export const BADGE_CATALOG_TABS = ['all', 'unlocked', 'locked'] as const;

export type BadgeCatalogStatus = (typeof BADGE_CATALOG_TABS)[number];

export function buildBadgeCatalogUrl(status: BadgeCatalogStatus): string {
  const p = new URLSearchParams();
  p.set('status', status);
  return `/api/v1/me/badges/catalog?${p.toString()}`;
}

export function getBadgeCatalogQueryOptions(status: BadgeCatalogStatus) {
  return {
    queryKey: ['badges-catalog', status, 'rarity-sort'] as const,
    queryFn: () => api.get<BadgeCatalogItem[]>(buildBadgeCatalogUrl(status)),
    staleTime: BADGE_CATALOG_STALE_MS,
  };
}

export async function prefetchBadgeCatalogs(queryClient: QueryClient): Promise<void> {
  const settled = await Promise.allSettled(
    BADGE_CATALOG_TABS.map((status) => queryClient.fetchQuery(getBadgeCatalogQueryOptions(status))),
  );

  const imageUrls = [
    ...new Set(
      settled
        .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
        .map((badge) => resolveBadgeImageUrl(badge.image_url))
        .filter((url): url is string => !!url),
    ),
  ];

  if (!imageUrls.length) return;

  try {
    await ExpoImage.prefetch(imageUrls, 'memory-disk');
  } catch {
    /* noop: si el precache de imagen falla, la pantalla sigue funcionando */
  }
}
