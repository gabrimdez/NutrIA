import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from './ui/BottomSheet';
import { colors, spacing, typography, borderRadius, screenPaddingX } from '../theme';
import { quickCompleteOther, WORKOUT_INVALIDATION_KEYS } from '../lib/workoutApi';
import { toUserFacingErrorMessage } from '../lib/userFacingError';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  /** Si viene, la sesión se asocia a la rutina y la usa para sport_type/día. */
  routineId?: string | null;
  /** Sport_type sugerido (de la rutina o del usuario); editable. */
  initialSportType?: string | null;
  onSaved?: () => void;
}

const SUGGESTED_DURATIONS = [20, 30, 45, 60, 90];

/**
 * Hoja inferior para registrar una sesión de "otro deporte" en pocos toques:
 * solo deporte, duración y notas opcionales. Crea una sesión `completed=true`.
 */
export function QuickOtherSheet({ visible, onDismiss, routineId, initialSportType, onSaved }: Props) {
  const qc = useQueryClient();
  const [sportType, setSportType] = useState(initialSportType ?? '');
  const [duration, setDuration] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSportType(initialSportType ?? '');
      setDuration('');
      setNotes('');
      setErrorMsg(null);
    }
  }, [visible, initialSportType]);

  const saveMut = useMutation({
    mutationFn: () => {
      const dur = duration.trim() ? parseInt(duration.trim(), 10) : undefined;
      return quickCompleteOther({
        routine_id: routineId ?? undefined,
        sport_type: sportType.trim() || undefined,
        duration_min: Number.isFinite(dur) && dur && dur > 0 ? dur : undefined,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      for (const key of WORKOUT_INVALIDATION_KEYS) {
        qc.invalidateQueries({ queryKey: [...key] });
      }
      onSaved?.();
      onDismiss();
    },
    onError: (e: Error) => setErrorMsg(toUserFacingErrorMessage(e)),
  });

  const isSaving = saveMut.isPending;
  const canSave =
    !isSaving && (sportType.trim().length > 0 || Boolean(routineId));

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      maxHeightFraction={0.7}
      maxHeightCap={560}
      liftOnKeyboard
    >
      <View style={styles.body}>
        <Text style={styles.title}>Hecho hoy</Text>
        <Text style={styles.subtitle}>
          Registra rápido tu sesión de hoy. Puedes ajustar detalles luego.
        </Text>

        <Text style={styles.label}>Deporte</Text>
        <TextInput
          style={styles.input}
          value={sportType}
          onChangeText={setSportType}
          placeholder="Ej: Running, Fútbol, Natación..."
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Duración (min)</Text>
        <TextInput
          style={styles.input}
          value={duration}
          onChangeText={(t) => setDuration(t.replace(/[^0-9]/g, ''))}
          placeholder="30"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={4}
        />
        <View style={styles.chipsRow}>
          {SUGGESTED_DURATIONS.map((m) => {
            const active = duration === String(m);
            return (
              <Pressable
                key={m}
                onPress={() => setDuration(String(m))}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {m} min
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>
          Notas <Text style={styles.labelOptional}>(opcional)</Text>
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 70 }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Sensaciones, ritmo, distancia..."
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
        />

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            !canSave && styles.saveBtnDisabled,
            pressed && canSave && styles.saveBtnPressed,
          ]}
          disabled={!canSave}
          onPress={() => saveMut.mutate()}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="checkmark" size={18} color={colors.white} />
          )}
          <Text style={styles.saveBtnText}>
            {isSaving ? 'Guardando…' : 'Guardar hoy'}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: screenPaddingX,
    paddingBottom: spacing.lg,
  },
  title: { ...typography.h2, color: colors.text, marginBottom: 4 },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.xs,
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
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryBorder,
  },
  chipText: { ...typography.small, color: colors.textSecondary, fontWeight: '700' },
  chipTextActive: { color: colors.primaryLight },
  pressed: { opacity: 0.85 },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.sm,
  },
  saveBtn: {
    marginTop: spacing.lg,
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
