import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { nextBadgeCursorIso, parseBadgeUnlockTimeMs } from '../lib/badgeUnlockTime';
import type { BadgeCatalogItem } from '../types/badges';

import { useAuthStore } from './authStore';

const storageKeyFor = (userId: string) => `badges.lastSeenAt:${userId}`;

type BadgeNotificationState = {
  lastSeenAt: string | null;
  queue: BadgeCatalogItem[];
  current: BadgeCatalogItem | null;
  /** Storage loaded for the active user. */
  hydrated: boolean;
  userId: string | null;
  hydrate: () => Promise<void>;
  /** If no `lastSeenAt` for this user, set to now to avoid toasts for historical unlocks. */
  ensureInitialized: () => Promise<void>;
  setLastSeenAt: (iso: string) => Promise<void>;
  enqueue: (items: BadgeCatalogItem[]) => void;
  /** Called when exit animation finished (or immediate advance). */
  showNext: () => void;
  /** Remove current, promote next in queue. */
  dismiss: () => void;
  clearSession: () => void;
};

function dedupeByBadgeId(
  incoming: BadgeCatalogItem[],
  current: BadgeCatalogItem | null,
  existingQueue: BadgeCatalogItem[],
): BadgeCatalogItem[] {
  const seen = new Set<string | undefined>([
    current?.badge_id,
    ...existingQueue.map((x) => x.badge_id),
  ]);
  return incoming.filter((b) => b.badge_id && b.unlocked && !seen.has(b.badge_id));
}

export const useBadgeNotificationStore = create<BadgeNotificationState>((set, get) => ({
  lastSeenAt: null,
  queue: [],
  current: null,
  hydrated: false,
  userId: null,

  clearSession: () => {
    set({ lastSeenAt: null, queue: [], current: null, hydrated: false, userId: null });
  },

  hydrate: async () => {
    const userId = useAuthStore.getState().user?.id ?? null;
    if (!userId) {
      set({ hydrated: true, userId: null, lastSeenAt: null });
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(storageKeyFor(userId));
      set({ lastSeenAt: raw, hydrated: true, userId, queue: [], current: null });
    } catch {
      set({ lastSeenAt: null, hydrated: true, userId, queue: [], current: null });
    }
  },

  ensureInitialized: async () => {
    const { lastSeenAt, userId, setLastSeenAt } = get();
    if (!userId) return;
    if (lastSeenAt) return;
    const now = new Date().toISOString();
    await setLastSeenAt(now);
  },

  setLastSeenAt: async (iso: string) => {
    const { userId } = get();
    if (!userId) return;
    set({ lastSeenAt: iso });
    try {
      await AsyncStorage.setItem(storageKeyFor(userId), iso);
    } catch {
      // ignore
    }
  },

  enqueue: (items) => {
    if (!items.length) return;
    set((s) => {
      const toAdd = dedupeByBadgeId(items, s.current, s.queue);
      if (!toAdd.length) return s;
      const newQueue = [...s.queue, ...toAdd];
      if (s.current) return { ...s, queue: newQueue };
      return { current: newQueue[0]!, queue: newQueue.slice(1) };
    });
  },

  showNext: () => {
    set((s) => {
      if (!s.queue.length) return { current: null, queue: [] };
      return { current: s.queue[0]!, queue: s.queue.slice(1) };
    });
  },

  dismiss: () => {
    get().showNext();
  },
}));

/**
 * Pide al servidor las insignias con `unlocked_at` &gt; `lastSeenAt`, pone toasts y actualiza el cursor.
 * Invalida caché de catálogo / destacadas.
 */
let checkForNewBadgesChain: Promise<void> = Promise.resolve();

export function checkForNewBadges(queryClient: QueryClient): Promise<void> {
  checkForNewBadgesChain = checkForNewBadgesChain
    .then(() => runCheckForNewBadges(queryClient))
    .catch(() => {
      // runCheckForNewBadges ya traga errores; esto mantiene la cadena viva
    });
  return checkForNewBadgesChain;
}

async function runCheckForNewBadges(queryClient: QueryClient): Promise<void> {
  const { session, user } = useAuthStore.getState();
  if (!session || !user?.id) return;

  const s = useBadgeNotificationStore.getState();
  if (s.userId !== user.id) {
    await s.hydrate();
  }
  if (!useBadgeNotificationStore.getState().hydrated) {
    await useBadgeNotificationStore.getState().hydrate();
  }
  if (!useBadgeNotificationStore.getState().lastSeenAt) {
    await useBadgeNotificationStore.getState().ensureInitialized();
  }

  const lastSeenAt = useBadgeNotificationStore.getState().lastSeenAt;
  if (!lastSeenAt) return;

  const q = new URLSearchParams();
  q.set('since', lastSeenAt);
  q.set('limit', '20');
  const path = `/api/v1/me/badges/recent?${q.toString()}`;

  try {
    const items = await api.get<BadgeCatalogItem[]>(path);
    if (!items.length) return;

    const baseMs = parseBadgeUnlockTimeMs(lastSeenAt) ?? 0;
    let maxMs = baseMs;
    let anyUnlockTime = false;
    for (const b of items) {
      const t = parseBadgeUnlockTimeMs(b.unlocked_at);
      if (t == null) continue;
      anyUnlockTime = true;
      if (t > maxMs) maxMs = t;
    }
    if (!anyUnlockTime) {
      maxMs = Math.max(maxMs, Date.now());
    }
    await useBadgeNotificationStore.getState().setLastSeenAt(nextBadgeCursorIso(maxMs));
    // Cola: más antigua primero para mostrar en orden lógico.
    const sorted = [...items].sort((a, b) => {
      const ta = parseBadgeUnlockTimeMs(a.unlocked_at) ?? 0;
      const tb = parseBadgeUnlockTimeMs(b.unlocked_at) ?? 0;
      return ta - tb;
    });
    useBadgeNotificationStore.getState().enqueue(sorted);
    void queryClient.invalidateQueries({ queryKey: ['badges-catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['badges-featured'] });
  } catch {
    // Silencio: el usuario puede ir offline; reintentará con foreground / mutación.
  }
}
