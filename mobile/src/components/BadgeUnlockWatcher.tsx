import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../store/authStore';
import { checkForNewBadges, useBadgeNotificationStore } from '../store/badgeNotificationStore';

const DEBOUNCE_MS = 400;

/**
 * Sincroniza `lastSeenAt`, hace comprobación al volver a primer plano y
 * poco después de que cualquier mutación tenga éxito (p. ej. comida, peso, plan).
 */
export function BadgeUnlockWatcher() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const userId = useAuthStore((s) => s.user?.id);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDebouncedCheck = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void checkForNewBadges(queryClient);
    }, DEBOUNCE_MS);
  }, [queryClient]);

  useEffect(() => {
    if (!session || !userId) {
      useBadgeNotificationStore.getState().clearSession();
      return;
    }
    void useBadgeNotificationStore.getState().hydrate();
  }, [session, userId]);

  useEffect(() => {
    if (!session) return;

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && useAuthStore.getState().session) {
        void checkForNewBadges(queryClient);
      }
    });

    return () => {
      sub.remove();
    };
  }, [session, queryClient]);

  useEffect(() => {
    if (!session) return;

    const cache = queryClient.getMutationCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type === 'updated' && event.mutation?.state?.status === 'success') {
        runDebouncedCheck();
      }
    });
    return () => {
      unsubscribe();
    };
  }, [session, queryClient, runDebouncedCheck]);

  return null;
}
