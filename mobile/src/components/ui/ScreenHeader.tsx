import React, { type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, screenPaddingX } from '../../theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Acción derecha (icono o texto) */
  rightAction?: ReactNode;
  onRightPress?: () => void;
  /** Margen inferior extra bajo el bloque de título */
  bottomSpacing?: keyof typeof spacing;
};

export function ScreenHeader({
  title,
  subtitle,
  rightAction,
  onRightPress,
  bottomSpacing = 'lg',
}: Props) {
  const insets = useSafeAreaInsets();
  const bottom = spacing[bottomSpacing];

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, spacing.md), paddingBottom: bottom }]}>
      <View style={styles.row}>
        <View style={styles.titles}>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        {rightAction ? (
          onRightPress ? (
            <Pressable onPress={onRightPress} hitSlop={12} style={styles.rightHit}>
              {rightAction}
            </Pressable>
          ) : (
            <View style={styles.rightHit}>{rightAction}</View>
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: screenPaddingX,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titles: { flex: 1, minWidth: 0 },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 4,
  },
  title: {
    ...typography.screenTitle,
    color: colors.text,
  },
  rightHit: { justifyContent: 'center', minHeight: 44, minWidth: 44, alignItems: 'flex-end' },
});
