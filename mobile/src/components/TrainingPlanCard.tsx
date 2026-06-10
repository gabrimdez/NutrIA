import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '../theme';
import { TrainingPlan } from '../types';
import { downloadTrainingPlanPdf } from '../lib/planExport';
import { api } from '../lib/api';
import type { RoutineCreatePayload } from '../types/workout';

interface Props {
  plan: TrainingPlan;
}

export function TrainingPlanCard({ plan }: Props) {
  const isRehab = plan.kind === 'rehab';
  const [detailsOpen, setDetailsOpen] = useState(false);
  const busy = useRef(false);
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const totalExercises = useMemo(
    () => plan.days.reduce((total, day) => total + day.exercises.length, 0),
    [plan.days],
  );

  const previewDays = useMemo(() => plan.days.slice(0, 2), [plan.days]);

  const doDownloadPdf = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await downloadTrainingPlanPdf(plan);
    } finally {
      busy.current = false;
    }
  }, [plan]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: RoutineCreatePayload = {
        name: (plan.name?.trim() || (isRehab ? 'Bloque de readaptación' : 'Rutina sugerida')).slice(0, 200),
        category: isRehab ? 'other' : 'gym',
        sport_type: isRehab ? 'Readaptación' : (plan.split?.trim() || undefined)?.slice(0, 100),
        days_per_week: Math.min(plan.days.length, 7),
        days: plan.days.map((day, index) => ({
          weekday: index % 7,
          label: (day.name?.trim() || `Día ${index + 1}`).slice(0, 100),
          display_order: index,
          exercises: day.exercises
            .filter((ex) => ex.name?.trim())
            .map((ex, j) => {
              const sets = Number.isFinite(ex.sets) ? Math.round(ex.sets) : 0;
              const reps = (ex.reps ?? '').toString().trim();
              return {
                name: ex.name.trim().slice(0, 200),
                display_order: j,
                default_sets: sets >= 1 && sets <= 30 ? sets : undefined,
                default_reps: reps ? reps.slice(0, 50) : undefined,
              };
            }),
        })),
      };
      return api.post('/api/v1/workouts/routines', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-routines'] });
      qc.invalidateQueries({ queryKey: ['workout-week-summary'] });
      Alert.alert(
        'Rutina guardada',
        'La rutina sugerida se ha añadido a tus rutinas.',
        [
          { text: 'Seguir aquí', style: 'cancel' },
          {
            text: 'Ver mis rutinas',
            onPress: () => {
              setDetailsOpen(false);
              router.push('/training/routines');
            },
          },
        ],
      );
    },
    onError: (err: Error) => {
      Alert.alert('No se pudo guardar', err.message || 'Inténtalo de nuevo en unos segundos.');
    },
  });

  const isSaving = saveMut.isPending;

  return (
    <>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons
              name={isRehab ? 'medkit-outline' : 'barbell-outline'}
              size={18}
              color={colors.primaryLight}
            />
          </View>

          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{isRehab ? 'Readaptación sugerida' : 'Rutina sugerida'}</Text>
            <Text style={styles.headerTitle}>{plan.name}</Text>
            {/* Ocultamos `split` (p.ej. "upper_lower") porque es una key interna del backend. */}
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="calendar-outline" size={14} color={colors.primaryLight} />
            <Text style={styles.metaChipText}>
              {plan.days.length} {plan.days.length === 1 ? 'dia' : 'dias'}
            </Text>
          </View>

          <View style={styles.metaChip}>
            <Ionicons name="fitness-outline" size={14} color={colors.primaryLight} />
            <Text style={styles.metaChipText}>
              {totalExercises} {totalExercises === 1 ? 'ejercicio' : 'ejercicios'}
            </Text>
          </View>
        </View>

        {plan.focus_note?.trim() ? (
          <View style={styles.focusBox}>
            <Text style={styles.focusLabel}>Foco</Text>
            <Text style={styles.focusText} numberOfLines={2}>
              {plan.focus_note.trim()}
            </Text>
          </View>
        ) : null}

        <View style={styles.previewList}>
          {previewDays.map((day, index) => {
            const preview = day.exercises
              .slice(0, 2)
              .map((exercise) => exercise.name)
              .join(', ');

            return (
              <View key={`${day.name}-${index}`} style={styles.previewRow}>
                <Text style={styles.previewDay}>{day.name}</Text>
                <Text style={styles.previewBody} numberOfLines={1}>
                  {preview || 'Sin ejercicios'}
                </Text>
              </View>
            );
          })}

          {plan.days.length > previewDays.length ? (
            <Text style={styles.moreText}>+ {plan.days.length - previewDays.length} dias mas</Text>
          ) : null}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => setDetailsOpen(true)} activeOpacity={0.88}>
            <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.ghostBtnText}>Ver rutina</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.ghostBtn} onPress={() => void doDownloadPdf()} activeOpacity={0.88}>
            <Ionicons name="download-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.ghostBtnText}>PDF</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.saveRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.tallPrimaryBtn, styles.fullWidthBtn, isSaving && styles.btnDisabled]}
            onPress={() => saveMut.mutate()}
            disabled={isSaving}
            activeOpacity={0.88}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="bookmark-outline" size={16} color={colors.white} />
            )}
            <Text style={styles.primaryBtnText}>
              {isSaving ? 'Guardando…' : 'Añadir a mis rutinas'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={detailsOpen} animationType="slide" onRequestClose={() => setDetailsOpen(false)}>
        <View style={styles.detailRoot}>

          <View style={[styles.detailHeader, { paddingTop: insets.top + spacing.md }]}>
            <View style={styles.detailHeaderCopy}>
              <Text style={styles.detailEyebrow}>{isRehab ? 'Bloque completo' : 'Rutina completa'}</Text>
              <Text style={styles.detailTitle}>{plan.name}</Text>
              {/* Ocultamos `split` (p.ej. "upper_lower") porque es una key interna del backend. */}
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailsOpen(false)} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.detailScroll}
            contentContainerStyle={styles.detailScrollContent}
            showsVerticalScrollIndicator
          >
            {plan.focus_note?.trim() ? (
              <View style={styles.detailInfoCard}>
                <Text style={styles.detailInfoLabel}>Foco</Text>
                <Text style={styles.detailInfoText}>{plan.focus_note.trim()}</Text>
              </View>
            ) : null}

            {plan.disclaimer?.trim() ? (
              <View style={styles.detailInfoCard}>
                <Text style={styles.detailInfoLabel}>Nota</Text>
                <Text style={styles.detailInfoText}>{plan.disclaimer.trim()}</Text>
              </View>
            ) : null}

            {plan.days.map((day, dayIndex) => (
              <View key={`${day.name}-${dayIndex}`} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayTitle}>{day.name}</Text>
                </View>

                <View style={styles.tableHeader}>
                  <Text style={[styles.colExercise, styles.thText]}>Ejercicio</Text>
                  <Text style={[styles.colSets, styles.thText, styles.cellCenter]}>Series</Text>
                  <Text style={[styles.colReps, styles.thText, styles.cellCenter]}>Reps</Text>
                </View>

                {day.exercises.map((exercise, index) => (
                  <View key={`${day.name}-${exercise.name}-${index}`} style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}>
                    <Text style={[styles.colExercise, styles.cellText]} numberOfLines={2}>
                      {exercise.name}
                    </Text>
                    <Text style={[styles.colSets, styles.cellText, styles.cellCenter]}>
                      {exercise.sets > 0 ? exercise.sets : '-'}
                    </Text>
                    <Text style={[styles.colReps, styles.cellText, styles.cellCenter]}>
                      {exercise.reps || '-'}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={[styles.detailFooter, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <TouchableOpacity style={styles.detailGhostBtn} onPress={() => void doDownloadPdf()} activeOpacity={0.88}>
              <Ionicons name="download-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.detailGhostBtnText}>PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.detailPrimaryBtn, styles.tallPrimaryBtn, isSaving && styles.btnDisabled]}
              onPress={() => saveMut.mutate()}
              disabled={isSaving}
              activeOpacity={0.88}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="bookmark-outline" size={16} color={colors.white} />
              )}
              <Text style={styles.detailPrimaryBtnText}>
                {isSaving ? 'Guardando…' : 'Añadir a mis rutinas'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  headerTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: 2,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm - 1,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaChipText: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  focusBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  focusLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  focusText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  previewList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  previewRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewDay: {
    ...typography.captionBold,
    color: colors.text,
    marginBottom: 2,
  },
  previewBody: {
    ...typography.small,
    color: colors.textMuted,
  },
  moreText: {
    ...typography.small,
    color: colors.textMuted,
    paddingHorizontal: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  saveRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  fullWidthBtn: {
    flex: 0,
    width: '100%',
  },
  tallPrimaryBtn: {
    minHeight: 52,
    paddingVertical: spacing.lg,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  ghostBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostBtnText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  primaryBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  primaryBtnText: {
    ...typography.captionBold,
    color: colors.white,
  },
  detailRoot: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailEyebrow: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  detailTitle: {
    ...typography.h2,
    color: colors.text,
  },
  detailSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailScroll: {
    flex: 1,
  },
  detailScrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  detailInfoCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailInfoLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  detailInfoText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  dayCard: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayTitle: {
    ...typography.captionBold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 11,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
  },
  tableRowEven: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  colExercise: { flex: 1 },
  colSets: { width: 48 },
  colReps: { width: 56 },
  cellText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cellCenter: { textAlign: 'center' },
  detailFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailGhostBtn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailGhostBtnText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  detailPrimaryBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  detailPrimaryBtnText: {
    ...typography.captionBold,
    color: colors.white,
  },
});
