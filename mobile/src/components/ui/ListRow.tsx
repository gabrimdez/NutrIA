import React, { type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  type StyleProp,
  type ViewStyle,
  type FlexAlignType,
} from 'react-native';
import { colors, spacing, borderRadius, typography, hairlineWidth } from '../../theme';

type Props = {
  leading?: ReactNode;
  title?: string;
  subtitle?: string;
  meta?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  showSeparator?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Segunda línea de detalle (p. ej. ítems de comida) */
  detail?: ReactNode;
  /** Si no hay `title` visible, conviene pasar etiqueta para lectores de pantalla. */
  accessibilityLabel?: string;
  /** Alineación vertical del bloque leading / mid / trailing (p. ej. `flex-start` si el detalle es alto). */
  contentAlign?: FlexAlignType;
};

export function ListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  onPress,
  onLongPress,
  showSeparator,
  style,
  detail,
  accessibilityLabel,
  contentAlign = 'center',
}: Props) {
  const content = (
    <>
      <View style={[styles.inner, { alignItems: contentAlign }]}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.mid}>
          {title ? (
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {detail}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {showSeparator ? <View style={styles.separator} /> : null}
    </>
  );

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={380}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed, style]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.row, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  pressable: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  pressed: { opacity: 0.85 },
  inner: { flexDirection: 'row' },
  leading: { marginRight: spacing.md },
  mid: { flex: 1, minWidth: 0 },
  trailing: { marginLeft: spacing.sm, alignItems: 'flex-end', justifyContent: 'center' },
  title: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
  meta: { ...typography.small, color: colors.textMuted, marginTop: 4 },
  separator: {
    marginTop: spacing.md,
    marginLeft: 0,
    height: hairlineWidth,
    backgroundColor: colors.border,
  },
});
