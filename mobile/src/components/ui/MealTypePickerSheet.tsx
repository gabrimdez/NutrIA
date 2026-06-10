import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, screenPaddingX, hairlineWidth } from '../../theme';
import { mealTypeLabel, MEAL_TYPES_ORDER, type MealTypeOrderKey } from '../../lib/mealDisplay';
import { BottomSheet } from './BottomSheet';

const MEAL_TYPE_EMOJIS: Record<MealTypeOrderKey, string> = {
  breakfast: '🥣',
  lunch: '🍗',
  dinner: '🥗',
  snack: '🥤',
};

type MealTypePickerSheetProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  selectedMealType?: MealTypeOrderKey | null;
  onDismiss: () => void;
  onSelect: (mealType: MealTypeOrderKey) => void;
  maxHeightFraction?: number;
};

export function MealTypePickerSheet({
  visible,
  title,
  subtitle,
  selectedMealType,
  onDismiss,
  onSelect,
  maxHeightFraction = 0.45,
}: MealTypePickerSheetProps) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} maxHeightFraction={maxHeightFraction}>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {MEAL_TYPES_ORDER.map((mealType) => (
          <TouchableOpacity
            key={mealType}
            style={styles.row}
            onPress={() => onSelect(mealType)}
          >
            <Text style={styles.emoji}>{MEAL_TYPE_EMOJIS[mealType]}</Text>
            <Text style={styles.label}>{mealTypeLabel(mealType)}</Text>
            {selectedMealType === mealType ? (
              <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: screenPaddingX,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: hairlineWidth,
    borderBottomColor: colors.border,
  },
  emoji: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  label: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
  },
});
