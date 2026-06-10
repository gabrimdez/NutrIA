import React from 'react';
import { Text, StyleSheet, Pressable, ViewStyle, ActivityIndicator, View } from 'react-native';
import { colors, spacing, borderRadius, typography, primaryCtaPressed } from '../theme';
import { TideGradientFrame } from './ui/TideGradientFrame';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
};

export function GradientButton({ title, onPress, disabled, loading, style, icon }: Props) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [styles.touch, pressed && !off && primaryCtaPressed, style]}
    >
      <TideGradientFrame
        borderRadius={borderRadius.xl}
        style={styles.tide}
        contentContainerStyle={[styles.inner, (disabled || loading) && styles.dimmed]}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            {icon}
            <Text style={styles.text}>{title}</Text>
          </>
        )}
      </TideGradientFrame>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  tide: {
    alignSelf: 'stretch',
  },
  inner: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dimmed: { opacity: 0.55 },
  text: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
});
