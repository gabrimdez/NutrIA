import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Alert } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/lib/api';
import { colors, spacing, typography, borderRadius, screenPaddingX, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../../src/theme';
import { Surface, QuickOtherSheet } from '../../../src/components';
import type { WorkoutRoutineListItem } from '../../../src/types/workout';
import { quickCompleteRoutine, WORKOUT_INVALIDATION_KEYS } from '../../../src/lib/workoutApi';
import { toUserFacingErrorMessage } from '../../../src/lib/userFacingError';

export default function RoutinesScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;
  const qc = useQueryClient();

  const { data: routines = [], isLoading, refetch } = useQuery<WorkoutRoutineListItem[]>({
    queryKey: ['workout-routines'],
    queryFn: () => api.get('/api/v1/workouts/routines'),
    staleTime: 5 * 60_000,
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/workouts/routines/${id}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-routines'] });
      qc.invalidateQueries({ queryKey: ['workout-week-summary'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/workouts/routines/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-routines'] });
    },
  });

  const quickGymMut = useMutation({
    mutationFn: (routineId: string) => quickCompleteRoutine({ routine_id: routineId }),
    onSuccess: () => {
      for (const key of WORKOUT_INVALIDATION_KEYS) {
        qc.invalidateQueries({ queryKey: [...key] });
      }
    },
    onError: (e: Error) => Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e)),
  });

  const [quickOtherFor, setQuickOtherFor] = useState<WorkoutRoutineListItem | null>(null);

  const handleQuickGym = (routine: WorkoutRoutineListItem) => {
    Alert.alert(
      'Marcar como hecho hoy',
      `Se registrará "${routine.name}" como completada hoy. Podrás editar series y pesos después.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Marcar hecho', onPress: () => quickGymMut.mutate(routine.id) },
      ],
    );
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Eliminar rutina', `¿Eliminar "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => deleteMut.mutate(id) },
    ]);
  };

  const { gymRoutines, otherRoutines } = useMemo(
    () => ({
      gymRoutines: routines.filter((r) => r.category === 'gym'),
      otherRoutines: routines.filter((r) => r.category === 'other'),
    }),
    [routines],
  );

  const isEmpty = routines.length === 0 && !isLoading;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 80 }]}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primaryLight} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>RUTINAS</Text>
          <Text style={styles.title}>Mis rutinas</Text>
          <Text style={styles.subtitle}>
            {routines.length === 0
              ? 'Aún no has creado ninguna'
              : `${routines.length} ${routines.length === 1 ? 'rutina' : 'rutinas'} guardadas`}
          </Text>
        </View>

        {gymRoutines.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="barbell" size={14} color={colors.primaryLight} />
              <Text style={styles.sectionTitle}>Gimnasio</Text>
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionCount}>{gymRoutines.length}</Text>
            </View>
            {gymRoutines.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                onActivate={() => activateMut.mutate(r.id)}
                onEdit={() => router.push({ pathname: '/training/routine-editor', params: { id: r.id } })}
                onDelete={() => handleDelete(r.id, r.name)}
                onStartSession={() =>
                  router.push({ pathname: '/training/gym-session', params: { routineId: r.id } })
                }
                onQuickComplete={() => handleQuickGym(r)}
                quickPending={quickGymMut.isPending && quickGymMut.variables === r.id}
              />
            ))}
          </View>
        )}

        {otherRoutines.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="fitness" size={14} color={colors.carbs} />
              <Text style={styles.sectionTitle}>Otros deportes</Text>
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionCount}>{otherRoutines.length}</Text>
            </View>
            {otherRoutines.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                onActivate={() => activateMut.mutate(r.id)}
                onEdit={() => router.push({ pathname: '/training/routine-editor', params: { id: r.id } })}
                onDelete={() => handleDelete(r.id, r.name)}
                onStartSession={() =>
                  router.push({
                    pathname: '/training/other-session',
                    params: {
                      routineId: r.id,
                      ...(r.sport_type?.trim()
                        ? { sportType: r.sport_type.trim() }
                        : {}),
                    },
                  })
                }
                onQuickComplete={() => setQuickOtherFor(r)}
              />
            ))}
          </View>
        )}

        {isEmpty && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="barbell-outline" size={36} color={colors.primaryLight} />
            </View>
            <Text style={styles.emptyText}>Crea tu primera rutina</Text>
            <Text style={styles.emptyHint}>
              Define los días, ejercicios y series para empezar a entrenar
            </Text>
            <Pressable
              style={styles.emptyCta}
              onPress={() => router.push('/training/routine-editor')}
            >
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.emptyCtaText}>Crear rutina</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {!isEmpty && (
        <Pressable
          style={({ pressed }) => [
            styles.fab,
            { bottom: Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16 },
            pressed && styles.fabPressed,
          ]}
          onPress={() => router.push('/training/routine-editor')}
        >
          <Ionicons name="add" size={22} color={colors.white} />
          <Text style={styles.fabText}>Nueva rutina</Text>
        </Pressable>
      )}

      <QuickOtherSheet
        visible={quickOtherFor !== null}
        onDismiss={() => setQuickOtherFor(null)}
        routineId={quickOtherFor?.id ?? null}
        initialSportType={quickOtherFor?.sport_type ?? null}
      />
    </View>
  );
}

function RoutineCard({
  routine,
  onActivate,
  onEdit,
  onDelete,
  onStartSession,
  onQuickComplete,
  quickPending,
}: {
  routine: WorkoutRoutineListItem;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStartSession: () => void;
  onQuickComplete?: () => void;
  quickPending?: boolean;
}) {
  return (
    <Surface
      variant={routine.is_active ? 'elevated' : 'subtle'}
      style={[
        styles.card,
        routine.is_active && {
          borderWidth: 1,
          borderColor: colors.primaryBorderStrong,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 14,
          elevation: 6,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>
            {routine.name}
          </Text>
          <View style={styles.cardMetaRow}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            <Text style={styles.cardMeta}>
              {routine.days_per_week} {routine.days_per_week === 1 ? 'día' : 'días'}/sem
            </Text>
          </View>
        </View>
        {routine.is_active && (
          <View style={styles.activeBadge}>
            <View style={styles.activeBadgeDot} />
            <Text style={styles.activeBadgeText}>Activa</Text>
          </View>
        )}
      </View>

      <View style={styles.cardActionsRow}>
        <View style={styles.iconActions}>
          {!routine.is_active && (
            <Pressable
              onPress={onActivate}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryLight} />
            </Pressable>
          )}
          <Pressable
            onPress={onEdit}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={onDelete}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </Pressable>
        </View>

        <View style={styles.actionsRight}>
          {onQuickComplete && (
            <Pressable
              style={({ pressed }) => [
                styles.quickBtn,
                quickPending && styles.quickBtnDisabled,
                pressed && styles.pressed,
              ]}
              onPress={onQuickComplete}
              disabled={quickPending}
            >
              <Ionicons name="checkmark-done" size={12} color={colors.primaryLight} />
              <Text style={styles.quickBtnText}>
                {quickPending ? 'Guardando…' : 'Hecho hoy'}
              </Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnPressed]}
            onPress={onStartSession}
          >
            <Ionicons name="play" size={12} color={colors.white} />
            <Text style={styles.startBtnText}>Entrenar</Text>
          </Pressable>
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md },

  header: { marginBottom: spacing.xl },
  eyebrow: { ...typography.label, color: colors.primaryLight, marginBottom: 4 },
  title: { ...typography.screenTitle, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },

  section: { marginBottom: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.label, color: colors.text, letterSpacing: 0.4 },
  sectionDivider: { flex: 1, height: 1, backgroundColor: colors.border, marginLeft: 4 },
  sectionCount: { ...typography.micro, color: colors.textMuted },

  card: {
    padding: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardInfo: { flex: 1, gap: 4 },
  cardName: { ...typography.h3, color: colors.text },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMeta: { ...typography.caption, color: colors.textSecondary },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textMuted,
  },

  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  activeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  activeBadgeText: { ...typography.micro, color: colors.primaryLight, fontWeight: '700' },

  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconActions: { flexDirection: 'row', gap: spacing.xs },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },

  actionsRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  quickBtnDisabled: { opacity: 0.6 },
  quickBtnText: { ...typography.captionBold, color: colors.primaryLight },

  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  startBtnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  startBtnText: { ...typography.captionBold, color: colors.white },

  empty: {
    alignItems: 'center',
    marginTop: spacing.xxxl + 20,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyText: { ...typography.h3, color: colors.text },
  emptyHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  emptyCtaText: { ...typography.bodyBold, color: colors.white },

  fab: {
    position: 'absolute',
    right: screenPaddingX,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  fabPressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  fabText: { ...typography.captionBold, color: colors.white },
});
