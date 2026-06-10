import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSize, typography } from '../theme';
import { useSearchSectionStore, SECTION_ICONS } from '../store/searchSectionStore';

/** Glyphs de Ionicons por pestaña (Plan: `calendar-outline` / `calendar`). */
export const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home-outline',
  training: 'barbell-outline',
  plan: 'calendar-outline',
  chat: 'chatbubble-ellipses-outline',
  premium: 'diamond-outline',
  profile: 'person-outline',
};

export const ICONS_ACTIVE: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  training: 'barbell',
  plan: 'calendar',
  chat: 'chatbubble-ellipses',
  premium: 'diamond',
  profile: 'person',
};

export function TabIcon({
  name,
  focused,
  color,
  label,
}: {
  name: keyof typeof ICONS;
  focused: boolean;
  color: string;
  label: string;
}) {
  const iconName = focused ? ICONS_ACTIVE[name] : ICONS[name];
  const scale = useSharedValue(focused ? 1 : 0.92);
  const capsuleOpacity = useSharedValue(focused ? 1 : 0);
  const capsuleScale = useSharedValue(focused ? 1 : 0.8);

  useEffect(() => {
    if (focused) {
      scale.value = withSpring(1.1, { damping: 12, stiffness: 180 });
      capsuleOpacity.value = withTiming(1, { duration: 250 });
      capsuleScale.value = withSpring(1, { damping: 12, stiffness: 160 });
      const t = setTimeout(() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 160 });
      }, 150);
      return () => clearTimeout(t);
    }
    scale.value = withTiming(0.92, { duration: 200, easing: Easing.out(Easing.quad) });
    capsuleOpacity.value = withTiming(0, { duration: 180 });
    capsuleScale.value = withTiming(0.8, { duration: 180 });
  }, [focused, scale, capsuleOpacity, capsuleScale]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const capsuleAnimStyle = useAnimatedStyle(() => ({
    opacity: capsuleOpacity.value,
    transform: [{ scale: capsuleScale.value }],
  }));

  return (
    <Animated.View style={[styles.iconWrap, iconAnimStyle]}>
      <Animated.View style={[styles.capsule, capsuleAnimStyle]} />
      <Ionicons name={iconName} size={iconSize.md} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Animated.View>
  );
}

export function SmartSearchIcon({ focused, color, label }: { focused: boolean; color: string; label: string }) {
  const lastSection = useSearchSectionStore((s) => s.lastSection);
  const icons = SECTION_ICONS[lastSection];
  const iconName = focused ? icons.filled : icons.outline;

  const scale = useSharedValue(focused ? 1 : 0.92);
  const capsuleOpacity = useSharedValue(focused ? 1 : 0);
  const capsuleScale = useSharedValue(focused ? 1 : 0.8);

  useEffect(() => {
    if (focused) {
      scale.value = withSpring(1.1, { damping: 12, stiffness: 180 });
      capsuleOpacity.value = withTiming(1, { duration: 250 });
      capsuleScale.value = withSpring(1, { damping: 12, stiffness: 160 });
      const t = setTimeout(() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 160 });
      }, 150);
      return () => clearTimeout(t);
    }
    scale.value = withTiming(0.92, { duration: 200, easing: Easing.out(Easing.quad) });
    capsuleOpacity.value = withTiming(0, { duration: 180 });
    capsuleScale.value = withTiming(0.8, { duration: 180 });
  }, [focused, scale, capsuleOpacity, capsuleScale, lastSection]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const capsuleAnimStyle = useAnimatedStyle(() => ({
    opacity: capsuleOpacity.value,
    transform: [{ scale: capsuleScale.value }],
  }));

  return (
    <Animated.View style={[styles.iconWrap, iconAnimStyle]}>
      <Animated.View style={[styles.capsule, capsuleAnimStyle]} />
      <Ionicons name={iconName} size={iconSize.md} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Animated.View>
  );
}

const CAPSULE_W = 52;
const CAPSULE_H = 46;

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CAPSULE_W,
    height: CAPSULE_H,
  },
  capsule: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.activeTabGlow,
    borderRadius: 14,
  },
  label: {
    ...typography.small,
    fontWeight: '600',
    fontSize: 10,
    marginTop: 1,
    letterSpacing: 0.2,
  },
});
