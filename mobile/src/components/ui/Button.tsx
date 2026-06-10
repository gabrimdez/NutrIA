import React from 'react';
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  spacing,
  borderRadius,
  typography,
  pressedOpacity,
  primaryCtaPressed,
  elevation,
  actionIntentStyles,
  ACTION_INTENT_GRADIENT_COLORS,
  ACTION_INTENT_GRADIENT_START,
  ACTION_INTENT_GRADIENT_END,
} from '../../theme';
import { TideGradientFrame } from './TideGradientFrame';

export type UIButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'dangerOutline'
  | 'outline'
  | 'actionCancel'
  | 'actionConfirm'
  | 'actionDestructive';

interface UIButtonProps {
  title: string;
  onPress: () => void;
  variant?: UIButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
  showArrow?: boolean;
  /** Pestaña “Cancelar” del patrón actionCancel: mostrar icono cierre (por defecto). */
  showCloseIcon?: boolean;
}

export function UIButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  icon,
  showArrow = false,
  showCloseIcon = true,
}: UIButtonProps) {
  const isDisabled = disabled || loading;

  if (variant === 'actionCancel') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        style={({ pressed }) => [
          actionIntentStyles.cancelBtn,
          isDisabled && styles.disabled,
          pressed && !isDisabled && styles.pressed,
          style,
        ]}
      >
        {icon !== undefined ? (
          icon
        ) : showCloseIcon ? (
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        ) : null}
        <Text style={actionIntentStyles.cancelText}>{title}</Text>
      </Pressable>
    );
  }

  if (variant === 'actionDestructive') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        style={({ pressed }) => [
          actionIntentStyles.destructivePressable,
          isDisabled && styles.disabled,
          pressed && !isDisabled && styles.pressed,
          style,
        ]}
      >
        <View style={actionIntentStyles.destructiveShadowWrap}>
          <View
            style={[
              actionIntentStyles.destructiveInner,
              isDisabled && actionIntentStyles.destructiveInnerDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.error} size="small" />
            ) : (
              <View style={styles.content}>
                {icon !== undefined ? (
                  icon
                ) : null}
                <Text style={actionIntentStyles.destructiveText}>{title}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  if (variant === 'actionConfirm') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        style={({ pressed }) => [
          actionIntentStyles.confirmPressable,
          isDisabled && styles.disabled,
          pressed && !isDisabled && styles.pressed,
          style,
        ]}
      >
        <View style={actionIntentStyles.confirmShadowWrap}>
          <LinearGradient
            colors={ACTION_INTENT_GRADIENT_COLORS.slice() as [string, string, string]}
            start={ACTION_INTENT_GRADIENT_START}
            end={ACTION_INTENT_GRADIENT_END}
            style={[
              actionIntentStyles.confirmInner,
              isDisabled && actionIntentStyles.confirmInnerDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <View style={styles.content}>
                {icon !== undefined ? (
                  icon
                ) : (
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                )}
                <Text style={actionIntentStyles.confirmText}>{title}</Text>
              </View>
            )}
          </LinearGradient>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primaryShell : styles[variant],
        variant !== 'primary' && styles[`size_${size}`],
        isDisabled && styles.disabled,
        pressed && !isDisabled && variant === 'primary' && primaryCtaPressed,
        pressed && !isDisabled && variant !== 'primary' && styles.pressed,
        style,
      ]}
    >
      {variant === 'primary' ? (
        <TideGradientFrame
          borderRadius={borderRadius.xxl}
          style={styles.primaryTideOuter}
          contentContainerStyle={[styles.primaryTideInner, styles[`primaryPad_${size}`]]}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <View style={styles.content}>
              {icon}
              <Text style={[styles.text, styles.text_primary, styles[`textSize_${size}`]]}>
                {title}
              </Text>
              {showArrow && (
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={colors.white}
                  style={styles.arrow}
                />
              )}
            </View>
          )}
        </TideGradientFrame>
      ) : loading ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`]]}>
            {title}
          </Text>
          {showArrow && (
            <Ionicons
              name="arrow-forward"
              size={18}
              color={colors.primaryLight}
              style={styles.arrow}
            />
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.xxl,
  },
  primaryShell: {
    overflow: 'hidden',
    borderRadius: borderRadius.xxl,
    alignSelf: 'stretch',
    ...elevation.fab,
  },
  primaryTideOuter: {
    alignSelf: 'stretch',
    width: '100%',
  },
  primaryTideInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryPad_sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 40 },
  primaryPad_md: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl, minHeight: 50 },
  primaryPad_lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, minHeight: 56 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  secondary: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  dangerOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.dangerMuted,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  size_sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 40 },
  size_md: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl, minHeight: 50 },
  size_lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, minHeight: 56 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: pressedOpacity },
  text: { ...typography.bodyBold },
  text_primary: { color: colors.white },
  text_secondary: { color: colors.text },
  text_ghost: { color: colors.primaryLight },
  text_dangerOutline: { color: colors.error },
  text_outline: { color: colors.white },
  textSize_sm: { fontSize: 13 },
  textSize_md: { fontSize: 15 },
  textSize_lg: { fontSize: 16 },
  arrow: { marginLeft: 2 },
});
