import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/lib/api';
import { toUserFacingErrorMessage } from '../../../src/lib/userFacingError';
import { colors, spacing, typography, borderRadius, screenPaddingX, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../../src/theme';
import { Surface } from '../../../src/components';
import type { WorkoutRoutine, WorkoutCategory } from '../../../src/types/workout';
import { WEEKDAY_LABELS, WEEKDAY_LABELS_FULL } from '../../../src/types/workout';

interface DayState {
  weekday: number;
  label: string;
  exercises: ExState[];
}
interface ExState {
  name: string;
  default_sets: string;
  default_reps: string;
  notes: string;
}

export default function RoutineEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Editar rutina' : 'Nueva rutina' });
  }, [navigation, isEdit]);
  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<WorkoutCategory>('gym');
  const [sportType, setSportType] = useState('');
  const [days, setDays] = useState<DayState[]>([]);

  const { data: existing } = useQuery<WorkoutRoutine>({
    queryKey: ['workout-routine', id],
    queryFn: () => api.get(`/api/v1/workouts/routines/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setCategory(existing.category);
      setSportType(existing.sport_type ?? '');
      setDays(
        existing.days.map((d) => ({
          weekday: d.weekday,
          label: d.label,
          exercises: d.exercises.map((e) => ({
            name: e.name,
            default_sets: e.default_sets?.toString() ?? '',
            default_reps: e.default_reps ?? '',
            notes: e.notes ?? '',
          })),
        })),
      );
    }
  }, [existing]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        category,
        sport_type: sportType.trim() || undefined,
        days_per_week: days.length,
        days: days.map((d, i) => ({
          weekday: d.weekday,
          label: d.label.trim(),
          display_order: i,
          exercises: d.exercises.map((e, j) => ({
            name: e.name.trim(),
            display_order: j,
            default_sets: e.default_sets ? parseInt(e.default_sets, 10) : undefined,
            default_reps: e.default_reps.trim() || undefined,
            notes: e.notes.trim() || undefined,
          })),
        })),
      };
      if (isEdit) {
        return api.put(`/api/v1/workouts/routines/${id}`, payload);
      }
      return api.post('/api/v1/workouts/routines', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-routines'] });
      qc.invalidateQueries({ queryKey: ['workout-week-summary'] });
      if (isEdit) qc.invalidateQueries({ queryKey: ['workout-routine', id] });
      router.back();
    },
    onError: (e: unknown) => Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e)),
  });

  const addDay = () => {
    const used = new Set(days.map((d) => d.weekday));
    let next = 0;
    for (let i = 0; i < 7; i++) {
      if (!used.has(i)) { next = i; break; }
    }
    setDays([...days, { weekday: next, label: `Día ${days.length + 1}`, exercises: [] }]);
  };

  const removeDay = (idx: number) =>
    Alert.alert('Eliminar día', '¿Quitar este día y sus ejercicios?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => setDays(days.filter((_, i) => i !== idx)) },
    ]);

  const updateDay = (idx: number, patch: Partial<DayState>) =>
    setDays(days.map((d, i) => (i === idx ? { ...d, ...patch } : d)));

  const addExercise = (dayIdx: number) => {
    const d = { ...days[dayIdx] };
    d.exercises = [...d.exercises, { name: '', default_sets: '3', default_reps: '10', notes: '' }];
    setDays(days.map((dd, i) => (i === dayIdx ? d : dd)));
  };

  const updateExercise = (dayIdx: number, exIdx: number, patch: Partial<ExState>) => {
    const d = { ...days[dayIdx] };
    d.exercises = d.exercises.map((e, j) => (j === exIdx ? { ...e, ...patch } : e));
    setDays(days.map((dd, i) => (i === dayIdx ? d : dd)));
  };

  const removeExercise = (dayIdx: number, exIdx: number) => {
    const d = { ...days[dayIdx] };
    d.exercises = d.exercises.filter((_, j) => j !== exIdx);
    setDays(days.map((dd, i) => (i === dayIdx ? d : dd)));
  };

  const canSave = name.trim().length > 0 && days.length > 0;

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Nombre requerido', 'Escribe un nombre para tu rutina antes de guardar.');
      return;
    }
    if (days.length === 0) {
      Alert.alert('Sin días', 'Añade al menos un día de entrenamiento para poder guardar.');
      return;
    }
    saveMut.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 80 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{isEdit ? 'EDITAR RUTINA' : 'NUEVA RUTINA'}</Text>
          <Text style={styles.title}>{isEdit ? 'Editar' : 'Crear rutina'}</Text>
          <Text style={styles.subtitle}>
            Define los días, ejercicios y series por defecto
          </Text>
        </View>

        {/* Basics */}
        <Surface style={styles.section}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej: Push Pull Pierna"
            placeholderTextColor={colors.textMuted}
          />

          {!isEdit && (
            <>
              <Text style={[styles.label, { marginTop: spacing.lg }]}>Categoría</Text>
              <View style={styles.segmented}>
                {(['gym', 'other'] as WorkoutCategory[]).map((c) => {
                  const active = category === c;
                  return (
                    <Pressable
                      key={c}
                      style={[styles.segment, active && styles.segmentActive]}
                      onPress={() => setCategory(c)}
                    >
                      <Ionicons
                        name={c === 'gym' ? 'barbell-outline' : 'fitness-outline'}
                        size={16}
                        color={active ? colors.primaryLight : colors.textSecondary}
                      />
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                        {c === 'gym' ? 'Gimnasio' : 'Otro deporte'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {category === 'other' && (
            <>
              <Text style={[styles.label, { marginTop: spacing.lg }]}>Deporte</Text>
              <TextInput
                style={styles.input}
                value={sportType}
                onChangeText={setSportType}
                placeholder="Ej: Fútbol, Running, Natación"
                placeholderTextColor={colors.textMuted}
              />
            </>
          )}
        </Surface>

        {/* Days */}
        <View style={styles.daysHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Días de entrenamiento</Text>
            <Text style={styles.sectionHint}>
              {days.length === 0
                ? 'Añade al menos un día'
                : `${days.length} ${days.length === 1 ? 'día' : 'días'} configurados`}
            </Text>
          </View>
          <Pressable
            onPress={addDay}
            style={({ pressed }) => [styles.addDayBtn, pressed && styles.pressed]}
            disabled={days.length >= 7}
          >
            <Ionicons name="add" size={16} color={colors.primaryLight} />
            <Text style={styles.addDayText}>Día</Text>
          </Pressable>
        </View>

        {days.length === 0 && (
          <Pressable
            onPress={addDay}
            style={({ pressed }) => [styles.emptyDayBtn, pressed && styles.pressed]}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primaryLight} />
            <Text style={styles.emptyDayText}>Añadir primer día</Text>
          </Pressable>
        )}

        {days.map((day, di) => (
          <Surface key={di} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>{di + 1}</Text>
              </View>
              <TextInput
                style={styles.dayLabelInput}
                value={day.label}
                onChangeText={(t) => updateDay(di, { label: t })}
                placeholder="Nombre del día"
                placeholderTextColor={colors.textMuted}
              />
              <Pressable
                onPress={() => removeDay(di)}
                hitSlop={8}
                style={({ pressed }) => [styles.dayRemove, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={16} color={colors.error} />
              </Pressable>
            </View>

            {/* Weekday picker */}
            <Text style={styles.weekdayLabel}>Día de la semana</Text>
            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((wl, wi) => {
                const active = day.weekday === wi;
                return (
                  <Pressable
                    key={wi}
                    style={[styles.wdChip, active && styles.wdChipActive]}
                    onPress={() => updateDay(di, { weekday: wi })}
                  >
                    <Text style={[styles.wdChipText, active && styles.wdChipTextActive]}>
                      {wl}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Exercises (only gym) */}
            {category === 'gym' && (
              <>
                {day.exercises.length > 0 && (
                  <>
                    <View style={styles.exTableHeader}>
                      <Text style={[styles.exTableHeaderText, { flex: 1 }]}>EJERCICIO</Text>
                      <Text style={[styles.exTableHeaderText, { width: 50, textAlign: 'center' }]}>SETS</Text>
                      <Text style={[styles.exTableHeaderText, { width: 50, textAlign: 'center' }]}>REPS</Text>
                      <View style={{ width: 24 }} />
                    </View>
                    {day.exercises.map((ex, ei) => (
                      <View key={ei} style={styles.exRow}>
                        <TextInput
                          style={styles.exNameInput}
                          value={ex.name}
                          onChangeText={(t) => updateExercise(di, ei, { name: t })}
                          placeholder="Nombre"
                          placeholderTextColor={colors.textMuted}
                        />
                        <TextInput
                          style={styles.exSmallInput}
                          value={ex.default_sets}
                          onChangeText={(t) => updateExercise(di, ei, { default_sets: t })}
                          placeholder="3"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="number-pad"
                        />
                        <TextInput
                          style={styles.exSmallInput}
                          value={ex.default_reps}
                          onChangeText={(t) => updateExercise(di, ei, { default_reps: t })}
                          placeholder="10"
                          placeholderTextColor={colors.textMuted}
                        />
                        <Pressable
                          onPress={() => removeExercise(di, ei)}
                          hitSlop={6}
                          style={({ pressed }) => [styles.exRemove, pressed && styles.pressed]}
                        >
                          <Ionicons name="close" size={14} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    ))}
                  </>
                )}

                <Pressable
                  onPress={() => addExercise(di)}
                  style={({ pressed }) => [styles.addExBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="add" size={14} color={colors.primaryLight} />
                  <Text style={styles.addExText}>Añadir ejercicio</Text>
                </Pressable>
              </>
            )}
          </Surface>
        ))}
      </ScrollView>

      {/* Sticky save */}
      <View
        style={[
          styles.saveBar,
          { paddingBottom: Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + spacing.md },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            (!canSave || saveMut.isPending) && styles.saveBtnDisabled,
            pressed && canSave && !saveMut.isPending && styles.saveBtnPressed,
          ]}
          onPress={handleSave}
          disabled={saveMut.isPending}
        >
          <Ionicons name="checkmark" size={18} color={colors.white} />
          <Text style={styles.saveBtnText}>
            {saveMut.isPending
              ? 'Guardando…'
              : !canSave
                ? 'Añade nombre y días'
                : isEdit
                  ? 'Guardar cambios'
                  : 'Crear rutina'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md },

  header: { marginBottom: spacing.lg },
  eyebrow: { ...typography.label, color: colors.primaryLight, marginBottom: 4 },
  title: { ...typography.screenTitle, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },

  section: { padding: spacing.lg, marginBottom: spacing.xl },
  label: { ...typography.label, color: colors.text, marginBottom: spacing.sm },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
  },
  segmentActive: { backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: colors.primaryBorder },
  segmentText: { ...typography.captionBold, color: colors.textSecondary },
  segmentTextActive: { color: colors.primaryLight },

  daysHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionLabel: { ...typography.sectionTitle, color: colors.text },
  sectionHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  addDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  addDayText: { ...typography.captionBold, color: colors.primaryLight },

  emptyDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryGlowSoft,
  },
  emptyDayText: { ...typography.bodyBold, color: colors.primaryLight },

  dayCard: { padding: spacing.md, marginBottom: spacing.md },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dayBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeText: { ...typography.captionBold, color: colors.primaryLight },
  dayLabelInput: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
    paddingVertical: spacing.xs,
  },
  dayRemove: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  weekdayLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: spacing.md,
  },
  wdChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  wdChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryBorder,
  },
  wdChipText: { ...typography.micro, color: colors.textMuted, fontWeight: '700' },
  wdChipTextActive: { color: colors.primaryLight },

  exTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: spacing.xs,
  },
  exTableHeaderText: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  exNameInput: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
    paddingVertical: 4,
  },
  exSmallInput: {
    ...typography.captionBold,
    color: colors.text,
    width: 50,
    textAlign: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
  },
  exRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryGlowSoft,
  },
  addExText: { ...typography.small, color: colors.primaryLight, fontWeight: '700' },

  pressed: { opacity: 0.85 },

  saveBar: {
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.sm,
    backgroundColor: colors.glassBackdropStrong,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  saveBtnText: { ...typography.bodyBold, color: colors.white },
});
