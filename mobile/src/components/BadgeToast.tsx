import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { resolveBadgeImageUrl } from '../lib/badgeImageUrl';
import { BADGE_RARITY_LABELS } from '../lib/badgeLabels';
import { useBadgeNotificationStore } from '../store/badgeNotificationStore';
import { borderRadius, colors, hairlineWidth, spacing, typography } from '../theme';
import { BadgeImage } from './BadgeImage';

const HIDDEN_Y = -150;
const ENTER_MS = 240;
const EXIT_MS = 220;
const AUTO_MS = 4000;
const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN = Easing.in(Easing.cubic);

/**
 * Toasts animados (parte superior) al desbloquear una insignia.
 */
export function BadgeToast() {
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  const router = useRouter();
  const current = useBadgeNotificationStore((s) => s.current);
  const dismiss = useBadgeNotificationStore((s) => s.dismiss);

  const slideY = useSharedValue(HIDDEN_Y);
  const dragY = useSharedValue(0);
  const startDragY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const lastBadgeId = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value + dragY.value }],
    opacity: opacity.value,
  }));

  const goExit = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    dragY.value = 0;
    opacity.value = withTiming(0, { duration: Math.min(EXIT_MS, 200), easing: EASE_IN });
    slideY.value = withTiming(
      HIDDEN_Y,
      { duration: EXIT_MS, easing: EASE_IN },
      (finished) => {
        'worklet';
        if (finished) runOnJS(dismiss)();
      },
    );
  }, [dismiss, dragY, opacity, slideY]);

  const scheduleAutoDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      goExit();
    }, AUTO_MS);
  }, [goExit]);

  const runEnter = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    dragY.value = 0;
    slideY.value = HIDDEN_Y;
    opacity.value = 0;
    slideY.value = withTiming(0, { duration: ENTER_MS, easing: EASE_OUT });
    opacity.value = withTiming(1, { duration: ENTER_MS, easing: EASE_OUT });
    scheduleAutoDismiss();
  }, [slideY, opacity, dragY, scheduleAutoDismiss]);

  useEffect(() => {
    if (!current) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      slideY.value = HIDDEN_Y;
      dragY.value = 0;
      opacity.value = 0;
      lastBadgeId.current = null;
      return;
    }
    if (lastBadgeId.current !== current.badge_id) {
      lastBadgeId.current = current.badge_id;
      runEnter();
    } else {
      scheduleAutoDismiss();
    }
  }, [current, runEnter, scheduleAutoDismiss, slideY, dragY, opacity]);

  const navigateToDetail = useCallback(
    (badgeId: string) => {
      dismiss();
      router.push({
        pathname: '/profile/badges',
        params: { openBadgeId: badgeId },
      });
    },
    [dismiss, router],
  );

  const onPress = useCallback(() => {
    const id = useBadgeNotificationStore.getState().current?.badge_id;
    if (!id) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    navigateToDetail(id);
  }, [navigateToDetail]);

  const pan = Gesture.Pan()
    .activeOffsetY(-12)
    .failOffsetX([-32, 32])
    .onStart(() => {
      startDragY.value = dragY.value;
    })
    .onUpdate((e) => {
      'worklet';
      const y = startDragY.value + e.translationY;
      dragY.value = y > 0 ? 0 : y;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY < -48 || e.velocityY < -500) {
        runOnJS(goExit)();
      } else {
        dragY.value = withTiming(0, { duration: 180, easing: EASE_OUT });
        runOnJS(scheduleAutoDismiss)();
      }
    });

  const tap = Gesture.Tap().onEnd((_, success) => {
    'worklet';
    if (success) runOnJS(onPress)();
  });

  const composed = Gesture.Exclusive(tap, pan);

  if (!current) return null;

  const padH = 16;
  const uri = resolveBadgeImageUrl(current.image_url);
  const rarity = BADGE_RARITY_LABELS[current.rarity] ?? current.rarity;

  return (
    <View
      style={[styles.root, { paddingTop: insets.top + 10, paddingHorizontal: padH, pointerEvents: 'box-none' }]}
    >
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.card, { maxWidth: Math.min(windowW - padH * 2, 520) }, aStyle]}>
          {uri ? (
            <BadgeImage uri={uri} style={styles.thumb} />
          ) : (
            <View style={styles.thumbPh}>
              <Ionicons name="ribbon" size={28} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.textCol}>
            <Text style={styles.badgeKicker}>¡Insignia desbloqueada!</Text>
            <Text style={styles.badgeName} numberOfLines={1}>
              {current.name}
            </Text>
            <Text style={styles.badgeRarity} numberOfLines={1}>
              {rarity}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2000,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    borderWidth: hairlineWidth,
    borderColor: colors.borderStrong,
    ...Platform.select({
      web: { boxShadow: '0 10px 28px rgba(0,0,0,0.4)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  thumb: { width: 48, height: 48, borderRadius: borderRadius.md, overflow: 'hidden' },
  thumbPh: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  badgeKicker: {
    ...typography.caption,
    color: colors.primaryLight,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeName: { ...typography.body, color: colors.text, fontWeight: '700' },
  badgeRarity: { ...typography.caption, color: colors.textMuted },
});
