import React from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export const MEAL_SLOT_ANIM_MS = 280;
export const MEAL_SLOT_EASING = Easing.out(Easing.cubic);

export function MealSlotChevron({ expanded }: { expanded: boolean }) {
  const deg = useSharedValue(expanded ? 180 : 0);
  React.useEffect(() => {
    deg.value = withTiming(expanded ? 180 : 0, { duration: MEAL_SLOT_ANIM_MS, easing: MEAL_SLOT_EASING });
  }, [expanded]);
  const rStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${deg.value}deg` }],
  }));
  return (
    <Animated.View style={rStyle}>
      <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
    </Animated.View>
  );
}

type AnimatedCollapsibleProps = {
  expanded: boolean;
  children: React.ReactNode;
};

/** Lista con altura animada; el contenido sigue montado hasta acabar el cierre. */
export function AnimatedCollapsible({ expanded, children }: AnimatedCollapsibleProps) {
  const [mounted, setMounted] = React.useState(expanded);
  const height = useSharedValue(0);
  const measuredHeight = React.useRef(0);

  React.useEffect(() => {
    if (expanded) {
      setMounted(true);
    } else {
      height.value = withTiming(0, { duration: MEAL_SLOT_ANIM_MS, easing: MEAL_SLOT_EASING }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [expanded, height]);

  const onInnerLayout = React.useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (h <= 0) return;
      measuredHeight.current = h;
      if (!expanded) return;
      height.value = withTiming(h, { duration: MEAL_SLOT_ANIM_MS, easing: MEAL_SLOT_EASING });
    },
    [expanded, height],
  );

  const rStyle = useAnimatedStyle(() => ({
    height: height.value,
    overflow: 'hidden' as const,
  }));

  if (!expanded && !mounted) return null;

  return (
    <Animated.View style={rStyle}>
      <View style={{ position: 'absolute', width: '100%' }} onLayout={onInnerLayout}>
        {expanded || mounted ? children : null}
      </View>
    </Animated.View>
  );
}
