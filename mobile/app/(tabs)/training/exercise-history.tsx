import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/lib/api';
import { colors, spacing, typography, borderRadius, screenPaddingX, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../../src/theme';
import { Surface } from '../../../src/components';
import { ExerciseProgressChart } from '../../../src/components/ExerciseProgressChart';
import type { ExerciseHistoryPoint } from '../../../src/types/workout';

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDateNice(dateStr: string) {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(d, 10)} ${MONTHS_SHORT[parseInt(m, 10) - 1]}`;
}

function ordinal(n: number): string {
  return `${n + 1}º`;
}

export default function ExerciseHistoryScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;

  const { data = [], isLoading, refetch } = useQuery<ExerciseHistoryPoint[]>({
    queryKey: ['exercise-history', name],
    queryFn: () => api.get(`/api/v1/workouts/exercises/${encodeURIComponent(name)}/history`),
    enabled: Boolean(name),
  });

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const weights = data.map((p) => p.max_weight_kg ?? 0).filter((w) => w > 0);
    const reps = data.map((p) => p.best_set_reps ?? 0).filter((r) => r > 0);
    return {
      sessions: data.length,
      maxWeight: weights.length > 0 ? Math.max(...weights) : null,
      maxReps: reps.length > 0 ? Math.max(...reps) : null,
    };
  }, [data]);

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
        <Text style={styles.eyebrow}>EJERCICIO</Text>
        <Text style={styles.title}>{name}</Text>
      </View>

      {/* Stats summary */}
      {stats && (
        <Surface variant="elevated" style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.sessions}</Text>
            <Text style={styles.statLabel}>sesiones</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primaryLight }]}>
              {stats.maxWeight != null ? `${stats.maxWeight}` : '—'}
            </Text>
            <Text style={styles.statLabel}>kg máx</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.protein }]}>
              {stats.maxReps ?? '—'}
            </Text>
            <Text style={styles.statLabel}>reps máx</Text>
          </View>
        </Surface>
      )}

      <Text style={styles.chartLabel}>Evolución del peso</Text>
      <ExerciseProgressChart data={data} metric="weight" />

      <View style={styles.sectionHeader}>
        <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.sectionTitle}>Historial</Text>
        <View style={styles.sectionDivider} />
        <Text style={styles.sectionCount}>{data.length}</Text>
      </View>

      {data.length === 0 && !isLoading && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="stats-chart-outline" size={28} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyText}>Sin datos todavía</Text>
        </View>
      )}

      {[...data].reverse().map((point, i) => (
        <Surface key={i} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.cardDate}>{formatDateNice(point.date)}</Text>
              {point.day_label != null && (
                <Text style={styles.cardDayLabel}>{point.day_label}</Text>
              )}
            </View>
            {point.display_order != null && (
              <View style={styles.orderBadge}>
                <Text style={styles.orderText}>{ordinal(point.display_order)}</Text>
              </View>
            )}
          </View>

          <View style={styles.metricsRow}>
            {point.max_weight_kg != null && (
              <View style={styles.metric}>
                <Text style={styles.metricVal}>{point.max_weight_kg}</Text>
                <Text style={styles.metricUnit}>kg</Text>
                <Text style={styles.metricLabel}>peso máx</Text>
              </View>
            )}
            {point.best_set_reps != null && (
              <View style={styles.metric}>
                <Text style={styles.metricVal}>{point.best_set_reps}</Text>
                <Text style={styles.metricLabel}>reps máx</Text>
              </View>
            )}
            <View style={styles.metric}>
              <Text style={styles.metricVal}>{point.sets_count}</Text>
              <Text style={styles.metricLabel}>series</Text>
            </View>
            {point.total_volume != null && point.total_volume > 0 && (
              <View style={styles.metric}>
                <Text style={styles.metricVal}>{Math.round(point.total_volume)}</Text>
                <Text style={styles.metricLabel}>volumen</Text>
              </View>
            )}
          </View>

          {point.sets.length > 0 && (
            <View style={styles.setsTable}>
              <View style={styles.setsHeaderRow}>
                <Text style={[styles.setsHeaderText, { width: 36 }]}>Set</Text>
                <Text style={[styles.setsHeaderText, { flex: 1 }]}>Kg</Text>
                <Text style={[styles.setsHeaderText, { flex: 1 }]}>Reps</Text>
              </View>
              {point.sets.map((s) => (
                <View key={s.set_number} style={styles.setRow}>
                  <View style={styles.setNumWrap}>
                    <Text style={styles.setNum}>{s.set_number}</Text>
                  </View>
                  <Text style={styles.setVal}>{s.weight_kg ?? '—'}</Text>
                  <Text style={styles.setVal}>{s.reps ?? '—'}</Text>
                </View>
              ))}
            </View>
          )}
        </Surface>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md },

  header: { marginBottom: spacing.lg },
  eyebrow: { ...typography.label, color: colors.primaryLight, marginBottom: 4 },
  title: { ...typography.screenTitle, color: colors.text },

  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { ...typography.metricMd, color: colors.text },
  statLabel: { ...typography.micro, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 32, backgroundColor: colors.border },

  chartLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.label, color: colors.text, letterSpacing: 0.4 },
  sectionDivider: { flex: 1, height: 1, backgroundColor: colors.border, marginLeft: 4 },
  sectionCount: { ...typography.micro, color: colors.textMuted },

  empty: {
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { ...typography.bodyBold, color: colors.textSecondary },

  card: { padding: spacing.md, marginBottom: spacing.md },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardHeaderLeft: { flex: 1 },
  cardDate: { ...typography.bodyBold, color: colors.text },
  cardDayLabel: { ...typography.micro, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  orderBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
  },
  orderText: { ...typography.micro, color: colors.primaryLight, fontWeight: '700' },

  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  metric: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  metricVal: { ...typography.bodyBold, color: colors.text },
  metricUnit: { ...typography.caption, color: colors.textSecondary },
  metricLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  setsTable: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  setsHeaderRow: { flexDirection: 'row', paddingBottom: spacing.xs, gap: spacing.sm },
  setsHeaderText: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  setRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    alignItems: 'center',
    gap: spacing.sm,
  },
  setNumWrap: {
    width: 36,
    alignItems: 'center',
  },
  setNum: {
    ...typography.captionBold,
    color: colors.textSecondary,
    width: 22,
    height: 22,
    lineHeight: 22,
    textAlign: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 11,
  },
  setVal: { ...typography.caption, color: colors.text, flex: 1, textAlign: 'center' },
});
