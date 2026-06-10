import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, borderRadius, elevation, DOCK_H } from '../theme';
import { TideGradientFrame } from './ui';

export type SearchAction = 'recipes' | 'search' | 'scanner';

type Props = {
  active: SearchAction;
  onRecipes?: () => void;
  onSearch?: () => void;
  onScanner?: () => void;
};

const ACTIONS: { key: SearchAction; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'recipes', label: 'Recetas', icon: 'book-outline' },
  { key: 'search', label: 'Buscar', icon: 'search' },
  { key: 'scanner', label: 'Escáner', icon: 'scan-outline' },
];

export default function SearchActionBar({ active, onRecipes, onSearch, onScanner }: Props) {
  const handlers: Record<SearchAction, (() => void) | undefined> = {
    recipes: onRecipes,
    search: onSearch,
    scanner: onScanner,
  };

  return (
    <View style={styles.bar}>
      {ACTIONS.map((a) => {
        const isCurrent = active === a.key;
        const iconColor = isCurrent ? colors.primaryLight : colors.tabInactive;
        return (
          <Pressable
            key={a.key}
            style={({ pressed }) => [
              styles.item,
              pressed && (isCurrent ? styles.itemActivePressed : styles.itemPressed),
            ]}
            onPress={isCurrent ? undefined : handlers[a.key]}
          >
            {isCurrent && (a.key === 'search' || a.key === 'recipes') ? (
              <TideGradientFrame
                borderRadius={24}
                style={styles.activeTide}
                contentContainerStyle={styles.activeTideInner}
              >
                <Ionicons name={a.icon} size={22} color={colors.white} />
              </TideGradientFrame>
            ) : (
              <Ionicons name={a.icon} size={22} color={iconColor} />
            )}
            <Text
              style={[
                styles.label,
                { color: isCurrent ? colors.primaryLight : colors.tabInactive },
              ]}
            >
              {a.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignSelf: 'stretch',
    marginHorizontal: 16,
    height: DOCK_H,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dockBackground,
    borderRadius: borderRadius.xxxl,
    borderWidth: 1,
    borderColor: colors.dockBorder,
    overflow: 'visible',
    zIndex: 10,
    ...Platform.select({
      web: { boxShadow: '0 6px 24px rgba(0,0,0,0.4)' },
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
    minWidth: 0,
  },
  activeTide: {
    width: 44,
    height: 44,
    marginTop: -12,
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(16, 185, 129, 0.45)' },
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      default: { boxShadow: '0 4px 16px rgba(16, 185, 129, 0.45)' },
    }),
  },
  activeTideInner: { flex: 1 },
  itemActivePressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
  itemPressed: { opacity: 0.85 },
  label: {
    ...typography.small,
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
