import React, { useEffect } from 'react';
import { AppState, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/lib/queryClient';
import { loadAuth } from '../src/lib/authStorage';
import { configureNotificationHandling, syncLocalNotificationPreferencesFromServer } from '../src/lib/notificationSettings';
import { evaluateAndScheduleSmartNotifications } from '../src/lib/smartNotifications';
import { BadgeToast } from '../src/components/BadgeToast';
import { BadgeUnlockWatcher } from '../src/components/BadgeUnlockWatcher';
import { EmailVerificationRequiredHost } from '../src/components/EmailVerificationRequiredHost';
import { PremiumLockHost } from '../src/components/PremiumLockHost';
import { useAuthStore } from '../src/store/authStore';
import { colors } from '../src/theme';

export default function RootLayout() {
  const { setAuth, setIsLoading, session, isLoading } = useAuthStore();
  const showBadgeUi = Boolean(session) && !isLoading;

  useEffect(() => {
    configureNotificationHandling();

    let alive = true;
    loadAuth()
      .then((data) => {
        if (!alive) return;
        if (data) {
          setAuth(data.token, data.user, data.refreshToken);
          syncLocalNotificationPreferencesFromServer().catch(() => {});
        } else {
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (alive) setIsLoading(false);
      });

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        evaluateAndScheduleSmartNotifications().catch(() => {});
      }
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, [setAuth, setIsLoading]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
          }}
        />
        {showBadgeUi ? (
          <>
            <BadgeUnlockWatcher />
            <BadgeToast />
          </>
        ) : null}
        <PremiumLockHost />
        <EmailVerificationRequiredHost />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
