import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/lib/api';
import { toUserFacingErrorMessage } from '../../../src/lib/userFacingError';
import { colors, spacing, typography, borderRadius, screenPaddingX, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../../src/theme';
import type {
  WorkoutRoutine,
  WorkoutSession,
  SessionCreatePayload,
  SessionUpdatePayload,
} from '../../../src/types/workout';
import { WEEKDAY_LABELS_FULL } from '../../../src/types/workout';

const SUGGESTED_SPORTS = [
  { name: 'Running', icon: 'walk-outline' as const },
  { name: 'Ciclismo', icon: 'bicycle-outline' as const },
  { name: 'Natación', icon: 'water-outline' as const },
  { name: 'Fútbol', icon: 'football-outline' as const },
];

function paramToString(v: string | string[] | undefined): string {
  if (v === undefined) return '';
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
}

export default function OtherSessionScreen() {
  const raw = useLocalSearchParams<{
    sessionId?: string | string[];
    routineId?: string | string[];
    sportType?: string | string[];
  }>();
  const sessionId = paramToString(raw.sessionId) || undefined;
  const routineId = paramToString(raw.routineId) || undefined;
  const sportTypeParam = paramToString(raw.sportType);
  const isEdit = Boolean(sessionId);
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;
  const qc = useQueryClient();

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const weekday = (today.getDay() + 6) % 7;

  const { data: routine, isLoading: routineLoading } = useQuery<WorkoutRoutine>({
    queryKey: ['workout-routine', routineId],
    queryFn: () => api.get(`/api/v1/workouts/routines/${routineId}`),
    enabled: Boolean(routineId && !isEdit && !sportTypeParam),
  });

  const [sportType, setSportType] = useState(sportTypeParam);
  const [freeText, setFreeText] = useState('');
  const [notes, setNotes] = useState('');

  const { data: existing } = useQuery<WorkoutSession>({
    queryKey: ['workout-session', sessionId],
    queryFn: () => api.get(`/api/v1/workouts/sessions/${sessionId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setSportType(existing.sport_type ?? '');
      setFreeText(existing.free_text ?? '');
      setNotes(existing.notes ?? '');
    }
  }, [existing]);

  useEffect(() => {
    if (isEdit) return;
    setSportType((prev) => {
      if (prev.trim()) return prev;
      const fromRoutine = routine?.sport_type?.trim() ?? '';
      return sportTypeParam || fromRoutine || '';
    });
  }, [isEdit, sportTypeParam, routine?.sport_type]);

  const resolvedRoutineSport =
    sportTypeParam || (routine?.sport_type?.trim() ?? '');
  const hideSportField =
    !isEdit && Boolean(routineId) && Boolean(resolvedRoutineSport || sportTypeParam);
  const sportFieldPending =
    !isEdit && Boolean(routineId) && !sportTypeParam && routineLoading;

  const createMut = useMutation({
    mutationFn: () => {
      const payload: SessionCreatePayload = {
        routine_id: routineId ?? undefined,
        category: 'other',
        date: todayStr,
        weekday,
        sport_type: sportType.trim() || undefined,
        free_text: freeText.trim() || undefined,
        completed: true,
        notes: notes.trim() || undefined,
      };
      return api.post<WorkoutSession>('/api/v1/workouts/sessions', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-sessions'] });
      qc.invalidateQueries({ queryKey: ['workout-week-summary'] });
      router.back();
    },
    onError: (e: unknown) => Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      const payload: SessionUpdatePayload = {
        sport_type: sportType.trim() || undefined,
        free_text: freeText.trim() || undefined,
        completed: true,
        notes: notes.trim() || undefined,
      };
      return api.put<WorkoutSession>(`/api/v1/workouts/sessions/${sessionId}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-sessions'] });
      qc.invalidateQueries({ queryKey: ['workout-week-summary'] });
      router.back();
    },
    onError: (e: unknown) => Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'Inténtalo de nuevo.')),
  });

  const isSaving = createMut.isPending || updateMut.isPending;
  const canSave = sportType.trim().length > 0 || freeText.trim().length > 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{isEdit ? 'EDITAR SESIÓN' : 'NUEVA SESIÓN'}</Text>
          <Text style={styles.title}>{isEdit ? 'Editar' : 'Otro deporte'}</Text>
          <View style={styles.dateChip}>
            <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.dateText}>{WEEKDAY_LABELS_FULL[weekday]} · {todayStr}</Text>
          </View>
        </View>

        {/* Sport: oculto si la rutina ya define deporte (editor / API) */}
        {sportFieldPending && (
          <Text style={[styles.label, { marginTop: spacing.lg, color: colors.textMuted }]}>
            Cargando rutina…
          </Text>
        )}
        {!hideSportField && !sportFieldPending && (
          <>
            <Text style={styles.label}>Deporte</Text>
            <TextInput
              style={styles.input}
              value={sportType}
              onChangeText={setSportType}
              placeholder="Ej: Running, Fútbol, Natación..."
              placeholderTextColor={colors.textMuted}
            />

            {!isEdit && (
              <View style={styles.suggestedRow}>
                {SUGGESTED_SPORTS.map((s) => {
                  const active = sportType.toLowerCase() === s.name.toLowerCase();
                  return (
                    <Pressable
                      key={s.name}
                      onPress={() => setSportType(s.name)}
                      style={({ pressed }) => [
                        styles.suggestedChip,
                        active && styles.suggestedChipActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={s.icon}
                        size={14}
                        color={active ? colors.primaryLight : colors.textSecondary}
                      />
                      <Text style={[styles.suggestedText, active && styles.suggestedTextActive]}>
                        {s.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* Free text */}
        <Text style={styles.label}>Entrenamiento</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={freeText}
          onChangeText={setFreeText}
          placeholder="Describe tu entrenamiento (duración, distancia, intensidad...)"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
        />

        {/* Notes */}
        <Text style={styles.label}>
          Notas <Text style={styles.labelOptional}>(opcional)</Text>
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 70 }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Sensaciones, dolencias, observaciones..."
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
        />

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            (!canSave || isSaving) && styles.saveBtnDisabled,
            pressed && canSave && !isSaving && styles.saveBtnPressed,
          ]}
          onPress={() => canSave && !isSaving && (isEdit ? updateMut.mutate() : createMut.mutate())}
          disabled={!canSave || isSaving}
        >
          <Ionicons name="checkmark" size={18} color={colors.white} />
          <Text style={styles.saveBtnText}>
            {isSaving ? 'Guardando…' : isEdit ? 'Actualizar sesión' : 'Guardar sesión'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md },

  header: { marginBottom: spacing.xl },
  eyebrow: { ...typography.label, color: colors.carbs, marginBottom: 4 },
  title: { ...typography.screenTitle, color: colors.text, marginBottom: spacing.sm },
  dateChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateText: { ...typography.caption, color: colors.textSecondary },

  label: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  labelOptional: { color: colors.textMuted, fontWeight: '400' },

  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textarea: { minHeight: 140 },

  suggestedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  suggestedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestedChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryBorder,
  },
  suggestedText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  suggestedTextActive: { color: colors.primaryLight },

  pressed: { opacity: 0.85 },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  saveBtnText: { ...typography.bodyBold, color: colors.white },
});
