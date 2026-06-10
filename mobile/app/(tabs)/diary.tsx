import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import {
  CompactMacroColumn,
  EmptyState,
  LoadingScreen,
  Surface,
  ListRow,
  MealTypeIcon,
  MealFoodItemRows,
  SlideUpView,
  StaggerItem,
  FadeInView,
  ScreenFocusProvider,
} from '../../src/components';
import { colors, spacing, typography, borderRadius, screenPaddingX, iconSize, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../src/theme';
import { DayDiary, MealEntry } from '../../src/types';
import { mealDisplayTitle, formatMealTime } from '../../src/lib/mealDisplay';
import { invalidateMealRelatedQueries } from '../../src/lib/mealQueryInvalidation';
import {
  toLocalYmd,
  parseLocalYmd,
  isValidYmd,
  minDiarySelectableDate,
  isDiaryDateBeforeMin,
} from '../../src/lib/diaryDate';

function clampDiaryDate(d: Date): Date {
  return isDiaryDateBeforeMin(d) ? minDiarySelectableDate() : d;
}

function capitalizeEs(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DiaryScreen() {
  const insets = useSafeAreaInsets();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof dateParam === 'string' && isValidYmd(dateParam)) {
      return clampDiaryDate(parseLocalYmd(dateParam));
    }
    return new Date();
  });
  const dateStr = useMemo(() => toLocalYmd(selectedDate), [selectedDate]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof dateParam === 'string' && isValidYmd(dateParam)) {
      setSelectedDate(clampDiaryDate(parseLocalYmd(dateParam)));
    }
  }, [dateParam]);

  const { data: diary, isLoading } = useQuery({
    queryKey: ['diary', dateStr],
    queryFn: () => api.get<DayDiary>(`/api/v1/diary/day?date=${dateStr}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (mealId: string) => api.delete(`/api/v1/meals/${mealId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diary', dateStr] });
      invalidateMealRelatedQueries(queryClient);
    },
    onError: (e: unknown) =>
      Alert.alert('No se pudo eliminar', e instanceof Error ? e.message : 'Inténtalo de nuevo.'),
  });

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    const minD = minDiarySelectableDate();
    if (isDiaryDateBeforeMin(newDate)) {
      setSelectedDate(minD);
      return;
    }
    setSelectedDate(newDate);
  };

  const handleDelete = (meal: MealEntry) => {
    Alert.alert(
      'Eliminar comida',
      `¿Eliminar ${meal.title || mealDisplayTitle(meal)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => deleteMutation.mutate(meal.id) },
      ],
    );
  };

  const today = useMemo(() => new Date(), []);
  const isToday = isSameDay(selectedDate, today);

  const longDate = capitalizeEs(
    selectedDate.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );

  const sortedMeals = useMemo(
    () =>
      [...(diary?.meals || [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [diary?.meals],
  );

  if (isLoading) return <LoadingScreen />;

  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;

  return (
    <ScreenFocusProvider>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top, spacing.md) + spacing.sm, paddingBottom: bottomPad },
      ]}
    >
      <SlideUpView delay={0} duration={450} distance={18}>
        <Text style={styles.screenTitle}>Diario</Text>
      </SlideUpView>

      <SlideUpView delay={80} duration={450} distance={20}>
      <Surface variant="subtle" padding="md" style={styles.dateSurface}>
        <View style={styles.dateRow}>
          <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrowBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={iconSize.lg} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.dateCenter}>
            <Text style={styles.dateMain}>{isToday ? 'Hoy' : capitalizeEs(selectedDate.toLocaleDateString('es-ES', { weekday: 'long' }))}</Text>
            <Text style={styles.dateSub}>{longDate}</Text>
          </View>
          <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateArrowBtn} hitSlop={12}>
            <Ionicons name="chevron-forward" size={iconSize.lg} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </Surface>
      </SlideUpView>

      {diary ? (
        <SlideUpView delay={200} duration={500} distance={25}>
        <Surface variant="elevated" padding="lg" style={styles.nutritionBlock}>
          <View style={styles.nutritionHeader}>
            <Text style={styles.nutritionTitle}>Resumen</Text>
            <View style={styles.kcalBlock}>
              <Text style={styles.nutritionKcal}>{Math.round(diary.total_kcal).toLocaleString('es-ES')}</Text>
              <Text style={styles.nutritionKcalLabel}>kcal</Text>
            </View>
          </View>
          <View style={styles.macroRow}>
            <CompactMacroColumn
              label="Proteínas"
              current={diary.total_protein_g}
              target={diary.target_protein_g || 150}
              color={colors.protein}
              icon={require('../../assets/images/macros/ring-protein.png')}
              iconScale={1.28}
            />
            <CompactMacroColumn
              label="Carbos"
              current={diary.total_carbs_g}
              target={diary.target_carbs_g || 230}
              color={colors.carbs}
              icon={require('../../assets/images/macros/ring-carbs.png')}
            />
            <CompactMacroColumn
              label="Grasas"
              current={diary.total_fat_g}
              target={diary.target_fat_g || 65}
              color={colors.fat}
              icon={require('../../assets/images/macros/ring-fat.png')}
              iconScale={1.07}
            />
          </View>
        </Surface>
        </SlideUpView>
      ) : null}

      <SlideUpView delay={320} duration={450} distance={20}>
      <View style={styles.mealsHeader}>
        <Text style={styles.mealsTitle}>Comidas</Text>
        <Text style={styles.mealsCount}>
          {sortedMeals.length} {sortedMeals.length === 1 ? 'registro' : 'registros'}
        </Text>
      </View>
      </SlideUpView>

      {sortedMeals.length > 0 ? (
        sortedMeals.map((meal, mealIdx) => (
          <StaggerItem key={meal.id} index={mealIdx} baseDelay={400} staggerMs={80}>
          <Surface variant="subtle" padding="lg" style={styles.mealCard}>
            <Pressable onPress={() => router.push(`/meal/${meal.id}`)} onLongPress={() => handleDelete(meal)}>
              <View style={styles.mealCardHeader}>
                <View style={styles.mealCardLeft}>
                  <MealTypeIcon mealType={meal.meal_type} size={52} />
                  <View>
                    <Text style={styles.mealCardTitle}>{mealDisplayTitle(meal)}</Text>
                    <Text style={styles.mealCardTime}>{formatMealTime(meal.created_at)}</Text>
                  </View>
                </View>
                <View style={styles.kcalCol}>
                  <Text style={styles.mealKcal}>{Math.round(meal.total_kcal)}</Text>
                  <Text style={styles.mealKcalUnit}>kcal</Text>
                </View>
              </View>
            </Pressable>

            {(meal.items?.length ?? 0) > 0 ? (
              <View style={styles.mealItemsList}>
                <MealFoodItemRows mealId={meal.id} items={meal.items!} variant="diary" dateStr={dateStr} />
              </View>
            ) : null}

            <Pressable
              style={styles.addItemLink}
              onPress={() => router.push({ pathname: '/(tabs)/search', params: { date: dateStr } } as never)}
            >
              <Ionicons name="add" size={16} color={colors.primaryLight} />
              <Text style={styles.addItemText}>Añadir alimento</Text>
            </Pressable>
          </Surface>
          </StaggerItem>
        ))
      ) : (
        <EmptyState
          title="Sin registros"
          description="No hay comidas en esta fecha. Añade una desde el botón de registro."
          actionLabel="Añadir comida"
          onAction={() => router.push({ pathname: '/(tabs)/search', params: { date: dateStr } } as never)}
        />
      )}
    </ScrollView>
    </ScreenFocusProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX },
  screenTitle: { ...typography.screenTitle, color: colors.text, marginBottom: spacing.lg },
  dateSurface: { marginBottom: spacing.lg },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateArrowBtn: { padding: spacing.xs },
  dateCenter: { alignItems: 'center', flex: 1 },
  dateMain: { ...typography.sectionTitle, color: colors.text },
  dateSub: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  nutritionBlock: { marginBottom: spacing.xl },
  nutritionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  nutritionTitle: { ...typography.sectionTitle, color: colors.text },
  kcalBlock: { alignItems: 'flex-end' },
  nutritionKcal: { ...typography.metricMd, color: colors.text },
  nutritionKcalLabel: { ...typography.small, color: colors.textMuted },
  macroRow: { flexDirection: 'row', gap: spacing.md },
  mealsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  mealsTitle: { ...typography.sectionTitle, color: colors.text },
  mealsCount: { ...typography.caption, color: colors.textMuted },
  mealCard: { marginBottom: spacing.md },
  mealCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  mealCardTitle: { ...typography.bodyBold, color: colors.text },
  mealCardTime: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  kcalCol: { alignItems: 'flex-end' },
  mealKcal: { ...typography.metricSm, color: colors.text, fontVariant: ['tabular-nums'] },
  mealKcalUnit: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  mealItemsList: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  addItemLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  addItemText: { ...typography.caption, color: colors.primaryLight, fontWeight: '600' },
});
