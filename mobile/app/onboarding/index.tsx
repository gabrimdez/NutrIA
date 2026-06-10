import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TextInput, TouchableOpacity, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/authStore';
import type { OnboardingCompleteResponse } from '../../src/types';
import { Button, Input, Chip } from '../../src/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, screenPaddingX, borderRadius } from '../../src/theme';

const GOALS = [
  { key: 'lose_fat', label: 'Perder grasa' },
  { key: 'maintain', label: 'Mantener' },
  { key: 'gain_muscle', label: 'Ganar músculo' },
  { key: 'recomposition', label: 'Recomposición' },
];

const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentario' },
  { key: 'light', label: 'Ligero' },
  { key: 'moderate', label: 'Moderado' },
  { key: 'active', label: 'Activo' },
  { key: 'very_active', label: 'Muy activo' },
];

const TRAINING_TYPES = [
  { key: 'strength', label: 'Fuerza' },
  { key: 'hypertrophy', label: 'Hipertrofia' },
  { key: 'mixed', label: 'Mixto' },
];

function TagInput({ tags, onTagsChange, placeholder, label }: {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const addTags = useCallback((raw: string) => {
    const items = raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return;
    const unique = items.filter((t) => !tags.some((e) => e.toLowerCase() === t.toLowerCase()));
    if (unique.length > 0) onTagsChange([...tags, ...unique]);
    setText('');
  }, [tags, onTagsChange]);

  const handleChangeText = useCallback((v: string) => {
    if (/[,;\n]/.test(v)) {
      addTags(v);
    } else {
      setText(v);
    }
  }, [addTags]);

  const handleSubmitEditing = useCallback(() => {
    if (text.trim()) addTags(text);
  }, [text, addTags]);

  const handleKeyPress = useCallback((e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && text === '' && tags.length > 0) {
      onTagsChange(tags.slice(0, -1));
    }
  }, [text, tags, onTagsChange]);

  const removeTag = useCallback((idx: number) => {
    onTagsChange(tags.filter((_, i) => i !== idx));
  }, [tags, onTagsChange]);

  return (
    <View style={tagStyles.container}>
      {label && <Text style={tagStyles.label}>{label}</Text>}
      <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()} style={tagStyles.field}>
        <View style={tagStyles.tagsRow}>
          {tags.map((t, i) => (
            <TouchableOpacity key={`${t}-${i}`} style={tagStyles.tag} onPress={() => removeTag(i)} activeOpacity={0.7}>
              <Text style={tagStyles.tagText}>{t}</Text>
              <Ionicons name="close" size={13} color={colors.primaryLight} style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          ))}
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmitEditing}
            onKeyPress={handleKeyPress}
            placeholder={tags.length === 0 ? placeholder : 'Añadir más…'}
            placeholderTextColor={colors.textMuted}
            style={tagStyles.input}
            blurOnSubmit={false}
            returnKeyType="done"
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const tagStyles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.captionBold, color: colors.textSecondary, marginBottom: spacing.sm },
  field: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  tagText: { ...typography.caption, color: colors.primaryLight, fontWeight: '500' },
  input: { ...typography.body, color: colors.text, flex: 1, minWidth: 100, paddingVertical: 4 },
});

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dislikedTags, setDislikedTags] = useState<string[]>([]);
  const [allergyTags, setAllergyTags] = useState<string[]>([]);
  const [form, setForm] = useState({
    sex: '' as 'male' | 'female' | '',
    birth_year: '',
    height_cm: '',
    current_weight_kg: '',
    goal_type: '',
    target_weight_kg: '',
    activity_level: '',
    training_days_per_week: '4',
    training_type: 'hypertrophy',
    preferred_meals_per_day: '4',
  });

  const updateForm = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!session) {
      Alert.alert('Sesión requerida', 'Inicia sesión para continuar.', [
        { text: 'OK', onPress: () => router.replace('/auth/login') },
      ]);
    }
  }, [session]);

  async function handleComplete() {
    setLoading(true);
    try {
      const rawTarget = form.target_weight_kg.trim().replace(',', '.');
      const parsedTarget = rawTarget ? parseFloat(rawTarget) : NaN;
      const data = await api.post<OnboardingCompleteResponse>('/api/v1/onboarding/complete', {
        sex: form.sex,
        birth_year: parseInt(form.birth_year),
        height_cm: parseFloat(form.height_cm),
        current_weight_kg: parseFloat(form.current_weight_kg),
        goal_type: form.goal_type,
        target_weight_kg: Number.isFinite(parsedTarget) ? parsedTarget : null,
        activity_level: form.activity_level,
        training_days_per_week: parseInt(form.training_days_per_week),
        training_type: form.training_type,
        dietary_preferences: [],
        disliked_foods: dislikedTags,
        allergies: allergyTags,
        preferred_meals_per_day: parseInt(form.preferred_meals_per_day),
      });
      queryClient.setQueryData(['active-goal'], data.active_goal);
      queryClient.setQueryData(['daily-targets'], data.daily_targets);
      queryClient.setQueryData(['profile'], data.profile);
      useAuthStore.getState().setIsOnboarded(true);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo completar el onboarding');
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    <View key="basic">
      <Text style={styles.stepTitle}>Datos básicos</Text>
      <Text style={styles.stepDesc}>Necesitamos algunos datos para calcular tus objetivos</Text>
      <View style={styles.row}>
        <Chip label="Hombre" selected={form.sex === 'male'} onPress={() => updateForm('sex', 'male')} />
        <Chip label="Mujer" selected={form.sex === 'female'} onPress={() => updateForm('sex', 'female')} />
      </View>
      <Input
        label="Año de nacimiento"
        value={form.birth_year}
        onChangeText={(v) => updateForm('birth_year', v)}
        placeholder="1995"
        keyboardType="numeric"
      />
      <Input
        label="Altura (cm)"
        value={form.height_cm}
        onChangeText={(v) => updateForm('height_cm', v)}
        placeholder="175"
        keyboardType="numeric"
      />
      <Input
        label="Peso actual (kg)"
        value={form.current_weight_kg}
        onChangeText={(v) => updateForm('current_weight_kg', v)}
        placeholder="80"
        keyboardType="numeric"
      />
    </View>,

    <View key="goal">
      <Text style={styles.stepTitle}>Tu objetivo</Text>
      <Text style={styles.stepDesc}>¿Qué quieres conseguir?</Text>
      <View style={styles.chipRow}>
        {GOALS.map((g) => (
          <Chip
            key={g.key}
            label={g.label}
            selected={form.goal_type === g.key}
            onPress={() => updateForm('goal_type', g.key)}
          />
        ))}
      </View>
      <Input
        label="Peso objetivo (kg, opcional)"
        value={form.target_weight_kg}
        onChangeText={(v) => updateForm('target_weight_kg', v)}
        placeholder="75"
        keyboardType="numeric"
      />
    </View>,

    <View key="activity">
      <Text style={styles.stepTitle}>Actividad y entrenamiento</Text>
      <View style={styles.chipRow}>
        {ACTIVITY_LEVELS.map((a) => (
          <Chip
            key={a.key}
            label={a.label}
            selected={form.activity_level === a.key}
            onPress={() => updateForm('activity_level', a.key)}
          />
        ))}
      </View>
      <Input
        label="Días de entrenamiento/semana"
        value={form.training_days_per_week}
        onChangeText={(v) => updateForm('training_days_per_week', v)}
        placeholder="4"
        keyboardType="numeric"
      />
      <Text style={[styles.label, { marginTop: spacing.md }]}>Tipo de entrenamiento</Text>
      <View style={styles.chipRow}>
        {TRAINING_TYPES.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            selected={form.training_type === t.key}
            onPress={() => updateForm('training_type', t.key)}
          />
        ))}
      </View>
    </View>,

    <View key="prefs">
      <Text style={styles.stepTitle}>Preferencias alimentarias</Text>
      <TagInput
        label="Alimentos que no te gustan"
        tags={dislikedTags}
        onTagsChange={setDislikedTags}
        placeholder="Ej: zanahoria, coliflor…"
      />
      <TagInput
        label="Alergias o intolerancias"
        tags={allergyTags}
        onTagsChange={setAllergyTags}
        placeholder="Ej: gluten, lactosa…"
      />
      <Input
        label="Comidas al día"
        value={form.preferred_meals_per_day}
        onChangeText={(v) => updateForm('preferred_meals_per_day', v)}
        placeholder="4"
        keyboardType="numeric"
      />
    </View>,
  ];

  const canNext = () => {
    if (step === 0) return form.sex && form.birth_year && form.height_cm && form.current_weight_kg;
    if (step === 1) return form.goal_type;
    if (step === 2) return form.activity_level;
    return true;
  };

  return (
    <View style={styles.container}>
      <View style={[styles.progress, { paddingTop: Math.max(insets.top, spacing.lg) }]}>
        {steps.map((_, i) => (
          <View key={i} style={[styles.dot, i <= step && styles.dotActive]} />
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {steps[step]}
      </ScrollView>
      <View style={styles.buttons}>
        {step > 0 && (
          <Button title="Atrás" variant="ghost" onPress={() => setStep((s) => s - 1)} style={styles.backBtn} />
        )}
        {step < steps.length - 1 ? (
          <Button title="Siguiente" onPress={() => setStep((s) => s + 1)} disabled={!canNext()} style={styles.nextBtn} />
        ) : (
          <Button title="Completar" onPress={handleComplete} loading={loading} disabled={!canNext()} style={styles.nextBtn} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  progress: { flexDirection: 'row', justifyContent: 'center', paddingBottom: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, marginHorizontal: 4 },
  dotActive: { backgroundColor: colors.primaryLight, width: 24 },
  scroll: { flexGrow: 1, paddingHorizontal: screenPaddingX, paddingVertical: spacing.lg },
  stepTitle: { ...typography.sectionTitle, color: colors.text, marginBottom: spacing.sm, fontSize: 20 },
  stepDesc: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
  row: { flexDirection: 'row', marginBottom: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg },
  label: { ...typography.captionBold, color: colors.textSecondary },
  buttons: { flexDirection: 'row', padding: spacing.lg, paddingBottom: 40 },
  backBtn: { flex: 1, marginRight: spacing.sm },
  nextBtn: { flex: 2 },
});
