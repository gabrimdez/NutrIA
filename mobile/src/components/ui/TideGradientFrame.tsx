import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  cancelAnimation,
  Easing as ReEasing,
} from 'react-native-reanimated';

/** Acento esmeralda (alineado con marca / FAB) */
export const TIDE_GRADIENT_BASE_COLORS = ['#0AA573', '#087A55', '#0d0d0d'] as const;
export const TIDE_GRADIENT_BASE_LOCATIONS = [0, 0.38, 1] as const;

type Props = {
  borderRadius: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function TideGradientFrame({
  borderRadius,
  style,
  contentContainerStyle,
  children,
}: Props) {
  const [layoutW, setLayoutW] = useState(108);
  const tideX1 = useSharedValue(0);
  const tideX2 = useSharedValue(0);
  const cancelledRef = useRef(false);

  const onInnerLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setLayoutW(w);
  }, []);

  const stripW = Math.max(layoutW * 2.6, 160);

  useEffect(() => {
    cancelledRef.current = false;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const loop1 = () => {
      if (cancelledRef.current) return;
      const span = Math.max(18, layoutW * 0.95);
      const a = rand(-span * 0.85, -span * 0.12);
      const b = rand(span * 0.08, span * 0.75);
      const dA = rand(2200, 4800);
      const dB = rand(2000, 4200);

      tideX1.value = withTiming(a, { duration: dA, easing: ReEasing.inOut(ReEasing.sin) }, (f1) => {
        if (!f1) return;
        tideX1.value = withTiming(b, { duration: dB, easing: ReEasing.inOut(ReEasing.cubic) }, (f2) => {
          if (f2) runOnJS(loop1)();
        });
      });
    };

    const loop2 = () => {
      if (cancelledRef.current) return;
      const span = Math.max(16, layoutW * 0.75);
      const a = rand(span * 0.1, span * 0.8);
      const b = rand(-span * 0.78, -span * 0.05);
      const dA = rand(1800, 3600);
      const dB = rand(1600, 3400);

      tideX2.value = withTiming(a, { duration: dA, easing: ReEasing.inOut(ReEasing.quad) }, (f1) => {
        if (!f1) return;
        tideX2.value = withTiming(b, { duration: dB, easing: ReEasing.inOut(ReEasing.sin) }, (f2) => {
          if (f2) runOnJS(loop2)();
        });
      });
    };

    cancelAnimation(tideX1);
    cancelAnimation(tideX2);
    tideX1.value = 0;
    tideX2.value = 0;
    loop1();
    const t = setTimeout(() => loop2(), 380 + Math.random() * 520);

    return () => {
      cancelledRef.current = true;
      clearTimeout(t);
      cancelAnimation(tideX1);
      cancelAnimation(tideX2);
    };
  }, [layoutW]);

  const wave1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: tideX1.value }],
  }));

  const wave2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: tideX2.value }],
  }));

  return (
    <View style={[styles.root, { borderRadius, overflow: 'hidden' }, style]}>
      <View
        style={[styles.inner, contentContainerStyle]}
        onLayout={onInnerLayout}
      >
        <View style={[styles.tideStack, { borderRadius, pointerEvents: 'none' }]}>
          <LinearGradient
            colors={[...TIDE_GRADIENT_BASE_COLORS]}
            locations={[...TIDE_GRADIENT_BASE_LOCATIONS]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.tideClip}>
            <Reanimated.View
              style={[
                styles.tideStrip,
                { width: stripW, left: -stripW * 0.28 },
                wave1Style,
              ]}
            >
              <LinearGradient
                colors={[
                  'rgba(13,13,13,0)',
                  'rgba(10,165,115,0.28)',
                  'rgba(52,210,175,0.52)',
                  'rgba(10,140,98,0.32)',
                  'rgba(13,13,13,0)',
                ]}
                locations={[0, 0.22, 0.48, 0.74, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
              />
            </Reanimated.View>
            <Reanimated.View
              style={[
                styles.tideStrip,
                {
                  width: stripW * 0.85,
                  left: -stripW * 0.12,
                  opacity: 0.55,
                },
                wave2Style,
              ]}
            >
              <LinearGradient
                colors={[
                  'rgba(13,13,13,0)',
                  'rgba(10,165,115,0.22)',
                  'rgba(95,230,200,0.45)',
                  'rgba(10,150,105,0.2)',
                  'rgba(13,13,13,0)',
                ]}
                locations={[0, 0.28, 0.52, 0.78, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
              />
            </Reanimated.View>
          </View>
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  inner: {
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tideStack: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  tideClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  tideStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    height: '100%',
  },
});
