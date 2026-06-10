import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/lib/api';
import { invalidateMealRelatedQueries } from '../../src/lib/mealQueryInvalidation';
import { EmptyState, LoadingScreen } from '../../src/components';
import { colors, spacing, typography, screenPaddingX, hairlineWidth } from '../../src/theme';
import { parseMealTypeParam } from '../../src/lib/mealDisplay';
import { resolvedDiaryYmd } from '../../src/lib/diaryDate';

interface SavedMeal {
  id: string;
  name: string;
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  items: any[];
}

export default function SavedMealsScreen() {
  const queryClient = useQueryClient();
  const { meal_type: mealTypeParam, date: dateParam } = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
  }>();
  const mealType = parseMealTypeParam(mealTypeParam);
  const diaryDateStr = useMemo(() => resolvedDiaryYmd(dateParam), [dateParam]);

  const { data: savedMeals, isLoading } = useQuery({
    queryKey: ['saved-meals'],
    queryFn: () => api.get<SavedMeal[]>('/api/v1/meals/saved'),
  });

  const useMealMutation = useMutation({
    mutationFn: (meal: SavedMeal) =>
      api.post('/api/v1/meals/confirm', {
        date: diaryDateStr,
        meal_type: mealType,
        title: meal.name,
        items: meal.items.map((i: any) => ({
          food_catalog_id: i.food_catalog_id,
          custom_name: i.custom_name,
          grams: i.grams,
          kcal: i.kcal,
          protein_g: i.protein_g,
          carbs_g: i.carbs_g,
          fat_g: i.fat_g,
        })),
      }),
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      router.back();
    },
  });

  if (isLoading) return <LoadingScreen />;

  if (!savedMeals?.length) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Sin comidas guardadas"
          description="Guarda comidas frecuentes para registrarlas rápido."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={savedMeals}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => useMealMutation.mutate(item)}
            style={[styles.row, index > 0 && styles.rowBorder]}
          >
            <Text style={styles.mealName}>{item.name}</Text>
            <Text style={styles.mealMacros}>
              {Math.round(item.total_kcal)} kcal · P {Math.round(item.total_protein_g)} · C{' '}
              {Math.round(item.total_carbs_g)} · G {Math.round(item.total_fat_g)}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  row: { paddingVertical: spacing.md },
  rowBorder: {
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  mealName: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  mealMacros: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
});
