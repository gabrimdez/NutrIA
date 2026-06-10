import React, { useEffect } from 'react';
import { StyleSheet, View, Image, type ImageSourcePropType } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | string;

interface MealTypeConfig {
  image: ImageSourcePropType;
  bg: string;
  border: string;
  tint: string | undefined;
  glow: string;
  imageScale?: number;
  fullBleed?: boolean;
}

const MEAL_TYPE_MAP: Record<string, MealTypeConfig> = {
  breakfast: {
    image: require('../../assets/images/meal-breakfast-otter.png'),
    bg: 'rgba(20, 143, 119, 0.18)',
    border: 'rgba(20, 143, 119, 0.32)',
    tint: undefined,
    glow: 'rgba(20, 143, 119, 0.11)',
    imageScale: 1.12,
  },
  lunch: {
    image: require('../../assets/images/meal-lunch-otter.png'),
    bg: 'rgba(20, 143, 119, 0.18)',
    border: 'rgba(20, 143, 119, 0.32)',
    tint: undefined,
    glow: 'rgba(20, 143, 119, 0.11)',
    imageScale: 1.05,
  },
  dinner: {
    image: require('../../assets/images/meal-dinner-otter.png'),
    bg: 'rgba(20, 143, 119, 0.18)',
    border: 'rgba(20, 143, 119, 0.32)',
    tint: undefined,
    glow: 'rgba(20, 143, 119, 0.11)',
    imageScale: 1.32,
    fullBleed: true,
  },
  snack: {
    image: require('../../assets/images/meal-snack-otter.png'),
    bg: 'rgba(20, 143, 119, 0.18)',
    border: 'rgba(20, 143, 119, 0.32)',
    tint: undefined,
    glow: 'rgba(20, 143, 119, 0.11)',
    imageScale: 1.22,
    fullBleed: true,
  },
};

const DEFAULT_CONFIG: MealTypeConfig = {
  image: require('../../assets/images/meal-lunch.png'),
  bg: 'rgba(107, 114, 128, 0.14)',
  border: 'rgba(107, 114, 128, 0.22)',
  tint: '#9CA3AF',
  glow: 'rgba(107, 114, 128, 0.06)',
};

interface MealTypeIconProps {
  mealType: MealType;
  size?: number;
  animated?: boolean;
}

export function MealTypeIcon({ mealType, size = 52, animated = true }: MealTypeIconProps) {
  const config = MEAL_TYPE_MAP[mealType] || DEFAULT_CONFIG;
  const fullBleed = config.fullBleed ?? false;
  const outerRadius = Math.round(size * 0.3);
  const innerRadius = Math.round(size * 0.25);
  const imgSize = Math.round(size * (config.imageScale ?? (fullBleed ? 1.12 : 0.55)));

  const scale = useSharedValue(animated ? 0.85 : 1);
  const opacity = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) return;
    scale.value = withSpring(1, { damping: 14, stiffness: 160 });
    opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [animated, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: outerRadius,
          backgroundColor: fullBleed ? 'transparent' : config.bg,
          borderColor: fullBleed ? 'transparent' : config.border,
          borderWidth: fullBleed ? 0 : 1,
          overflow: fullBleed ? 'hidden' : 'visible',
        },
        animated && animatedStyle,
      ]}
    >
      <View
        style={[
          styles.glowInner,
          {
            backgroundColor: fullBleed ? 'transparent' : config.glow,
            borderRadius: innerRadius,
          },
        ]}
      >
        <Image
          source={config.image}
          style={{ width: imgSize, height: imgSize }}
          resizeMode={fullBleed ? 'cover' : 'contain'}
          {...(config.tint ? { tintColor: config.tint } : {})}
        />
      </View>
    </Animated.View>
  );
}

export function getMealTypeConfig(mealType: string) {
  return MEAL_TYPE_MAP[mealType] || DEFAULT_CONFIG;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  glowInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
