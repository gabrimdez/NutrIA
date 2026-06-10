import React, { type PropsWithChildren } from 'react';
import { Pressable, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

type Props = PropsWithChildren<{
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
}>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled,
  scaleTo = 0.97,
  style,
}: Props) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, { damping: 15, stiffness: 200 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 200 });
      }}
      disabled={disabled}
      style={[animStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
