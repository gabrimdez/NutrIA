import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, PanResponder, Alert } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/lib/api';
import { toLocalYmd } from '../../../src/lib/diaryDate';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  screenPaddingX,
  DOCK_H,
  DOCK_MARGIN_BOTTOM,
} from '../../../src/theme';
import { Surface, WeekDaySheet } from '../../../src/components';
import type {
  WorkoutWeekSummary,
  WorkoutWeekDayPlan,
  WorkoutWeekDayObjective,
  WorkoutRoutineListItem,
} from '../../../src/types/workout';
import { WEEKDAY_LABELS } from '../../../src/types/workout';

export default function TrainingHub() {
  const insets = useSafeAreaInsets();
  const swipedRef = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx > 80 && !swipedRef.current) {
          swipedRef.current = true;
          router.replace('/(tabs)' as never);
        }
      },
    }),
  ).current;

  const { data: summary, isLoading, refetch } = useQuery<WorkoutWeekSummary>({
    queryKey: ['workout-week-summary'],
    queryFn: () => api.get('/api/v1/workouts/summary/week'),
    staleTime: 2 * 60_000,
  });

  const { data: routines = [] } = useQuery<WorkoutRoutineListItem[]>({
    queryKey: ['workout-routines'],
    queryFn: () => api.get('/api/v1/workouts/routines'),
    staleTime: 5 * 60_000,
  });
  const activeGymRoutine = routines.find((r) => r.is_active && r.category === 'gym');

  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 20;
  // Fecha local (no UTC) para evitar desfases nocturnos.
  const today = new Date();
  const todayStr = toLocalYmd(today);
  // weekday: 0=Lun … 6=Dom (alineado con WEEKDAY_LABELS y el backend).
  const todayWeekday = (today.getDay() + 6) % 7;

  const completedDays = summary?.completed_days ?? 0;
  const plannedDays = summary?.planned_days ?? 0;
  const progressPct = plannedDays > 0 ? Math.min(1, completedDays / plannedDays) : 0;
  const remaining = Math.max(0, plannedDays - completedDays);

  const dayPlans = useMemo(() => {
    const map = new Map<number, WorkoutWeekDayPlan>();
    for (const d of summary?.days ?? []) {
      map.set(d.weekday, d);
    }
    return map;
  }, [summary?.days]);

  const todayPlan = dayPlans.get(todayWeekday);
  const todayObjectives = todayPlan?.objectives ?? [];

  // Solo cuenta sesiones de gym de hoy para el CTA "Entrenar ahora" (que es de gym).
  const todayGymTrained =
    summary?.sessions.some(
      (s) => s.date === todayStr && s.completed && s.category === 'gym',
    ) ?? false;

  const handleOpenObjective = (obj: WorkoutWeekDayObjective) => {
    if (obj.session_id) {
      const path = obj.category === 'gym' ? '/training/gym-session' : '/training/other-session';
      router.push({ pathname: path, params: { sessionId: obj.session_id } });
      return;
    }
    if (obj.category === 'gym') {
      router.push({
        pathname: '/training/gym-session',
        params: { routineId: obj.routine_id, routineDayId: obj.routine_day_id },
      });
    } else {
      router.push({
        pathname: '/training/other-session',
        params: {
          routineId: obj.routine_id,
          ...(obj.sport_type ? { sportType: obj.sport_type } : {}),
        },
      });
    }
  };

  // Fallback por si el backend no devuelve `days` (p.ej. respuestas antiguas
  // cacheadas): caemos al array plano de sesiones para no dejar la semana en blanco.
  const { sessionDates, completedDates } = useMemo(() => {
    const sessions = summary?.sessions ?? [];
    return {
      sessionDates: new Set(sessions.map((s) => s.date)),
      completedDates: new Set(sessions.filter((s) => s.completed).map((s) => s.date)),
    };
  }, [summary?.sessions]);

  const weekDays = useMemo(() => {
    const base = new Date();
    // Lunes 0 … Domingo 6, alineado con WEEKDAY_LABELS y el backend.
    const offsetToMonday = (base.getDay() + 6) % 7;
    return WEEKDAY_LABELS.map((label, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() - offsetToMonday + i);
      // Fecha local (no UTC) para que coincida con todayStr en horarios nocturnos.
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const plan = dayPlans.get(i);

      if (plan) {
        return {
          label,
          dayNumber: d.getDate(),
          dateStr,
          isDone: plan.is_complete,
          hasPlan: plan.total > 0,
          hasPartial: plan.total > 0 && plan.completed_count > 0 && !plan.is_complete,
          objectivesText: plan.total > 1 ? `${plan.completed_count}/${plan.total}` : '',
          isToday: dateStr === todayStr,
        };
      }

      return {
        label,
        dayNumber: d.getDate(),
        dateStr,
        isDone: completedDates.has(dateStr),
        hasPlan: sessionDates.has(dateStr),
        hasPartial: sessionDates.has(dateStr) && !completedDates.has(dateStr),
        objectivesText: '',
        isToday: dateStr === todayStr,
      };
    });
  }, [dayPlans, completedDates, sessionDates, todayStr]);

  const headline =
    plannedDays === 0
      ? 'Sin sesiones planificadas'
      : remaining === 0
        ? '¡Semana completada!'
        : remaining === 1
          ? 'Queda 1 sesión'
          : `Quedan ${remaining} sesiones`;

  const [openDay, setOpenDay] = useState<{ weekday: number; dateStr: string } | null>(null);
  const openPlan = openDay ? (dayPlans.get(openDay.weekday) ?? null) : null;

  const onRefresh = useCallback(async () => {
    try {
      await refetch();
    } catch {
      Alert.alert('Error', 'No se pudo actualizar. Inténtalo de nuevo.');
    }
  }, [refetch]);

  return (
    <ScrollView
      {...panResponder.panHandlers}
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: spacing.md, paddingBottom: bottomPad }]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.primaryLight} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ENTRENAMIENTO</Text>
        <Text style={styles.title}>Tu semana</Text>
      </View>

      {/* Hero: progreso semanal */}
      <Surface variant="elevated" style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroHeadline}>{headline}</Text>
            <View style={styles.heroMetaRow}>
              <View style={styles.heroDotPrimary} />
              <Text style={styles.heroMeta}>
                <Text style={styles.heroMetaStrong}>{completedDays}</Text>
                <Text style={styles.heroMetaDim}> de {plannedDays} completadas</Text>
              </Text>
            </View>
          </View>
          <View style={styles.heroRing}>
            <Text style={styles.heroRingValue}>{Math.round(progressPct * 100)}</Text>
            <Text style={styles.heroRingUnit}>%</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
        </View>

        <View style={styles.weekRow}>
          {weekDays.map((d, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.weekDayCol,
                pressed && styles.pressed,
              ]}
              onPress={() => setOpenDay({ weekday: i, dateStr: d.dateStr })}
              accessibilityRole="button"
              accessibilityLabel={`Ver objetivos del ${d.label}`}
            >
              <Text style={[styles.weekDayLabel, d.isToday && styles.weekDayLabelToday]}>
                {d.label}
              </Text>
              <View
                style={[
                  styles.weekDot,
                  d.isToday && styles.weekDotToday,
                  d.hasPartial && styles.weekDotPending,
                  d.isDone && styles.weekDotDone,
                ]}
              >
                {d.isDone ? (
                  <Ionicons name="checkmark" size={13} color={colors.white} />
                ) : (
                  <Text
                    style={[
                      styles.weekDotNumber,
                      d.isToday && styles.weekDotNumberToday,
                      d.hasPartial && styles.weekDotNumberPending,
                    ]}
                  >
                    {d.dayNumber}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </Surface>

      {/* Hoy: entrenos planificados */}
      <View style={styles.todaySection}>
        <View style={styles.todayHeaderRow}>
          <Text style={styles.sectionTitle}>Hoy</Text>
          {todayPlan && todayPlan.total > 0 && (
            <Text style={styles.todayCounter}>
              {todayPlan.completed_count}/{todayPlan.total}
            </Text>
          )}
        </View>

        {todayObjectives.length > 0 ? (
          todayObjectives.map((obj) => {
            const isGym = obj.category === 'gym';
            return (
              <Pressable
                key={obj.session_id ?? `${obj.routine_id}:${obj.routine_day_id}`}
                onPress={() => handleOpenObjective(obj)}
                style={({ pressed }) => [styles.todayWrap, pressed && styles.pressed]}
              >
                <Surface
                  variant="elevated"
                  style={[styles.todayCard, obj.completed && styles.todayCardDone]}
                >
                  <View
                    style={[
                      styles.todayIcon,
                      obj.completed
                        ? styles.todayIconDone
                        : isGym
                          ? styles.todayIconGym
                          : styles.todayIconOther,
                    ]}
                  >
                    <Ionicons
                      name={obj.completed ? 'checkmark' : isGym ? 'barbell' : 'fitness'}
                      size={20}
                      color={
                        obj.completed
                          ? colors.success
                          : isGym
                            ? colors.primaryLight
                            : colors.carbs
                      }
                    />
                  </View>
                  <View style={styles.todayText}>
                    <Text style={styles.todayLabel} numberOfLines={1}>
                      {obj.routine_name}
                    </Text>
                    <Text style={styles.todaySub} numberOfLines={1}>
                      {[
                        obj.day_label,
                        obj.sport_type && obj.sport_type !== obj.day_label ? obj.sport_type : null,
                        obj.completed ? 'Completado' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={obj.completed ? colors.success : colors.primaryLight}
                  />
                </Surface>
              </Pressable>
            );
          })
        ) : activeGymRoutine ? (
          <Pressable
            onPress={() =>
              !todayGymTrained &&
              router.push({
                pathname: '/training/gym-session',
                params: { routineId: activeGymRoutine.id },
              })
            }
            style={({ pressed }) => [styles.todayWrap, pressed && !todayGymTrained && styles.pressed]}
            disabled={todayGymTrained}
          >
            <Surface variant="elevated" style={[styles.todayCard, todayGymTrained && styles.todayCardDone]}>
              <View style={[styles.todayIcon, todayGymTrained && styles.todayIconDone]}>
                <Ionicons
                  name={todayGymTrained ? 'checkmark' : 'play'}
                  size={20}
                  color={todayGymTrained ? colors.success : colors.white}
                />
              </View>
              <View style={styles.todayText}>
                <Text style={styles.todayLabel}>
                  {todayGymTrained ? '¡Ya entrenaste hoy!' : 'Entrenar ahora'}
                </Text>
                <Text style={styles.todaySub} numberOfLines={1}>
                  {todayGymTrained ? 'Sesión completada · ' : ''}
                  {activeGymRoutine.name}
                </Text>
              </View>
              {!todayGymTrained && (
                <Ionicons name="chevron-forward" size={18} color={colors.primaryLight} />
              )}
            </Surface>
          </Pressable>
        ) : (
          <Surface style={styles.todayEmpty}>
            <Ionicons name="bed-outline" size={20} color={colors.textMuted} />
            <Text style={styles.todayEmptyText}>Día de descanso · sin entrenos planificados</Text>
          </Surface>
        )}
      </View>

      {/* Historial — acceso prominente */}
      <Pressable
        onPress={() => router.push('/training/session-history')}
        style={({ pressed }) => [styles.catWrap, pressed && styles.pressed]}
      >
        <Surface style={styles.catCard}>
          <View style={[styles.catIconPrimary, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="time-outline" size={22} color={colors.text} />
          </View>
          <View style={styles.catText}>
            <Text style={styles.catTitle}>Historial de sesiones</Text>
            <Text style={styles.catDesc}>
              {completedDays > 0
                ? `${completedDays} sesión${completedDays !== 1 ? 'es' : ''} esta semana`
                : 'Revisa tus entrenamientos anteriores'}
            </Text>
          </View>
          <View style={styles.catChevron}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Surface>
      </Pressable>

      {/* Categorías — acción principal */}
      <Text style={styles.sectionTitle}>Registrar entrenamiento</Text>

      <Pressable
        onPress={() => router.push('/training/routines')}
        style={({ pressed }) => [styles.catWrap, pressed && styles.pressed]}
      >
        <Surface style={styles.catCard}>
          <View style={styles.catIconPrimary}>
            <Ionicons name="barbell" size={22} color={colors.primaryLight} />
          </View>
          <View style={styles.catText}>
            <Text style={styles.catTitle}>Gimnasio</Text>
            <Text style={styles.catDesc}>Rutinas, series, peso y repeticiones</Text>
          </View>
          <View style={styles.catChevron}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Surface>
      </Pressable>

      <Pressable
        onPress={() => router.push('/training/other-activities')}
        style={({ pressed }) => [styles.catWrap, pressed && styles.pressed]}
      >
        <Surface style={styles.catCard}>
          <View style={[styles.catIconPrimary, { backgroundColor: colors.carbsMuted }]}>
            <Ionicons name="fitness" size={22} color={colors.carbs} />
          </View>
          <View style={styles.catText}>
            <Text style={styles.catTitle}>Otras actividades</Text>
            <Text style={styles.catDesc}>Running, ciclismo, fútbol, natación…</Text>
          </View>
          <View style={styles.catChevron}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Surface>
      </Pressable>

      {/* Acceso rápido */}
      <Text style={styles.sectionTitle}>Seguimiento</Text>

      <Pressable
        onPress={() => router.push('/training/progress')}
        style={({ pressed }) => [styles.catWrap, pressed && styles.pressed]}
      >
        <Surface style={styles.catCard}>
          <View style={styles.catIconPrimary}>
            <Ionicons name="trending-up-outline" size={22} color={colors.primaryLight} />
          </View>
          <View style={styles.catText}>
            <Text style={styles.catTitle}>Progresión</Text>
            <Text style={styles.catDesc}>Evolución de peso y volumen por ejercicio</Text>
          </View>
          <View style={styles.catChevron}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Surface>
      </Pressable>

      <WeekDaySheet
        visible={openDay !== null}
        onDismiss={() => setOpenDay(null)}
        plan={openPlan}
        fallbackWeekday={openDay?.weekday}
        fallbackDate={openDay?.dateStr}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX },

  header: { marginBottom: spacing.lg },
  eyebrow: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: 4,
  },
  title: { ...typography.screenTitle, color: colors.text },

  heroCard: {
    padding: spacing.lg,
    marginBottom: spacing.xxl,
    gap: spacing.lg,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroLeft: { flex: 1, gap: 8 },
  heroHeadline: { ...typography.h3, color: colors.text },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroDotPrimary: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primaryLight,
  },
  heroMeta: { ...typography.caption },
  heroMetaStrong: { color: colors.text, fontWeight: '700' },
  heroMetaDim: { color: colors.textSecondary },

  heroRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryMuted,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  heroRingValue: {
    ...typography.metricSm,
    color: colors.primaryLight,
    lineHeight: 22,
  },
  heroRingUnit: {
    ...typography.captionBold,
    color: colors.primaryLight,
    marginLeft: 1,
    marginTop: 2,
  },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },

  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  weekDayCol: { alignItems: 'center', gap: 8, flex: 1 },
  weekDayLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  weekDayLabelToday: { color: colors.primaryLight, fontWeight: '700' },
  weekDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  weekDotToday: {
    borderColor: colors.primaryBorderStrong,
    backgroundColor: colors.primaryGlowSoft,
  },
  weekDotPending: {
    backgroundColor: colors.warningMuted,
    borderColor: colors.warning,
  },
  weekDotDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekDotNumber: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  weekDotNumberToday: { color: colors.primaryLight },
  weekDotNumberPending: { color: colors.warning },

  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: spacing.md,
  },

  catWrap: { marginBottom: spacing.md },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  catIconPrimary: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catText: { flex: 1, gap: 2 },
  catTitle: { ...typography.bodyBold, color: colors.text },
  catDesc: { ...typography.caption, color: colors.textSecondary },
  catChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },

  todaySection: { marginBottom: spacing.md },
  todayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  todayCounter: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  todayWrap: { marginBottom: spacing.md },
  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    overflow: 'hidden',
  },
  todayCardDone: {
    borderColor: colors.success,
  },
  todayIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayIconGym: {
    backgroundColor: colors.primaryMuted,
  },
  todayIconOther: {
    backgroundColor: colors.carbsMuted,
  },
  todayIconDone: {
    backgroundColor: colors.successMuted,
    borderWidth: 1,
    borderColor: colors.success,
  },
  todayText: { flex: 1, gap: 2 },
  todayLabel: { ...typography.bodyBold, color: colors.text },
  todaySub: { ...typography.caption, color: colors.textSecondary },
  todayEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  todayEmptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
});
