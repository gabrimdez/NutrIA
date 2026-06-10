import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from './ui/BottomSheet';
import { QuickOtherSheet } from './QuickOtherSheet';
import { colors, spacing, typography, borderRadius, screenPaddingX } from '../theme';
import { quickCompleteRoutine, WORKOUT_INVALIDATION_KEYS } from '../lib/workoutApi';
import { toUserFacingErrorMessage } from '../lib/userFacingError';
import type { WorkoutWeekDayObjective, WorkoutWeekDayPlan } from '../types/workout';
import { WEEKDAY_LABELS_FULL } from '../types/workout';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  plan: WorkoutWeekDayPlan | null;
  /** Día sin plan: weekday y dateStr para los CTAs de registro libre. */
  fallbackWeekday?: number;
  fallbackDate?: string;
}

/**
 * Hoja inferior con los objetivos del día. Cada objetivo se puede marcar como
 * "Hecho ahora" sin abrir el editor, o se puede editar a fondo.
 */
export function WeekDaySheet({ visible, onDismiss, plan, fallbackWeekday, fallbackDate }: Props) {
  const qc = useQueryClient();
  const [quickOtherTarget, setQuickOtherTarget] = useState<WorkoutWeekDayObjective | null>(null);
  const [pendingRoutineId, setPendingRoutineId] = useState<string | null>(null);

  const quickGymMut = useMutation({
    mutationFn: (obj: WorkoutWeekDayObjective) =>
      quickCompleteRoutine({
        routine_id: obj.routine_id,
        routine_day_id: obj.routine_day_id,
        date: plan?.date ?? fallbackDate ?? undefined,
      }),
    onSuccess: () => {
      for (const key of WORKOUT_INVALIDATION_KEYS) {
        qc.invalidateQueries({ queryKey: [...key] });
      }
      setPendingRoutineId(null);
    },
    onError: (e: Error) => {
      setPendingRoutineId(null);
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e));
    },
  });

  const handleQuickGym = (obj: WorkoutWeekDayObjective) => {
    setPendingRoutineId(obj.routine_id);
    quickGymMut.mutate(obj);
  };

  const handleEdit = (obj: WorkoutWeekDayObjective) => {
    onDismiss();
    if (obj.session_id) {
      // Sesión ya creada: abrir el editor correspondiente.
      const path = obj.category === 'gym' ? '/training/gym-session' : '/training/other-session';
      router.push({ pathname: path, params: { sessionId: obj.session_id } });
      return;
    }
    if (obj.category === 'gym') {
      router.push({
        pathname: '/training/gym-session',
        params: {
          routineId: obj.routine_id,
          routineDayId: obj.routine_day_id,
        },
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

  const renderObjective = (obj: WorkoutWeekDayObjective) => {
    const isGym = obj.category === 'gym';
    const pending = pendingRoutineId === obj.routine_id && quickGymMut.isPending;
    return (
      <View key={`${obj.routine_id}:${obj.routine_day_id}`} style={[styles.objCard, obj.completed && styles.objCardDone]}>
        <View style={styles.objHeader}>
          <View style={[styles.objIcon, isGym ? styles.objIconGym : styles.objIconOther]}>
            <Ionicons
              name={isGym ? 'barbell' : 'fitness'}
              size={16}
              color={isGym ? colors.primaryLight : colors.carbs}
            />
          </View>
          <View style={styles.objTitles}>
            <Text style={styles.objRoutine} numberOfLines={1}>{obj.routine_name}</Text>
            <Text style={styles.objLabel} numberOfLines={1}>
              {obj.day_label}
              {obj.sport_type ? ` · ${obj.sport_type}` : ''}
            </Text>
          </View>
          {obj.completed ? (
            <View style={styles.objCheckDone}>
              <Ionicons name="checkmark" size={14} color={colors.white} />
            </View>
          ) : null}
        </View>

        <View style={styles.objActions}>
          {obj.completed ? (
            <Pressable
              style={({ pressed }) => [styles.actionGhost, pressed && styles.pressed]}
              onPress={() => handleEdit(obj)}
            >
              <Ionicons name="eye-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.actionGhostText}>Ver sesión</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                style={({ pressed }) => [styles.actionGhost, pressed && styles.pressed]}
                onPress={() => handleEdit(obj)}
              >
                <Ionicons name="create-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.actionGhostText}>Editar</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.actionPrimary,
                  pending && styles.actionDisabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  if (isGym) {
                    handleQuickGym(obj);
                  } else {
                    setQuickOtherTarget(obj);
                  }
                }}
                disabled={pending}
              >
                {pending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="checkmark-done" size={14} color={colors.white} />
                )}
                <Text style={styles.actionPrimaryText}>
                  {pending ? 'Guardando…' : 'Hecho ahora'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  };

  const objectives = plan?.objectives ?? [];
  const weekday = plan?.weekday ?? fallbackWeekday ?? 0;
  const dateStr = plan?.date ?? fallbackDate ?? '';
  const isComplete = plan?.is_complete ?? false;

  return (
    <>
      <BottomSheet
        visible={visible}
        onDismiss={onDismiss}
        maxHeightFraction={0.78}
        maxHeightCap={620}
      >
        <View style={styles.body}>
          <Text style={styles.title}>{WEEKDAY_LABELS_FULL[weekday]}</Text>
          <Text style={styles.subtitle}>
            {dateStr}
            {plan ? (
              ` · ${plan.completed_count}/${plan.total} ${plan.total === 1 ? 'objetivo' : 'objetivos'}`
            ) : ''}
          </Text>

          {isComplete && (
            <View style={styles.completeBanner}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.completeBannerText}>¡Día completo!</Text>
            </View>
          )}

          {objectives.length > 0 ? (
            <View style={styles.list}>
              {objectives.map(renderObjective)}
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Este día no tiene objetivos planeados.
              </Text>
              <View style={styles.emptyActions}>
                <Pressable
                  style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}
                  onPress={() => {
                    onDismiss();
                    router.push('/training/gym-session');
                  }}
                >
                  <Ionicons name="barbell-outline" size={16} color={colors.primaryLight} />
                  <Text style={styles.emptyBtnText}>Sesión gym libre</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}
                  onPress={() => {
                    onDismiss();
                    router.push('/training/other-session');
                  }}
                >
                  <Ionicons name="fitness-outline" size={16} color={colors.carbs} />
                  <Text style={styles.emptyBtnText}>Otro deporte</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </BottomSheet>

      <QuickOtherSheet
        visible={quickOtherTarget !== null}
        onDismiss={() => setQuickOtherTarget(null)}
        routineId={quickOtherTarget?.routine_id ?? null}
        initialSportType={quickOtherTarget?.sport_type ?? null}
        onSaved={() => {
          // Tras guardar, también cerramos la hoja del día para reflejar el progreso fresco.
          onDismiss();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: screenPaddingX,
    paddingBottom: spacing.lg,
  },
  title: { ...typography.h2, color: colors.text },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.lg,
  },

  completeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.successMuted,
    borderWidth: 1,
    borderColor: colors.success,
    marginBottom: spacing.md,
  },
  completeBannerText: { ...typography.captionBold, color: colors.success },

  list: { gap: spacing.sm },

  objCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  objCardDone: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success,
  },
  objHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  objIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  objIconGym: { backgroundColor: colors.primaryMuted },
  objIconOther: { backgroundColor: colors.carbsMuted },
  objTitles: { flex: 1, minWidth: 0 },
  objRoutine: { ...typography.bodyBold, color: colors.text },
  objLabel: { ...typography.caption, color: colors.textSecondary },
  objCheckDone: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },

  objActions: { flexDirection: 'row', gap: spacing.sm },
  actionGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionGhostText: { ...typography.captionBold, color: colors.textSecondary },
  actionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  actionPrimaryText: { ...typography.captionBold, color: colors.white },
  actionDisabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },

  empty: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  emptyActions: { flexDirection: 'row', gap: spacing.sm },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyBtnText: { ...typography.captionBold, color: colors.text },
});
