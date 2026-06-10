import React, { type PropsWithChildren } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle, Pressable } from 'react-native';
import { colors, spacing, borderRadius, elevation } from '../../theme';

type SurfaceVariant = 'plain' | 'subtle' | 'elevated' | 'interactive' | 'floating';

type SurfaceProps = PropsWithChildren<{
  variant?: SurfaceVariant;
  style?: StyleProp<ViewStyle>;
  padding?: keyof typeof spacing;
  onPress?: () => void;
}>;

const variantStyles: Record<SurfaceVariant, ViewStyle> = {
  plain: { backgroundColor: 'transparent', borderWidth: 0 },
  subtle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    ...elevation.card,
  },
  elevated: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderRadius: borderRadius.xl,
    ...elevation.soft,
  },
  interactive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
  },
  floating: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderRadius: borderRadius.xxl,
    ...elevation.floating,
  },
};

export function Surface({
  children,
  variant = 'subtle',
  style,
  padding,
  onPress,
}: SurfaceProps) {
  const pad = padding != null ? spacing[padding] : undefined;
  const base = [styles.base, variantStyles[variant], pad != null && { padding: pad }, style];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [base, pressed && variant === 'interactive' && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.92,
    backgroundColor: colors.surfaceElevated,
  },
});
