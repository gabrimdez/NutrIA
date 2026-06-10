import React, { useEffect } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Un solo frame (centro, ojos abiertos). `nutria-idle.png` es un lienzo 256×256 con dos poses apiladas y no debe usarse aquí. */
const NUTRIA = require('../../assets/images/streak/nutria-frame-07.png');

export type NutriaIdleProps = {
  /** Width & height in pixels. Default 160. */
  size?: number;
  /** Pauses the idle animation when false. Default true. */
  playing?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Animación idle suave de la mascota nutria.
 *
 * Usa un PNG de un solo frame (`nutria-frame-07.png`, alineado con `NutriaIdleSprite`).
 * Los transforms van en un `Animated.View` envolviendo `Image` (no `Animated.Image`):
 * en web, Reanimated recortaba el overflow del `<img>` y la frente quedaba plana.
 *
 * Movimiento:
 *  - Respiración: scaleY 1 → 1.03 → 1 (~2.8 s, bucle).
 *  - Parpadeo simulado: squash breve en Y cada ~4 s.
 *  - Ligero balanceo horizontal (±1.5 px).
 */
export function NutriaIdle({ size = 160, playing = true, style }: NutriaIdleProps) {
  const breath = useSharedValue(1);
  const sway = useSharedValue(0);
  const blink = useSharedValue(1);
  /** Hueco arriba para que el scale no choque con bordes / scroll en web. */
  const headroom = Math.max(8, Math.ceil(size * 0.16));
  const outerH = size + headroom;

  useEffect(() => {
    if (!playing) {
      cancelAnimation(breath);
      cancelAnimation(sway);
      cancelAnimation(blink);
      return;
    }

    breath.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );

    sway.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1.5, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    blink.value = withRepeat(
      withSequence(
        withDelay(3800, withTiming(0.92, { duration: 90, easing: Easing.out(Easing.quad) })),
        withTiming(1, { duration: 110, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(breath);
      cancelAnimation(sway);
      cancelAnimation(blink);
    };
  }, [playing, breath, sway, blink]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: sway.value },
      { scaleX: breath.value },
      { scaleY: breath.value * blink.value },
    ],
  }));

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: outerH,
          overflow: 'visible',
          justifyContent: 'flex-end',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.animWrap,
          { width: size, height: size, overflow: 'visible' },
          animatedStyle,
        ]}
      >
        <Image
          source={NUTRIA}
          style={styles.image}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessibilityRole="image"
          accessibilityLabel="Nutria mascota"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  animWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
