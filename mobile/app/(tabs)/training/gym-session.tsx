import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert,
  KeyboardAvoidingView, Platform, Modal, Vibration, Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, api } from '../../../src/lib/api';
import { toUserFacingErrorMessage } from '../../../src/lib/userFacingError';
import { colors, spacing, typography, borderRadius, screenPaddingX, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../../src/theme';
import { Surface } from '../../../src/components';
import type {
  WorkoutRoutine, WorkoutSession, RoutineDay, SessionCreatePayload,
  SessionUpdatePayload, SessionExerciseInput, PreviousSessionTemplate,
} from '../../../src/types/workout';
import { WEEKDAY_LABELS_FULL } from '../../../src/types/workout';
import { WORKOUT_INVALIDATION_KEYS } from '../../../src/lib/workoutApi';

interface ExLocal {
  name: string;
  notes: string;
  default_reps?: string | null;
  sets: SetLocal[];
}
interface SetLocal {
  reps: string;
  weight_kg: string;
  notes: string;
  /**
   * Set completado en UI. En BD se infiere de reps/peso; si el usuario marca
   * vacío, autocompletamos reps desde default_reps del ejercicio.
   */
  completed: boolean;
}

/** Extrae el primer número de "10", "8-12", "12 reps"… para usar como reps por defecto. */
function parseDefaultReps(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : undefined;
}

function loadDayExercises(day: RoutineDay): ExLocal[] {
  return day.exercises.map((e) => ({
    name: e.name,
    notes: e.notes ?? '',
    default_reps: e.default_reps ?? null,
    sets: Array.from({ length: e.default_sets ?? 3 }, () => ({
      reps: '',
      weight_kg: '',
      notes: '',
      completed: false,
    })),
  }));
}

const EXERCISE_ACCENTS = [
  colors.primaryLight,
  colors.protein,
  colors.carbs,
  colors.warning,
  '#F472B6',
] as const;

interface ExerciseCardProps {
  ex: ExLocal;
  index: number;
  onUpdateEx: (idx: number, patch: Partial<ExLocal>) => void;
  onUpdateSet: (exIdx: number, setIdx: number, patch: Partial<SetLocal>) => void;
  onAddSet: (exIdx: number) => void;
  onRemoveSet: (exIdx: number, setIdx: number) => void;
  onRemove: (idx: number) => void;
  onToggleDone: (exIdx: number, setIdx: number) => void;
}

const ExerciseCard = memo(function ExerciseCard({
  ex, index, onUpdateEx, onUpdateSet, onAddSet, onRemoveSet, onRemove, onToggleDone,
}: ExerciseCardProps) {
  const accentColor = EXERCISE_ACCENTS[index % EXERCISE_ACCENTS.length];
  const doneSets = ex.sets.filter((s) => s.completed).length;
  const totalSets = ex.sets.length;
  const scaleAnims = useRef(ex.sets.map(() => new Animated.Value(1))).current;

  // Grow scale anims array if sets are added
  while (scaleAnims.length < ex.sets.length) {
    scaleAnims.push(new Animated.Value(1));
  }

  const handleToggle = useCallback((si: number) => {
    if (!ex.sets[si].completed) {
      Animated.sequence([
        Animated.timing(scaleAnims[si], { toValue: 1.4, duration: 80, useNativeDriver: true }),
        Animated.spring(scaleAnims[si], { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
      ]).start();
    }
    onToggleDone(index, si);
  }, [ex.sets, scaleAnims, onToggleDone, index]);

  return (
    <Surface style={styles.exCard}>
      <View style={styles.exHeader}>
        <View style={[styles.exNumberBadge, { backgroundColor: `${accentColor}22` }]}>
          <Text style={[styles.exNumberText, { color: accentColor }]}>{index + 1}</Text>
        </View>
        <TextInput
          style={styles.exNameInput}
          value={ex.name}
          onChangeText={(t) => onUpdateEx(index, { name: t })}
          placeholder="Nombre del ejercicio"
          placeholderTextColor={colors.textMuted}
        />
        {doneSets > 0 && (
          <View style={styles.exDoneChip}>
            <Ionicons name="checkmark" size={10} color={colors.success} />
            <Text style={styles.exDoneChipText}>{doneSets}/{totalSets}</Text>
          </View>
        )}
        <Pressable
          onPress={() =>
            ex.name.trim() &&
            router.push({
              pathname: '/training/exercise-history',
              params: { name: ex.name.trim() },
            })
          }
          hitSlop={8}
          style={({ pressed }) => [styles.exHeaderBtn, pressed && styles.pressed]}
        >
          <Ionicons name="stats-chart-outline" size={16} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={() => onRemove(index)}
          hitSlop={8}
          style={({ pressed }) => [styles.exHeaderBtn, pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={16} color={colors.error} />
        </Pressable>
      </View>

      <View style={styles.setHeader}>
        <Text style={[styles.setHeaderText, { width: 32 }]}>SET</Text>
        <Text style={[styles.setHeaderText, { flex: 1 }]}>KG</Text>
        <Text style={[styles.setHeaderText, { flex: 1 }]}>REPS</Text>
        <View style={{ width: 24 }} />
      </View>

      {ex.sets.map((s, si) => (
        <View key={si} style={[styles.setRow, s.completed && styles.setRowDone]}>
          <Pressable onPress={() => handleToggle(si)} hitSlop={4} style={styles.setNumWrap}>
            <Animated.View
              style={[
                styles.setNumBadge,
                s.completed && styles.setNumBadgeDone,
                { transform: [{ scale: scaleAnims[si] ?? new Animated.Value(1) }] },
              ]}
            >
              {s.completed
                ? <Ionicons name="checkmark" size={13} color={colors.white} />
                : <Text style={styles.setNumText}>{si + 1}</Text>
              }
            </Animated.View>
          </Pressable>
          <TextInput
            style={[styles.setInput, s.completed && styles.setInputDone]}
            value={s.weight_kg}
            onChangeText={(t) => onUpdateSet(index, si, { weight_kg: t })}
            placeholder="—"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.setInput, s.completed && styles.setInputDone]}
            value={s.reps}
            onChangeText={(t) => onUpdateSet(index, si, { reps: t })}
            placeholder="—"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
          />
          <Pressable
            onPress={() => onRemoveSet(index, si)}
            hitSlop={6}
            style={({ pressed }) => [styles.removeSetBtn, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={14} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}

      <Pressable
        onPress={() => onAddSet(index)}
        style={({ pressed }) => [styles.addSetBtn, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={14} color={colors.primaryLight} />
        <Text style={styles.addSetText}>Añadir serie</Text>
      </Pressable>
    </Surface>
  );
});

export default function GymSessionScreen() {
  const { routineId, sessionId, routineDayId } = useLocalSearchParams<{
    routineId?: string; sessionId?: string; routineDayId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 16;
  const qc = useQueryClient();
  const isEdit = Boolean(sessionId);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const weekday = (today.getDay() + 6) % 7;

  const [selectedDay, setSelectedDay] = useState<RoutineDay | null>(null);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [dayLabel, setDayLabel] = useState('');
  const [exercises, setExercises] = useState<ExLocal[]>([]);
  const [notes, setNotes] = useState('');
  const [dateStr] = useState(todayStr);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [restDuration, setRestDuration] = useState(90);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: routine } = useQuery<WorkoutRoutine>({
    queryKey: ['workout-routine', routineId],
    queryFn: () => api.get(`/api/v1/workouts/routines/${routineId}`),
    enabled: Boolean(routineId),
  });

  const { data: existingSession } = useQuery<WorkoutSession>({
    queryKey: ['workout-session', sessionId],
    queryFn: () => api.get(`/api/v1/workouts/sessions/${sessionId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingSession) {
      setDayLabel(existingSession.day_label ?? '');
      setNotes(existingSession.notes ?? '');
      // `done` se reconstruye al cargar: un set ya tiene reps o peso → hecho.
      setExercises(
        existingSession.exercises.map((e) => ({
          name: e.name,
          notes: e.notes ?? '',
          default_reps: null,
          sets: e.sets.map((s) => ({
            reps: s.reps?.toString() ?? '',
            weight_kg: s.weight_kg?.toString() ?? '',
            notes: s.notes ?? '',
            completed: s.reps != null || s.weight_kg != null,
          })),
        })),
      );
      return;
    }
    if (!routine || selectedDay) return;
    if (routineDayId) {
      const preselected = routine.days.find((d) => d.id === routineDayId);
      if (preselected) {
        setSelectedDay(preselected);
        setDayLabel(preselected.label);
        setExercises(loadDayExercises(preselected));
        return;
      }
    }
    const todayDay = routine.days.find((d) => d.weekday === weekday);
    if (todayDay) {
      setSelectedDay(todayDay);
      setDayLabel(todayDay.label);
      setExercises(loadDayExercises(todayDay));
    } else if (routine.days.length > 0) {
      setShowDayPicker(true);
    }
  }, [routine, existingSession, routineDayId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const pickDay = (day: RoutineDay) => {
    setSelectedDay(day);
    setDayLabel(day.label);
    setExercises(loadDayExercises(day));
    setShowDayPicker(false);
  };

  /**
   * Construye los ejercicios listos para enviar al backend filtrando los que
   * todavía no tienen nombre. Esto evita un 422 espurio durante el autosave
   * cuando el usuario acaba de pulsar "+ Añadir ejercicio" pero aún no ha
   * tecleado el nombre (`SessionExerciseIn.name` exige `min_length=1`).
   */
  const buildExercises = (): SessionExerciseInput[] =>
    exercises
      .map((ex, i) => ({
        name: ex.name.trim(),
        display_order: i,
        notes: ex.notes.trim() || undefined,
        sets: ex.sets.map((s, j) => ({
          set_number: j + 1,
          reps: s.reps ? parseInt(s.reps, 10) : undefined,
          weight_kg: s.weight_kg ? parseFloat(s.weight_kg) : undefined,
          notes: s.notes.trim() || undefined,
        })),
      }))
      .filter((ex) => ex.name.length > 0);

  /**
   * Mensaje al usuario cuando el backend devuelve 422 al crear/actualizar la
   * sesión. Suele ocurrir cuando se intenta guardar sin ningún ejercicio con
   * nombre. Aprovechamos para sugerir el atajo de copiar la sesión anterior.
   */
  const showUnprocessableSessionAlert = (e: Error) => {
    if (e instanceof ApiError && e.status === 422) {
      Alert.alert(
        'No se pudo guardar la sesión',
        'No existe un entrenamiento anterior para copiarlo rápidamente. Añade al menos un ejercicio con nombre o pulsa "Copiar entrenamiento anterior".',
      );
      return true;
    }
    return false;
  };

  /**
   * Sesión de borrador en memoria. Empezamos con `sessionId` si venimos a editar
   * o sin id si venimos de una rutina; en ese segundo caso se crea borrador la
   * primera vez que el usuario hace un cambio (autosave).
   */
  const draftIdRef = useRef<string | undefined>(sessionId);
  const userEditedRef = useRef(false);
  const creatingDraftRef = useRef(false);
  const wasAllDoneRef = useRef(false);
  const [completionToast, setCompletionToast] = useState(false);

  const markUserEdited = useCallback(() => {
    userEditedRef.current = true;
  }, []);

  const persistMut = useMutation({
    mutationFn: async () => {
      const body: SessionUpdatePayload = {
        day_label: dayLabel.trim() || undefined,
        notes: notes.trim() || undefined,
        exercises: buildExercises(),
      };
      const id = draftIdRef.current;
      if (id) {
        return api.put<WorkoutSession>(`/api/v1/workouts/sessions/${id}`, body);
      }
      // Aún no hay borrador: solo lo creamos cuando ya tenemos al menos un
      // ejercicio con nombre. Así evitamos un POST con `exercises=[]` que
      // dispararía 422 y, sobre todo, ensucia la tabla con borradores vacíos.
      if (body.exercises === undefined || body.exercises.length === 0) {
        return undefined;
      }
      if (creatingDraftRef.current) return undefined;
      creatingDraftRef.current = true;
      try {
        const payload: SessionCreatePayload = {
          routine_id: routineId ?? undefined,
          routine_day_id: selectedDay?.id ?? undefined,
          category: 'gym',
          date: dateStr,
          weekday,
          day_label: body.day_label,
          completed: false,
          notes: body.notes,
          exercises: body.exercises,
        };
        const created = await api.post<WorkoutSession>('/api/v1/workouts/sessions', payload);
        draftIdRef.current = created.id;
        return created;
      } finally {
        creatingDraftRef.current = false;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-sessions'] });
      qc.invalidateQueries({ queryKey: ['workout-week-summary'] });
    },
    onError: (e: Error) => {
      // El autosave se ejecuta con cada edit, así que solo gritamos para 422.
      // Otros fallos (red, 5xx) se reintentan con el siguiente cambio o al pulsar Completar.
      showUnprocessableSessionAlert(e);
    },
  });

  const completeMut = useMutation({
    mutationFn: async () => {
      // Si hay borrador o sesión existente, hacer PUT con completed=true.
      const id = draftIdRef.current;
      if (id) {
        const payload: SessionUpdatePayload = {
          day_label: dayLabel.trim() || undefined,
          completed: true,
          notes: notes.trim() || undefined,
          exercises: buildExercises(),
        };
        return api.put<WorkoutSession>(`/api/v1/workouts/sessions/${id}`, payload);
      }
      // Si no hay borrador, crear directamente como completada.
      const payload: SessionCreatePayload = {
        routine_id: routineId ?? undefined,
        routine_day_id: selectedDay?.id ?? undefined,
        category: 'gym',
        date: dateStr,
        weekday,
        day_label: dayLabel.trim() || undefined,
        completed: true,
        notes: notes.trim() || undefined,
        exercises: buildExercises(),
      };
      const created = await api.post<WorkoutSession>('/api/v1/workouts/sessions', payload);
      draftIdRef.current = created.id;
      return created;
    },
    onSuccess: () => {
      for (const key of WORKOUT_INVALIDATION_KEYS) {
        qc.invalidateQueries({ queryKey: [...key] });
      }
      router.back();
    },
    onError: (e: Error) => {
      if (showUnprocessableSessionAlert(e)) return;
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e));
    },
  });

  // Autosave debounced: cuando el usuario edita algo, persiste tras 700 ms.
  // No se dispara con la carga inicial (rutina/sesión) porque `userEditedRef`
  // empieza en false hasta que toque algo a mano.
  const persistMutateRef = useRef(persistMut.mutate);
  persistMutateRef.current = persistMut.mutate;
  useEffect(() => {
    if (!userEditedRef.current) return;
    const timer = setTimeout(() => {
      persistMutateRef.current();
    }, 700);
    return () => clearTimeout(timer);
  }, [exercises, dayLabel, notes]);

  const copyMut = useMutation({
    mutationFn: () =>
      api.get<PreviousSessionTemplate>(
        `/api/v1/workouts/sessions/previous-template?date=${encodeURIComponent(dateStr)}&weekday=${weekday}&category=gym`,
      ),
    onSuccess: (data) => {
      if (!dayLabel.trim() && data.day_label) {
        setDayLabel(data.day_label);
      }
      setExercises(
        data.exercises.map((e) => ({
          name: e.name,
          notes: e.notes ?? '',
          default_reps: null,
          sets: e.sets.map((s) => ({
            reps: s.reps?.toString() ?? '',
            weight_kg: s.weight_kg?.toString() ?? '',
            notes: s.notes ?? '',
            completed: false,
          })),
        })),
      );
      Alert.alert('Copiado', 'Se copió el entrenamiento anterior. Edita lo que necesites.');
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.status === 404) {
        Alert.alert(
          'No hay entrenamiento anterior',
          'Aún no tienes un entrenamiento anterior de este día para copiar.',
        );
        return;
      }
      Alert.alert('Sin datos', toUserFacingErrorMessage(e));
    },
  });

  const startRestTimer = useCallback((duration: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRestLeft(duration);
    timerRef.current = setInterval(() => {
      setRestLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          Vibration.vibrate([0, 150, 80, 150]);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const toggleSetDone = useCallback(
    (exIdx: number, setIdx: number) => {
      markUserEdited();
      setExercises((prev) =>
        prev.map((e, i) => {
          if (i !== exIdx) return e;
          return {
            ...e,
            sets: e.sets.map((s, j) => {
              if (j !== setIdx) return s;
              if (s.completed) {
                return { ...s, completed: false };
              }
              let reps = s.reps;
              let weight_kg = s.weight_kg;
              if (!reps.trim() && !weight_kg.trim()) {
                const def = parseDefaultReps(e.default_reps);
                reps = def != null ? String(def) : '1';
              }
              startRestTimer(restDuration);
              return { ...s, reps, weight_kg, completed: true };
            }),
          };
        }),
      );
    },
    [markUserEdited, restDuration, startRestTimer],
  );

  const addExercise = useCallback(() => {
    markUserEdited();
    setExercises((prev) => [
      ...prev,
      {
        name: '',
        notes: '',
        default_reps: null,
        sets: [{ reps: '', weight_kg: '', notes: '', completed: false }],
      },
    ]);
  }, [markUserEdited]);

  const removeExercise = useCallback(
    (idx: number) =>
      Alert.alert('Eliminar ejercicio', '¿Quitar este ejercicio?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            markUserEdited();
            setExercises((prev) => prev.filter((_, i) => i !== idx));
          },
        },
      ]),
    [markUserEdited],
  );

  const updateEx = useCallback((idx: number, patch: Partial<ExLocal>) => {
    markUserEdited();
    setExercises((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }, [markUserEdited]);

  const addSet = useCallback((exIdx: number) => {
    markUserEdited();
    setExercises((prev) =>
      prev.map((e, i) => {
        if (i !== exIdx) return e;
        return {
          ...e,
          sets: [...e.sets, { reps: '', weight_kg: '', notes: '', completed: false }],
        };
      }),
    );
  }, [markUserEdited]);

  const removeSet = useCallback((exIdx: number, setIdx: number) => {
    markUserEdited();
    setExercises((prev) =>
      prev.map((e, i) => {
        if (i !== exIdx) return e;
        return { ...e, sets: e.sets.filter((_, j) => j !== setIdx) };
      }),
    );
  }, [markUserEdited]);

  const updateSet = useCallback((exIdx: number, setIdx: number, patch: Partial<SetLocal>) => {
    markUserEdited();
    setExercises((prev) =>
      prev.map((e, i) => {
        if (i !== exIdx) return e;
        return {
          ...e,
          sets: e.sets.map((s, j) => {
            if (j !== setIdx) return s;
            const merged = { ...s, ...patch };
            const hasValue = merged.reps.trim() !== '' || merged.weight_kg.trim() !== '';
            if (patch.completed === undefined) {
              merged.completed = hasValue;
            }
            return merged;
          }),
        };
      }),
    );
  }, [markUserEdited]);

  const isSaving = completeMut.isPending;
  const isAutosaving = persistMut.isPending;

  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const doneSets = exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0,
  );
  const allDone = totalSets > 0 && doneSets === totalSets;
  const progressPct = totalSets > 0 ? Math.min(1, doneSets / totalSets) : 0;
  const timerColor = restLeft !== null
    ? restLeft <= 10 ? colors.error
    : restLeft <= 30 ? colors.warning
    : colors.primaryLight
    : colors.primaryLight;

  useEffect(() => {
    if (allDone && !wasAllDoneRef.current) {
      setCompletionToast(true);
      const t = setTimeout(() => setCompletionToast(false), 2400);
      return () => clearTimeout(t);
    }
    wasAllDoneRef.current = allDone;
  }, [allDone]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Day picker modal */}
      <Modal visible={showDayPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={() => setShowDayPicker(false)}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="calendar" size={20} color={colors.primaryLight} />
            </View>
            <Text style={styles.modalTitle}>¿Qué quieres entrenar?</Text>
            <Text style={styles.modalSubtitle}>
              {WEEKDAY_LABELS_FULL[weekday]} · {dateStr}
            </Text>

            <View style={styles.dayList}>
              {routine?.days.map((day) => (
                <Pressable
                  key={day.id ?? day.weekday}
                  style={({ pressed }) => [styles.dayOption, pressed && styles.pressed]}
                  onPress={() => pickDay(day)}
                >
                  <View style={styles.dayOptionLeft}>
                    <Text style={styles.dayOptionWeekday}>
                      {WEEKDAY_LABELS_FULL[day.weekday]}
                    </Text>
                    <Text style={styles.dayOptionLabel}>{day.label}</Text>
                  </View>
                  <View style={styles.dayOptionRight}>
                    <Text style={styles.dayOptionExCount}>{day.exercises.length} ej.</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </View>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.modalSkip, pressed && styles.pressed]}
              onPress={() => setShowDayPicker(false)}
            >
              <Ionicons name="add-circle-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.modalSkipText}>Sesión libre</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 80 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{isEdit ? 'EDITAR SESIÓN' : 'NUEVA SESIÓN'}</Text>
          <Pressable
            onPress={() => routine && routine.days.length > 0 && setShowDayPicker(true)}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <View style={styles.titleRow}>
              <TextInput
                style={styles.titleInput}
                value={dayLabel}
                onChangeText={(t) => {
                  markUserEdited();
                  setDayLabel(t);
                }}
                placeholder="Push, Pull, Pierna..."
                placeholderTextColor={colors.textMuted}
              />
              {routine && routine.days.length > 0 && (
                <Ionicons name="swap-horizontal-outline" size={18} color={colors.textMuted} />
              )}
            </View>
          </Pressable>

          <View style={styles.headerMeta}>
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.metaChipText}>
                {WEEKDAY_LABELS_FULL[weekday]} · {dateStr}
              </Text>
            </View>
            {exercises.length > 0 && (
              <View style={[styles.metaChip, allDone && styles.metaChipDone]}>
                <Ionicons
                  name={allDone ? 'checkmark-circle' : 'barbell-outline'}
                  size={12}
                  color={allDone ? colors.success : colors.primaryLight}
                />
                <Text
                  style={[
                    styles.metaChipText,
                    { color: allDone ? colors.success : colors.primaryLight },
                  ]}
                >
                  {doneSets}/{totalSets} series
                </Text>
              </View>
            )}
            {doneSets > 0 && (
              <View style={[styles.metaChip, styles.metaChipDone]}>
                <Ionicons name="checkmark" size={12} color={colors.success} />
                <Text style={[styles.metaChipText, { color: colors.success }]}>
                  {doneSets}/{totalSets} hechas
                </Text>
              </View>
            )}
          </View>

          {totalSets > 0 && (
            <View style={styles.headerProgressTrack}>
              <View
                style={[
                  styles.headerProgressFill,
                  { width: `${progressPct * 100}%` },
                  allDone && styles.headerProgressFillDone,
                ]}
              />
            </View>
          )}

          {!isEdit && (
            <Pressable
              style={({ pressed }) => [styles.copyBtn, pressed && styles.pressed]}
              onPress={() => copyMut.mutate()}
              disabled={copyMut.isPending}
            >
              <Ionicons name="copy-outline" size={14} color={colors.primaryLight} />
              <Text style={styles.copyBtnText}>
                {copyMut.isPending ? 'Copiando…' : 'Copiar entrenamiento anterior'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Exercises */}
        {exercises.map((ex, ei) => (
          <ExerciseCard
            key={ei}
            ex={ex}
            index={ei}
            onUpdateEx={updateEx}
            onUpdateSet={updateSet}
            onAddSet={addSet}
            onRemoveSet={removeSet}
            onRemove={removeExercise}
            onToggleDone={toggleSetDone}
          />
        ))}

        <Pressable
          style={({ pressed }) => [styles.addExBtn, pressed && styles.pressed]}
          onPress={addExercise}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primaryLight} />
          <Text style={styles.addExText}>Añadir ejercicio</Text>
        </Pressable>

        {/* Notes */}
        <Text style={styles.label}>
          Notas <Text style={styles.labelOptional}>(opcional)</Text>
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 70 }]}
          value={notes}
          onChangeText={(t) => {
            markUserEdited();
            setNotes(t);
          }}
          placeholder="Sensaciones, lesiones, observaciones..."
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
        />
      </ScrollView>

      {completionToast && (
        <View
          style={[
            styles.completionToast,
            { bottom: Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 90 },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="checkmark-circle" size={18} color={colors.white} />
          <Text style={styles.completionToastText}>¡Sesión completa! Pulsa para guardar.</Text>
        </View>
      )}

      {restLeft !== null && (
        <View style={[styles.timerBar, restLeft <= 10 && styles.timerBarUrgent]}>
          <Ionicons name="timer-outline" size={16} color={timerColor} />
          <Text style={[styles.timerBarLabel, { color: timerColor }]}>Descanso</Text>
          <Text style={[styles.timerBarTime, { color: timerColor }]}>
            {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}
          </Text>
          <View style={styles.timerBarDurations}>
            {[60, 90, 120].map((d) => (
              <Pressable
                key={d}
                onPress={() => { setRestDuration(d); startRestTimer(d); }}
                style={[styles.timerDurBtn, d === restDuration && styles.timerDurBtnActive]}
              >
                <Text style={[styles.timerDurText, d === restDuration && styles.timerDurTextActive]}>
                  {d}s
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => {
              if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
              setRestLeft(null);
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      )}
      <View
        style={[
          styles.saveBar,
          { paddingBottom: Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) + DOCK_H + spacing.md },
        ]}
      >
        {isAutosaving && !isSaving && (
          <View style={styles.autosaveHint}>
            <Ionicons name="cloud-upload-outline" size={12} color={colors.textMuted} />
            <Text style={styles.autosaveHintText}>Guardando progreso…</Text>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            allDone && styles.saveBtnDone,
            isSaving && styles.saveBtnDisabled,
            pressed && !isSaving && styles.saveBtnPressed,
          ]}
          onPress={() => !isSaving && completeMut.mutate()}
          disabled={isSaving}
        >
          <Ionicons
            name={allDone ? 'checkmark-circle' : 'checkmark'}
            size={18}
            color={colors.white}
          />
          <Text style={styles.saveBtnText}>
            {isSaving
              ? 'Guardando…'
              : allDone
              ? 'Listo, completar'
              : isEdit
              ? 'Completar sesión'
              : 'Completar sesión'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md, width: '100%' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 380,
    marginHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.h3, color: colors.text, marginBottom: 4 },
  modalSubtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg },

  dayList: { gap: spacing.sm },
  dayOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayOptionLeft: { flex: 1, gap: 2 },
  dayOptionWeekday: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayOptionLabel: { ...typography.bodyBold, color: colors.text },
  dayOptionRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayOptionExCount: { ...typography.caption, color: colors.textSecondary },
  modalSkip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  modalSkipText: { ...typography.captionBold, color: colors.textSecondary },

  header: { marginBottom: spacing.lg },
  eyebrow: { ...typography.label, color: colors.primaryLight, marginBottom: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  titleInput: {
    ...typography.screenTitle,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
  },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaChipText: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },
  metaChipDone: { backgroundColor: colors.successMuted, borderColor: colors.success },

  headerProgressTrack: {
    marginTop: spacing.sm,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  headerProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  headerProgressFillDone: { backgroundColor: colors.success },

  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  copyBtnText: { ...typography.small, color: colors.primaryLight, fontWeight: '700' },

  exCard: { padding: spacing.md, marginBottom: spacing.md, width: '100%', alignSelf: 'stretch' },
  exCardDone: {
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.successMuted,
  },
  exNumberBadgeDone: { backgroundColor: colors.success },
  exProgressChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
  },
  exProgressText: { ...typography.micro, color: colors.textSecondary, fontWeight: '700' },
  exProgressTextDone: { color: colors.success },
  exHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    minWidth: 0,
  },
  exNumberBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exNumberText: { ...typography.captionBold, color: colors.primaryLight },
  exNameInput: { ...typography.bodyBold, color: colors.text, flex: 1, minWidth: 0, paddingVertical: 0 },
  exHeaderBtn: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  setHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
    width: '100%',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  setHeaderText: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 4,
    minWidth: 0,
    width: '100%',
    borderRadius: borderRadius.sm,
  },
  setNumWrap: { width: 32, alignItems: 'center' },
  setNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  setNumBadgeDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  setNumText: {
    ...typography.captionBold,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  setRowDone: {
    backgroundColor: colors.successMuted,
    borderRadius: borderRadius.sm,
    marginHorizontal: -spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  setInput: {
    flex: 1,
    minWidth: 0,
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  setInputDone: {
    backgroundColor: colors.surface,
    borderColor: colors.success,
    opacity: 0.85,
  },
  removeSetBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryGlowSoft,
  },
  addSetText: { ...typography.small, color: colors.primaryLight, fontWeight: '700' },

  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    borderStyle: 'dashed',
    backgroundColor: colors.primaryGlowSoft,
  },
  addExText: { ...typography.captionBold, color: colors.primaryLight },

  label: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
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

  exDoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.successMuted,
    borderWidth: 1,
    borderColor: colors.success,
  },
  exDoneChipText: {
    ...typography.micro,
    color: colors.success,
    fontWeight: '700',
  },

  timerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: screenPaddingX,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.primaryMuted,
    borderTopWidth: 1,
    borderTopColor: colors.primaryBorder,
  },
  timerBarUrgent: {
    backgroundColor: colors.errorMuted,
    borderTopColor: colors.errorBorder,
  },
  timerBarLabel: { ...typography.small, color: colors.primaryLight, fontWeight: '600' },
  timerBarTime: { ...typography.h3, color: colors.primaryLight, flex: 1, textAlign: 'center' },
  timerBarDurations: { flexDirection: 'row', gap: 4 },
  timerDurBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerDurBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timerDurText: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },
  timerDurTextActive: { color: colors.white },

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
  saveBtnDone: { backgroundColor: colors.success },
  autosaveHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
    marginBottom: 4,
  },
  autosaveHintText: { ...typography.micro, color: colors.textMuted },
  completionToast: {
    position: 'absolute',
    alignSelf: 'center',
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success,
  },
  completionToastText: { ...typography.captionBold, color: colors.white },
});
