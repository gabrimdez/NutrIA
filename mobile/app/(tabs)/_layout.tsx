import React, { useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Tabs, usePathname, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, borderRadius, elevation, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../src/theme';
import { TabIcon } from '../../src/components/mainTabBarIcons';

type TabKey = 'home' | 'training' | 'plan' | 'chat' | 'profile';

const TAB_CFG: { key: TabKey; label: string; route: string }[] = [
  { key: 'home', label: 'Inicio', route: '/(tabs)' },
  { key: 'training', label: 'Entreno', route: '/training' },
  { key: 'plan', label: 'Plan', route: '/(tabs)/plan' },
  { key: 'chat', label: 'Coach', route: '/(tabs)/chat' },
  { key: 'profile', label: 'Perfil', route: '/(tabs)/profile' },
];

function CustomTabBar() {
  const insets = useSafeAreaInsets();
  const dockBottom = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM);
  const pathname = usePathname();

  const activeTab: TabKey =
    pathname.startsWith('/training') ? 'training'
    : pathname.startsWith('/plan') ? 'plan'
    : pathname.startsWith('/chat') ? 'chat'
    : pathname.startsWith('/profile') ? 'profile'
    : 'home';

  const go = useCallback(
    (route: string) => {
      // Perfil: dismissTo (POP_TO) no cambia de pestaña si no hay stack que cerrar (p. ej. desde Inicio en web).
      // Desde /profile/* seguimos usando dismissTo para volver a la raíz del tab sin confundir rutas.
      if (route === '/(tabs)/profile') {
        if (pathname.startsWith('/profile/')) {
          router.dismissTo('/(tabs)/profile' as never);
        } else {
          router.replace('/(tabs)/profile' as never);
        }
        return;
      }
      router.replace(route as never);
    },
    [pathname],
  );

  if (pathname === '/premium') return null;

  return (
    <View style={[styles.bar, { bottom: dockBottom }]}>
      {TAB_CFG.map(({ key, label, route }) => {
        const focused = activeTab === key;
        const tint = focused ? colors.primaryLight : colors.tabInactive;
        return (
          <TouchableOpacity
            key={key}
            style={styles.item}
            onPress={() => go(route)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
          >
            <TabIcon
              name={key as 'home' | 'training' | 'plan' | 'chat' | 'profile'}
              focused={focused}
              color={tint}
              label={label}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={() => <CustomTabBar />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="training" />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="search-shortcut" options={{ href: null }} />
      <Tabs.Screen name="diary" options={{ href: null }} />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="premium" options={{ href: null }} />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: DOCK_H,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dockBackground,
    borderRadius: borderRadius.xxxl,
    borderWidth: 1,
    borderColor: colors.dockBorder,
    ...Platform.select({
      ios: elevation.floating,
      android: elevation.floating,
      default: { boxShadow: '0 6px 24px rgba(0,0,0,0.4)' },
    }),
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
});
