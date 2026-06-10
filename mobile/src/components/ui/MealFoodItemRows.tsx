import React from 'react';
import { Alert, View, Text, StyleSheet, Pressable, Platform, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { colors, spacing } from '../../theme';
import type { MealItem, MealEntry, DayDiary } from '../../types';
import { combinedMealTitle, mealItemDisplayPartsForUi } from '../../lib/mealDisplay';
import { invalidateMealRelatedQueries } from '../../lib/mealQueryInvalidation';
import { confirmTwoAction } from '../../lib/confirmTwoAction';

export type MealFoodItemRowsVariant = 'home' | 'diary';

type Props = {
  mealId: string;
  items: MealItem[];
  variant?: MealFoodItemRowsVariant;
  dateStr?: string;
  onEditGroup?: (mealId: string, items: MealItem[]) => void;
  onPressFood?: (item: MealItem) => void;
};

type MealFoodItemRowsStyles = {
  wrap: ViewStyle;
  foodRow: ViewStyle;
  foodTextCol: ViewStyle;
  foodTitle: TextStyle;
  foodSubtitle: TextStyle;
  foodQtyCol: ViewStyle;
  foodQty: TextStyle;
  foodKcalMuted: TextStyle;
  checkHit: ViewStyle;
  foodCheckOn: ViewStyle;
  foodCheckOff: ViewStyle;
};

function isEaten(it: MealItem): boolean {
  return it.eaten !== false;
}

function recalcMealTotals(items: MealItem[]) {
  let kcal = 0, protein = 0, carbs = 0, fat = 0;
  for (const it of items) {
    if (it.eaten === false) continue;
    kcal += it.kcal;
    protein += it.protein_g;
    carbs += it.carbs_g;
    fat += it.fat_g;
  }
  return {
    total_kcal: Math.round(kcal * 10) / 10,
    total_protein_g: Math.round(protein * 10) / 10,
    total_carbs_g: Math.round(carbs * 10) / 10,
    total_fat_g: Math.round(fat * 10) / 10,
  };
}

function recalcDiaryTotals(meals: MealEntry[]): Pick<DayDiary, 'total_kcal' | 'total_protein_g' | 'total_carbs_g' | 'total_fat_g'> {
  let kcal = 0, protein = 0, carbs = 0, fat = 0;
  for (const m of meals) {
    kcal += m.total_kcal;
    protein += m.total_protein_g;
    carbs += m.total_carbs_g;
    fat += m.total_fat_g;
  }
  return {
    total_kcal: Math.round(kcal * 10) / 10,
    total_protein_g: Math.round(protein * 10) / 10,
    total_carbs_g: Math.round(carbs * 10) / 10,
    total_fat_g: Math.round(fat * 10) / 10,
  };
}

function SingleItemRow({
  it, i, cs, mutation, onPressFood,
}: {
  it: MealItem; i: number;
  cs: MealFoodItemRowsStyles;
  mutation: ReturnType<typeof useMutation<MealEntry, unknown, { itemId: string; eaten: boolean }>>;
  onPressFood?: (item: MealItem) => void;
}) {
  const raw = (it.custom_name || 'Alimento').trim();
  const { title: displayTitle, subtitle } = mealItemDisplayPartsForUi(raw);
  const gramsLabel = `${Math.round(it.grams)} g`;
  const kcalLabel = `${Math.round(it.kcal)} kcal`;
  const eaten = isEaten(it);
  const itemId = it.id;
  const pending = mutation.isPending && mutation.variables?.itemId === itemId;

  const rowContent = (
    <>
      <View style={cs.foodTextCol}>
        <Text style={cs.foodTitle} numberOfLines={2}>{displayTitle}</Text>
        {subtitle ? <Text style={cs.foodSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={cs.foodQtyCol}>
        <Text style={cs.foodQty} numberOfLines={2}>{gramsLabel}</Text>
        <Text style={cs.foodKcalMuted} numberOfLines={1}>{kcalLabel}</Text>
      </View>
      <View onStartShouldSetResponder={() => true} style={cs.checkHit}>
        <Pressable
          disabled={!itemId || pending}
          onPress={() => { if (itemId) mutation.mutate({ itemId, eaten: !eaten }); }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: eaten, disabled: !itemId }}
          style={({ pressed }) => [
            eaten ? cs.foodCheckOn : cs.foodCheckOff,
            pressed && itemId ? { opacity: 0.85 } : null,
            pending ? { opacity: 0.6 } : null,
          ]}
        >
          {eaten ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
        </Pressable>
      </View>
    </>
  );

  if (onPressFood) {
    return (
      <Pressable
        key={itemId ?? `food-${i}`}
        onPress={() => onPressFood(it)}
        accessibilityRole="button"
        accessibilityLabel={`Ver información nutricional de ${displayTitle}`}
        style={({ pressed }) => [cs.foodRow, pressed ? { opacity: 0.7 } : null]}
      >
        {rowContent}
      </Pressable>
    );
  }

  return (
    <View key={itemId ?? `food-${i}`} style={cs.foodRow}>
      {rowContent}
    </View>
  );
}

export function MealFoodItemRows({ mealId, items, variant = 'home', dateStr, onEditGroup, onPressFood }: Props) {
  const queryClient = useQueryClient();
  const isHome = variant === 'home';
  const cs = isHome ? homeStyles : diaryStyles;
  const [expanded, setExpanded] = React.useState(false);

  const mutation = useMutation({
    mutationFn: ({ itemId, eaten }: { itemId: string; eaten: boolean }) =>
      api.patch<MealEntry>(`/api/v1/meals/${mealId}/items/${itemId}`, { eaten }),

    onMutate: async ({ itemId, eaten }) => {
      if (!dateStr) return {};
      const qk = ['diary', dateStr];
      await queryClient.cancelQueries({ queryKey: qk });
      const prev = queryClient.getQueryData<DayDiary>(qk);
      if (prev) {
        queryClient.setQueryData<DayDiary>(qk, () => {
          const meals = prev.meals.map((meal) => {
            if (meal.id !== mealId) return meal;
            const newItems = meal.items.map((it) =>
              it.id === itemId ? { ...it, eaten } : it,
            );
            return { ...meal, items: newItems, ...recalcMealTotals(newItems) };
          });
          return { ...prev, meals, ...recalcDiaryTotals(meals) };
        });
      }
      return { prev };
    },

    onError: (_err, _vars, context) => {
      if (dateStr && context?.prev) {
        queryClient.setQueryData(['diary', dateStr], context.prev);
      }
    },

    onSettled: () => invalidateMealRelatedQueries(queryClient),
  });

  const deleteMealMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/meals/${mealId}`),
    onSuccess: () => invalidateMealRelatedQueries(queryClient),
    onError: (e: unknown) =>
      Alert.alert('No se pudo eliminar', e instanceof Error ? e.message : 'Inténtalo de nuevo.'),
  });

  if (items.length <= 1) {
    return (
      <View style={cs.wrap}>
        {items.map((it, i) => (
          <SingleItemRow key={it.id ?? `food-${i}`} it={it} i={i} cs={cs} mutation={mutation} onPressFood={onPressFood} />
        ))}
      </View>
    );
  }

  const totalKcal = items.reduce((s, it) => s + (isEaten(it) ? it.kcal : 0), 0);
  const totalP = items.reduce((s, it) => s + (isEaten(it) ? it.protein_g : 0), 0);
  const totalC = items.reduce((s, it) => s + (isEaten(it) ? it.carbs_g : 0), 0);
  const totalF = items.reduce((s, it) => s + (isEaten(it) ? it.fat_g : 0), 0);
  const groupTitle = combinedMealTitle(items);
  const confirmDeleteGroup = () => {
    confirmTwoAction(
      'Eliminar comida',
      `¿Eliminar «${groupTitle}» del diario?`,
      'Eliminar',
      () => deleteMealMutation.mutate(),
    );
  };

  return (
    <View style={cs.wrap}>
      <View style={gs.groupHeader}>
        <Pressable
          style={({ pressed }) => [gs.groupMain, pressed ? { opacity: 0.85 } : null]}
          onPress={() => {
            if (onEditGroup) {
              onEditGroup(mealId, items);
            } else {
              setExpanded((p) => !p);
            }
          }}
          accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
          accessibilityState={{ expanded }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[cs.foodTitle, { fontSize: 15 }]} numberOfLines={2}>{groupTitle}</Text>
            <Text style={gs.groupMeta}>
              {Math.round(totalKcal)} kcal · P:{Math.round(totalP)} C:{Math.round(totalC)} G:{Math.round(totalF)}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
        <Pressable
          disabled={deleteMealMutation.isPending}
          onPress={confirmDeleteGroup}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Eliminar comida completa"
          style={({ pressed }) => [
            gs.groupDeleteBtn,
            pressed && !deleteMealMutation.isPending ? { opacity: 0.75 } : null,
            deleteMealMutation.isPending ? { opacity: 0.45 } : null,
          ]}
        >
          <Ionicons name="trash-outline" size={19} color={colors.error} />
        </Pressable>
      </View>

      {expanded && (
        <View style={gs.groupBody}>
          {items.map((it, i) => {
            const raw = (it.custom_name || 'Alimento').trim();
            const { title: displayTitle } = mealItemDisplayPartsForUi(raw);
            const eaten = isEaten(it);
            const itemId = it.id;
            const pending = mutation.isPending && mutation.variables?.itemId === itemId;

            const subRowInner = (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={gs.subItemName} numberOfLines={1}>{displayTitle}</Text>
                  <Text style={gs.subItemMacros}>
                    {Math.round(it.grams)}g · {Math.round(it.kcal)} kcal · P:{Math.round(it.protein_g)} C:{Math.round(it.carbs_g)} G:{Math.round(it.fat_g)}
                  </Text>
                </View>
                <View onStartShouldSetResponder={() => true} style={cs.checkHit}>
                  <Pressable
                    disabled={!itemId || pending}
                    onPress={() => { if (itemId) mutation.mutate({ itemId, eaten: !eaten }); }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: eaten, disabled: !itemId }}
                    style={({ pressed }) => [
                      eaten ? cs.foodCheckOn : cs.foodCheckOff,
                      pressed && itemId ? { opacity: 0.85 } : null,
                      pending ? { opacity: 0.6 } : null,
                    ]}
                  >
                    {eaten ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                  </Pressable>
                </View>
              </>
            );

            if (onPressFood) {
              return (
                <Pressable
                  key={itemId ?? `food-${i}`}
                  onPress={() => onPressFood(it)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver información nutricional de ${displayTitle}`}
                  style={({ pressed }) => [gs.subItemRow, pressed ? { opacity: 0.7 } : null]}
                >
                  {subRowInner}
                </Pressable>
              );
            }

            return (
              <View key={itemId ?? `food-${i}`} style={gs.subItemRow}>
                {subRowInner}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const gs = StyleSheet.create({
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  groupMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  groupDeleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.dangerMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupBody: {
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    marginLeft: 4,
    marginBottom: 4,
  },
  subItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  subItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
    lineHeight: 18,
  },
  subItemMacros: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});

const homeStyles = StyleSheet.create<MealFoodItemRowsStyles>({
  wrap: { marginTop: 0, width: '100%', alignSelf: 'stretch' },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10,
    gap: 10,
  },
  foodTextCol: { flex: 1, minWidth: 0, paddingRight: 4, justifyContent: 'center' },
  foodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
    lineHeight: 21,
  },
  foodSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  foodQtyCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    maxWidth: '42%',
    marginRight: 4,
    flexShrink: 0,
  },
  foodQty: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
    textAlign: 'right',
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  foodKcalMuted: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: 3,
    textAlign: 'right',
    lineHeight: 15,
    fontVariant: ['tabular-nums'],
  },
  checkHit: { flexShrink: 0 },
  foodCheckOn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodCheckOff: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.tabInactive,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const diaryStyles = StyleSheet.create<MealFoodItemRowsStyles>({
  wrap: { marginTop: spacing.sm, width: '100%', alignSelf: 'stretch' },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10,
    gap: 10,
  },
  foodTextCol: { flex: 1, minWidth: 0, paddingRight: 4, justifyContent: 'center' },
  foodTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 20,
  },
  foodSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  foodQtyCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    maxWidth: '40%',
    marginRight: 4,
    flexShrink: 0,
  },
  foodQty: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  foodKcalMuted: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  checkHit: { flexShrink: 0 },
  foodCheckOn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodCheckOff: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
