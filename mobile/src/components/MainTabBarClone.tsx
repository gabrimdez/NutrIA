import React, { useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { colors, borderRadius, elevation, DOCK_H, DOCK_MARGIN_BOTTOM } from '../theme';
import { TabIcon, SmartSearchIcon } from './mainTabBarIcons';

export type MainTabBarCloneActive = 'home' | 'search' | 'plan' | 'chat' | 'profile';

type Props = {
  activeTab: MainTabBarCloneActive;
  mealType?: string;
  diaryDateStr?: string;
  /** false = fila estática bajo otro control (p. ej. SearchActionBar); true = dock flotante (por defecto). */
  floating?: boolean;
};

const LABELS: Record<MainTabBarCloneActive, string> = {
  home: 'Inicio',
  search: 'Buscar',
  plan: 'Plan',
  chat: 'Coach',
  profile: 'Perfil',
};

export default function MainTabBarClone({ activeTab, mealType, diaryDateStr, floating = true }: Props) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const dockBottom = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM);

  const goHome = useCallback(() => {
    router.replace('/(tabs)' as never);
  }, []);

  const goSearch = useCallback(() => {
    if (mealType && diaryDateStr) {
      router.replace(
        `/(tabs)/search?meal_type=${encodeURIComponent(mealType)}&date=${encodeURIComponent(diaryDateStr)}` as never,
      );
    } else {
      router.replace('/(tabs)/search' as never);
    }
  }, [mealType, diaryDateStr]);

  const goPlan = useCallback(() => {
    router.replace('/(tabs)/plan' as never);
  }, []);

  const goChat = useCallback(() => {
    router.replace('/(tabs)/chat' as never);
  }, []);

  const goProfile = useCallback(() => {
    if (pathname.startsWith('/profile/')) {
      router.dismissTo('/(tabs)/profile' as never);
    } else {
      router.replace('/(tabs)/profile' as never);
    }
  }, [pathname]);

  const tabs: MainTabBarCloneActive[] = ['home', 'search', 'plan', 'chat', 'profile'];

  return (
    <View
      style={[
        styles.barCore,
        floating
          ? [styles.barFloating, { bottom: dockBottom }]
          : styles.barStacked,
      ]}
    >
      {tabs.map((key) => {
        const focused = activeTab === key;
        const tint = focused ? colors.primaryLight : colors.tabInactive;
        const onPress =
          key === 'home'
            ? goHome
            : key === 'search'
              ? goSearch
              : key === 'plan'
                ? goPlan
                : key === 'chat'
                  ? goChat
                  : goProfile;

        return (
          <TouchableOpacity
            key={key}
            style={styles.item}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={LABELS[key]}
          >
            {key === 'search' ? (
              <SmartSearchIcon focused={focused} color={tint} label={LABELS[key]} />
            ) : (
              <TabIcon
                name={key as 'home' | 'plan' | 'chat' | 'profile'}
                focused={focused}
                color={tint}
                label={LABELS[key]}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barCore: {
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
  barFloating: {
    position: 'absolute' as const,
    left: 16,
    right: 16,
  },
  barStacked: {
    alignSelf: 'stretch' as const,
    marginHorizontal: 16,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
});
