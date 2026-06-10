import React, { useEffect } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { LoadingScreen } from '../src/components';

export default function Index() {
  const { session, isLoading } = useAuthStore();
  const rootNavigation = useRootNavigationState();

  useEffect(() => {
    if (isLoading || !rootNavigation?.key) return;
    if (!session) {
      router.replace('/auth/login');
    } else {
      router.replace('/(tabs)');
    }
  }, [session, isLoading, rootNavigation?.key]);

  return <LoadingScreen />;
}
