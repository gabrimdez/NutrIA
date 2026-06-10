import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Alert } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/lib/api';
import { colors, spacing, typography, borderRadius, screenPaddingX, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../../src/theme';
import { Surface } from '../../../src/components';
import type { WorkoutSessionListItem } from '../../../src/types/workout';
import { WEEKDAY_LABELS_FULL } from '../../../src/types/workout';

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export default function OtherActivitiesScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;
  const qc = useQueryClient();

  const { data: sessions = [], isLoading, refetch } = useQuery<WorkoutSessionListItem[]>({
    queryKey: ['workout-sessions', 'other'],
    queryFn: () => api.get('/api/v1/workouts/sessions?category=other'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/workouts/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-sessions'] });
      qc.invalidateQueries({ queryKey: ['workout-week-summary'] });
    },
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/workouts/sessions/${id}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-sessions'] });
      qc.invalidateQueries({ queryKey: ['workout-week-summary'] });
    },
  });

  const completed = sessions.filter((s) => s.completed).length;
  const isEmpty = sessions.length === 0 && !isLoading;

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
          <Text style={styles.eyebrow}>OTROS DEPORTES</Text>
          <Text style={styles.title}>Actividades</Text>
          <Text style={styles.subtitle}>Running, ciclismo, fútbol, natación…</Text>
        </View>

        {sessions.length > 0 && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{sessions.length}</Text>
              <Text style={styles.summaryLabel}>sesiones</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.primaryLight }]}>{completed}</Text>
              <Text style={styles.summaryLabel}>completadas</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.warning }]}>
                {sessions.length - completed}
              </Text>
              <Text style={styles.summaryLabel}>pendientes</Text>
            </View>
          </View>
        )}

        {isEmpty && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="fitness-outline" size={36} color={colors.carbs} />
            </View>
            <Text style={styles.emptyText}>Sin sesiones registradas</Text>
            <Text style={styles.emptyHint}>
              Registra tu primera actividad para empezar a llevar el seguimiento
            </Text>
            <Pressable
              style={styles.emptyCta}
              onPress={() => router.push('/training/other-session')}
            >
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.emptyCtaText}>Registrar sesión</Text>
            </Pressable>
          </View>
        )}

        {sessions.length > 0 && <Text style={styles.listLabel}>Recientes</Text>}

        {sessions.map((s) => {
          const dayNum = parseInt(s.date.split('-')[2], 10);
          const monthShort = MONTHS_SHORT[parseInt(s.date.split('-')[1], 10) - 1];

          return (
            <Surface key={s.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.dateBlock}>
                  <Text style={styles.dateDay}>{dayNum}</Text>
                  <Text style={styles.dateMonth}>{monthShort}</Text>
                </View>

                <View style={styles.cardInfo}>
                  <Text style={styles.cardWeekday}>{WEEKDAY_LABELS_FULL[s.weekday]}</Text>
                  <Text style={styles.cardSport} numberOfLines={1}>
                    {s.sport_type || s.day_label || 'Otro deporte'}
                  </Text>
                </View>

                {s.completed ? (
                  <View style={styles.statusDone}>
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                  </View>
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.completeBtn, pressed && styles.pressed]}
                    onPress={() => completeMut.mutate(s.id)}
                  >
                    <Ionicons name="checkmark" size={14} color={colors.primaryLight} />
                    <Text style={styles.completeText}>Completar</Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.cardActions}>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/training/other-session', params: { sessionId: s.id } })
                  }
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                  hitSlop={6}
                >
                  <Ionicons name="create-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.actionText}>Editar</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert('Eliminar', '¿Eliminar esta sesión?', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Eliminar', style: 'destructive', onPress: () => deleteMut.mutate(s.id) },
                    ])
                  }
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                  hitSlop={6}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.error} />
                  <Text style={[styles.actionText, { color: colors.error }]}>Eliminar</Text>
                </Pressable>
              </View>
            </Surface>
          );
        })}
      </ScrollView>

      {!isEmpty && (
        <Pressable
          style={({ pressed }) => [
            styles.fab,
            { bottom: Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16 },
            pressed && styles.fabPressed,
          ]}
          onPress={() => router.push('/training/other-session')}
        >
          <Ionicons name="add" size={22} color={colors.white} />
          <Text style={styles.fabText}>Registrar</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md },

  header: { marginBottom: spacing.lg },
  eyebrow: { ...typography.label, color: colors.carbs, marginBottom: 4 },
  title: { ...typography.screenTitle, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { ...typography.metricMd, color: colors.text },
  summaryLabel: { ...typography.micro, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDivider: { width: 1, height: 32, backgroundColor: colors.border },

  listLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  card: {
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  dateBlock: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.carbsMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { ...typography.metricSm, color: colors.carbs, lineHeight: 20 },
  dateMonth: {
    ...typography.micro,
    color: colors.carbs,
    textTransform: 'uppercase',
    marginTop: 2,
    opacity: 0.85,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardWeekday: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardSport: { ...typography.bodyBold, color: colors.text },

  statusDone: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  completeText: { ...typography.small, color: colors.primaryLight, fontWeight: '700' },

  cardActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { ...typography.small, color: colors.textSecondary, fontWeight: '600' },
  pressed: { opacity: 0.75 },

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
    backgroundColor: colors.carbsMuted,
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
