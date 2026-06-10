import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/lib/api';
import { colors, spacing, typography, borderRadius, screenPaddingX, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../../src/theme';
import { Surface } from '../../../src/components';
import type { WorkoutSessionListItem } from '../../../src/types/workout';
import { WEEKDAY_LABELS_FULL } from '../../../src/types/workout';

function getWeekRange(offset: number) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: monday.toISOString().split('T')[0],
    to: sunday.toISOString().split('T')[0],
    monday,
    sunday,
  };
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatRange(from: Date, to: Date) {
  const sameMonth = from.getMonth() === to.getMonth();
  if (sameMonth) {
    return `${from.getDate()} – ${to.getDate()} ${MONTHS_SHORT[to.getMonth()]}`;
  }
  return `${from.getDate()} ${MONTHS_SHORT[from.getMonth()]} – ${to.getDate()} ${MONTHS_SHORT[to.getMonth()]}`;
}

export default function SessionHistoryScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;
  const [weekOffset, setWeekOffset] = useState(0);
  const { from, to, monday, sunday } = useMemo(() => getWeekRange(weekOffset), [weekOffset]);

  const { data: sessions = [], isLoading, refetch } = useQuery<WorkoutSessionListItem[]>({
    queryKey: ['workout-sessions', from, to],
    queryFn: () => api.get(`/api/v1/workouts/sessions?from=${from}&to=${to}`),
  });

  const completed = sessions.filter((s) => s.completed).length;
  const isCurrentWeek = weekOffset === 0;

  const weekTitle = isCurrentWeek
    ? 'Esta semana'
    : weekOffset === -1
      ? 'Semana pasada'
      : `Hace ${Math.abs(weekOffset)} semanas`;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primaryLight} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>HISTORIAL</Text>
        <Text style={styles.title}>Sesiones</Text>
      </View>

      {/* Week navigator */}
      <Surface variant="elevated" style={styles.weekNavCard}>
        <Pressable
          onPress={() => setWeekOffset(weekOffset - 1)}
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
          hitSlop={6}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>

        <View style={styles.weekNavCenter}>
          <Text style={styles.weekTitle}>{weekTitle}</Text>
          <Text style={styles.weekRange}>{formatRange(monday, sunday)}</Text>
        </View>

        <Pressable
          onPress={() => weekOffset < 0 && setWeekOffset(weekOffset + 1)}
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed, weekOffset >= 0 && styles.navBtnDisabled]}
          hitSlop={6}
          disabled={weekOffset >= 0}
        >
          <Ionicons name="chevron-forward" size={20} color={weekOffset >= 0 ? colors.textMuted : colors.text} />
        </Pressable>
      </Surface>

      {!isCurrentWeek && (
        <Pressable
          onPress={() => setWeekOffset(0)}
          style={({ pressed }) => [styles.todayChip, pressed && styles.pressed]}
        >
          <Ionicons name="today-outline" size={14} color={colors.primaryLight} />
          <Text style={styles.todayChipText}>Volver a esta semana</Text>
        </Pressable>
      )}

      {/* Summary */}
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

      {sessions.length === 0 && !isLoading && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyText}>Sin sesiones</Text>
          <Text style={styles.emptyHint}>No hay entrenamientos registrados esta semana</Text>
        </View>
      )}

      {sessions.length > 0 && <Text style={styles.listLabel}>Detalle</Text>}

      {sessions.map((s) => {
        const dayNum = parseInt(s.date.split('-')[2], 10);
        const monthShort = MONTHS_SHORT[parseInt(s.date.split('-')[1], 10) - 1];
        const isGym = s.category === 'gym';

        return (
          <Pressable
            key={s.id}
            onPress={() =>
              router.push({
                pathname: isGym ? '/training/gym-session' : '/training/other-session',
                params: { sessionId: s.id },
              })
            }
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Surface style={styles.sessionCard}>
              <View style={styles.dateBlock}>
                <Text style={styles.dateDay}>{dayNum}</Text>
                <Text style={styles.dateMonth}>{monthShort}</Text>
              </View>

              <View style={styles.sessionInfo}>
                <View style={styles.sessionHeader}>
                  <Ionicons
                    name={isGym ? 'barbell-outline' : 'fitness-outline'}
                    size={14}
                    color={isGym ? colors.primaryLight : colors.carbs}
                  />
                  <Text style={styles.sessionWeekday}>{WEEKDAY_LABELS_FULL[s.weekday]}</Text>
                </View>
                <Text style={styles.sessionTitle} numberOfLines={1}>
                  {s.day_label || s.sport_type || (isGym ? 'Sesión de gym' : 'Otro deporte')}
                </Text>
                {!isGym && s.sport_type && s.day_label && (
                  <Text style={styles.sessionSport} numberOfLines={1}>{s.sport_type}</Text>
                )}
              </View>

              <View style={styles.statusChip}>
                {s.completed ? (
                  <>
                    <View style={styles.statusDone}>
                      <Ionicons name="checkmark" size={12} color={colors.white} />
                    </View>
                    <Text style={styles.statusTextDone}>Hecha</Text>
                  </>
                ) : (
                  <>
                    <View style={styles.statusPending}>
                      <Ionicons name="time-outline" size={12} color={colors.warning} />
                    </View>
                    <Text style={styles.statusTextPending}>Pendiente</Text>
                  </>
                )}
              </View>
            </Surface>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md },

  header: { marginBottom: spacing.lg },
  eyebrow: { ...typography.label, color: colors.primaryLight, marginBottom: 4 },
  title: { ...typography.screenTitle, color: colors.text },

  weekNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.4 },
  weekNavCenter: { flex: 1, alignItems: 'center', gap: 2 },
  weekTitle: { ...typography.bodyBold, color: colors.text },
  weekRange: { ...typography.caption, color: colors.textSecondary },

  todayChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.md,
  },
  todayChipText: { ...typography.captionBold, color: colors.primaryLight },

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

  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  dateBlock: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { ...typography.metricSm, color: colors.text, lineHeight: 20 },
  dateMonth: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  sessionInfo: { flex: 1, gap: 3 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sessionWeekday: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sessionTitle: { ...typography.bodyBold, color: colors.text },
  sessionSport: { ...typography.caption, color: colors.textSecondary },

  statusChip: {
    width: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statusDone: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextDone: { ...typography.micro, color: colors.primaryLight, fontWeight: '700' },
  statusPending: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextPending: { ...typography.micro, color: colors.warning, fontWeight: '700' },

  empty: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyText: { ...typography.h3, color: colors.text },
  emptyHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

  pressed: { opacity: 0.85 },
});
