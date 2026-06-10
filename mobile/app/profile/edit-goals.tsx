import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Switch,
  Modal,
  Pressable,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { scrollFocusedInputIntoViewOnWeb } from '../../src/lib/webFocus';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { Input, LoadingScreen, Surface, UIButton, SlideUpView, StepsGoalFields } from '../../src/components';
import {
  colors,
  spacing,
  typography,
  screenPaddingX,
  hairlineWidth,
  borderRadius,
} from '../../src/theme';
import { computeNutrition, type GoalType, type Sex } from '../../src/lib/nutritionCalc';
import type { Profile, ActiveGoal, DailyTarget, ActivityLevel } from '../../src/types';
import { parseStepsTargetInput, isStepsTargetInValidRange } from '../../src/lib/stepsGoal';

const GOALS: { key: GoalType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'lose_fat', label: 'Perder grasa', icon: 'trending-down-outline' },
  { key: 'maintain', label: 'Mantener', icon: 'swap-horizontal-outline' },
  { key: 'gain_muscle', label: 'Ganar músculo', icon: 'trending-up-outline' },
  { key: 'recomposition', label: 'Recomposición', icon: 'sync-outline' },
];

const ACTIVITY_LEVELS: { key: ActivityLevel; label: string; desc: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'sedentary', label: 'Sedentario', desc: 'Poco o nada de ejercicio', icon: 'bed-outline' },
  { key: 'light', label: 'Ligero', desc: '1–3 días/semana', icon: 'walk-outline' },
  { key: 'moderate', label: 'Moderado', desc: '3–5 días/semana', icon: 'bicycle-outline' },
  { key: 'active', label: 'Activo', desc: '6–7 días/semana', icon: 'barbell-outline' },
  { key: 'very_active', label: 'Muy activo', desc: 'Intenso diario', icon: 'flame-outline' },
];

function parseWeightKg(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

type SelectableTileProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  desc?: string;
  selected: boolean;
  onPress: () => void;
};

function SelectableRow({ icon, label, desc, selected, onPress }: SelectableTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        s.row,
        selected && s.rowSelected,
        pressed && s.rowPressed,
      ]}
    >
      <View style={[s.rowIcon, selected && s.rowIconSelected]}>
        <Ionicons name={icon} size={18} color={selected ? colors.primaryLight : colors.textSecondary} />
      </View>
      <View style={s.rowBody}>
        <Text style={s.rowLabel}>{label}</Text>
        {desc ? <Text style={s.rowDesc}>{desc}</Text> : null}
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={18} color={colors.primaryLight} />
      ) : (
        <View style={s.rowCheckPlaceholder} />
      )}
    </Pressable>
  );
}

function GoalCard({ icon, label, selected, onPress }: Omit<SelectableTileProps, 'desc'>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        s.goalCard,
        selected && s.goalCardSelected,
        pressed && s.rowPressed,
      ]}
    >
      <View style={[s.goalCardIcon, selected && s.goalCardIconSelected]}>
        <Ionicons name={icon} size={20} color={selected ? colors.primaryLight : colors.textSecondary} />
      </View>
      <Text style={[s.goalCardLabel, selected && s.goalCardLabelSelected]} numberOfLines={2}>
        {label}
      </Text>
      {selected ? (
        <View style={s.goalCardCheck}>
          <Ionicons name="checkmark" size={12} color={colors.white} />
        </View>
      ) : null}
    </Pressable>
  );
}

function MacroPill({ label, value, color, unit = 'g' }: { label: string; value: number; color: string; unit?: string }) {
  return (
    <View style={s.macroPill}>
      <View style={[s.macroDot, { backgroundColor: color }]} />
      <View style={s.macroPillBody}>
        <Text style={s.macroPillLabel}>{label}</Text>
        <Text style={s.macroPillValue}>
          {Math.round(value)}
          <Text style={s.macroPillUnit}> {unit}</Text>
        </Text>
      </View>
    </View>
  );
}

export default function EditGoalsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [extraBottomPad, setExtraBottomPad] = useState(0);

  const bumpScrollForKeyboard = useCallback(() => {
    scrollFocusedInputIntoViewOnWeb(160);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const sync = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setExtraBottomPad(Math.round(overlap));
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    sync();
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
  });

  const { data: activeGoal, isLoading: goalLoading } = useQuery({
    queryKey: ['active-goal'],
    queryFn: () => api.get<ActiveGoal>('/api/v1/me/goal'),
  });

  const { data: targets, isLoading: targetsLoading } = useQuery({
    queryKey: ['daily-targets'],
    queryFn: () => api.get<DailyTarget>('/api/v1/me/targets'),
  });

  const [goalType, setGoalType] = useState<GoalType | ''>('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | ''>('');
  const [manualMode, setManualMode] = useState(false);
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [stepsTargetStr, setStepsTargetStr] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [tdeeInfoOpen, setTdeeInfoOpen] = useState(false);
  const [currentWeightStr, setCurrentWeightStr] = useState('');
  const [targetWeightStr, setTargetWeightStr] = useState('');

  useEffect(() => {
    if (initialized || !activeGoal || !targets || profile === undefined) return;
    setGoalType((activeGoal.goal_type as GoalType) || '');
    setActivityLevel(activeGoal.activity_level || '');
    setKcal(String(Math.round(targets.calories_kcal)));
    setProtein(String(Math.round(targets.protein_g)));
    setCarbs(String(Math.round(targets.carbs_g)));
    setFat(String(Math.round(targets.fat_g)));
    setStepsTargetStr(
      targets.steps_target != null && targets.steps_target > 0
        ? String(Math.round(targets.steps_target))
        : '',
    );
    setCurrentWeightStr(
      profile?.current_weight_kg != null && profile.current_weight_kg > 0
        ? String(profile.current_weight_kg)
        : '',
    );
    setTargetWeightStr(
      activeGoal.target_weight_kg != null && activeGoal.target_weight_kg > 0
        ? String(activeGoal.target_weight_kg)
        : '',
    );
    setInitialized(true);
  }, [activeGoal, targets, profile, initialized]);

  const persistWeights = useCallback(async () => {
    const cw = parseWeightKg(currentWeightStr);
    const tw = parseWeightKg(targetWeightStr);
    const targetPayload = targetWeightStr.trim() === '' ? null : tw;

    if (cw !== null && cw >= 30 && cw <= 300) {
      await api.put<Profile>('/api/v1/me/profile', { current_weight_kg: cw });
    }
    await api.put<ActiveGoal>('/api/v1/me/goal/weights', { target_weight_kg: targetPayload });
  }, [currentWeightStr, targetWeightStr]);

  const effectiveWeightKg = useMemo(() => {
    const parsed = parseWeightKg(currentWeightStr);
    if (parsed !== null && parsed >= 30 && parsed <= 300) return parsed;
    const w = profile?.current_weight_kg;
    return w != null && w > 0 ? w : null;
  }, [currentWeightStr, profile?.current_weight_kg]);

  const calculated = useMemo(() => {
    if (!profile?.sex || !profile?.birth_year || !profile?.height_cm || !effectiveWeightKg) return null;
    if (!goalType || !activityLevel) return null;
    return computeNutrition({
      sex: profile.sex as Sex,
      birthYear: profile.birth_year,
      heightCm: profile.height_cm,
      weightKg: effectiveWeightKg,
      activityLevel,
      goalType,
      trainingDaysPerWeek: activeGoal?.training_days_per_week,
    });
  }, [profile, goalType, activityLevel, activeGoal?.training_days_per_week, effectiveWeightKg]);

  const goalOrActivityChanged =
    goalType !== (activeGoal?.goal_type ?? '') ||
    activityLevel !== (activeGoal?.activity_level ?? '');

  useEffect(() => {
    if (!initialized || manualMode || !calculated) return;
    const nextKcal = String(calculated.targetKcal);
    const nextProtein = String(calculated.proteinG);
    const nextCarbs = String(calculated.carbsG);
    const nextFat = String(calculated.fatG);
    if (kcal !== nextKcal) setKcal(nextKcal);
    if (protein !== nextProtein) setProtein(nextProtein);
    if (carbs !== nextCarbs) setCarbs(nextCarbs);
    if (fat !== nextFat) setFat(nextFat);
  }, [calculated, manualMode, initialized, kcal, protein, carbs, fat]);

  const handleGoalChange = (g: GoalType) => {
    setGoalType(g);
    if (manualMode) setManualMode(false);
  };

  const handleActivityChange = (a: ActivityLevel) => {
    setActivityLevel(a);
    if (manualMode) setManualMode(false);
  };

  const parsedKcal = parseFloat(kcal.replace(',', '.')) || 0;
  const parsedProtein = parseFloat(protein.replace(',', '.')) || 0;
  const parsedCarbs = parseFloat(carbs.replace(',', '.')) || 0;
  const parsedFat = parseFloat(fat.replace(',', '.')) || 0;
  const parsedStepsTarget = parseStepsTargetInput(stepsTargetStr);
  const computedKcal = Math.round(parsedProtein * 4 + parsedCarbs * 4 + parsedFat * 9);
  const hasManualStepsOverride =
    parsedStepsTarget !== null && parsedStepsTarget !== (targets?.steps_target ?? null);

  const recalcMutation = useMutation({
    mutationFn: async () => {
      await persistWeights();
      const recalculated = await api.put<DailyTarget>('/api/v1/me/goal/recalculate', {
        goal_type: goalType || undefined,
        activity_level: activityLevel || undefined,
      });
      if (hasManualStepsOverride && parsedStepsTarget !== null) {
        await api.put('/api/v1/me/targets', {
          calories_kcal: recalculated.calories_kcal,
          protein_g: recalculated.protein_g,
          carbs_g: recalculated.carbs_g,
          fat_g: recalculated.fat_g,
          steps_target: parsedStepsTarget,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-targets'] });
      queryClient.invalidateQueries({ queryKey: ['diary'] });
      queryClient.invalidateQueries({ queryKey: ['active-goal'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      notify('Objetivos actualizados');
      goBackSafe();
    },
    onError: (e: unknown) => {
      notify(toUserFacingErrorMessage(e, 'No se pudo guardar'), true);
    },
  });

  const manualMutation = useMutation({
    mutationFn: async () => {
      await persistWeights();
      if (goalOrActivityChanged) {
        await api.put('/api/v1/me/goal/recalculate', {
          goal_type: goalType || undefined,
          activity_level: activityLevel || undefined,
        });
      }
      await api.put('/api/v1/me/targets', {
        calories_kcal: parsedKcal,
        protein_g: parsedProtein,
        carbs_g: parsedCarbs,
        fat_g: parsedFat,
        steps_target: parsedStepsTarget,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-targets'] });
      queryClient.invalidateQueries({ queryKey: ['diary'] });
      queryClient.invalidateQueries({ queryKey: ['active-goal'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      notify('Objetivos actualizados');
      goBackSafe();
    },
    onError: (e: unknown) => {
      notify(toUserFacingErrorMessage(e, 'No se pudo guardar'), true);
    },
  });

  const isSaving = recalcMutation.isPending || manualMutation.isPending;

  const handleSave = () => {
    if (!goalType || !activityLevel) {
      notify('Selecciona un objetivo y nivel de actividad', true);
      return;
    }

    const cw = parseWeightKg(currentWeightStr);
    const tw = parseWeightKg(targetWeightStr);
    if (currentWeightStr.trim() && (cw === null || cw < 30 || cw > 300)) {
      notify('Peso actual inválido (entre 30 y 300 kg, o vacío)', true);
      return;
    }
    if (targetWeightStr.trim() && (tw === null || tw < 30 || tw > 300)) {
      notify('Peso objetivo inválido (entre 30 y 300 kg, o déjalo vacío)', true);
      return;
    }
    if (!manualMode && (cw === null || cw < 30 || cw > 300)) {
      notify('Indica un peso actual entre 30 y 300 kg', true);
      return;
    }
    if (parsedStepsTarget === null || parsedStepsTarget < 1000 || parsedStepsTarget > 50000) {
      notify('Los pasos diarios deben estar entre 1.000 y 50.000', true);
      return;
    }

    if (manualMode) {
      if (parsedKcal < 800 || parsedKcal > 8000) {
        notify('Las calorías deben estar entre 800 y 8.000 kcal', true);
        return;
      }
      if (parsedProtein < 0 || parsedCarbs < 0 || parsedFat < 0) {
        notify('Los macronutrientes no pueden ser negativos', true);
        return;
      }
      manualMutation.mutate();
    } else {
      recalcMutation.mutate();
    }
  };

  if (goalLoading || targetsLoading || profileLoading) return <LoadingScreen />;

  if (!targets || !activeGoal) {
    return (
      <View style={[s.container, s.emptyWrap]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
        <Text style={s.emptyTitle}>Sin objetivos configurados</Text>
        <Text style={s.emptyDesc}>
          Completa el onboarding para que se generen tus objetivos nutricionales automáticamente.
        </Text>
        <UIButton
          variant="primary"
          title="Ir al onboarding"
          onPress={() => router.push('/onboarding')}
          size="lg"
          style={s.emptyBtn}
        />
      </View>
    );
  }

  const stickyBottom = Math.max(insets.bottom, spacing.md);
  const scrollBottomPad = stickyBottom + 96 + extraBottomPad;
  const previewTargetWeight = parseWeightKg(targetWeightStr);
  const saveDisabled =
    isSaving ||
    !goalType ||
    !activityLevel ||
    !isStepsTargetInValidRange(parsedStepsTarget);

  const goalsForm = (
    <>
      <ScrollView
        style={s.container}
        contentContainerStyle={[
          s.content,
          {
            paddingTop: Math.max(insets.top, spacing.md) + spacing.sm,
            paddingBottom: scrollBottomPad,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SlideUpView delay={60} duration={460} distance={18}>
          <View style={s.heroHeader}>
            <Text style={s.heroEyebrow}>Objetivos</Text>
            <Text style={s.heroTitle}>Mis objetivos</Text>
            <Text style={s.heroSubtitle}>
              Define tu meta y deja que calculemos tus calorías y macros, o ajústalas a tu medida.
            </Text>
          </View>
        </SlideUpView>

        {/* Objetivo */}
        <SlideUpView delay={140} duration={500} distance={20}>
          <Surface variant="elevated" padding="lg" style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionIcon}>
                <Ionicons name="flag-outline" size={16} color={colors.primaryLight} />
              </View>
              <Text style={s.sectionEyebrow}>Tu objetivo</Text>
            </View>
            <Text style={s.sectionHint}>¿Qué quieres conseguir?</Text>
            <View style={s.goalGrid}>
              {GOALS.map((g) => (
                <GoalCard
                  key={g.key}
                  icon={g.icon}
                  label={g.label}
                  selected={goalType === g.key}
                  onPress={() => handleGoalChange(g.key)}
                />
              ))}
            </View>
          </Surface>
        </SlideUpView>

        {/* Pesos */}
        <SlideUpView delay={200} duration={500} distance={20}>
          <Surface variant="elevated" padding="lg" style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionIcon}>
                <Ionicons name="scale-outline" size={16} color={colors.primaryLight} />
              </View>
              <Text style={s.sectionEyebrow}>Tu peso</Text>
            </View>
            <Text style={s.sectionHint}>De dónde partes y a dónde quieres llegar.</Text>

            <View style={s.weightLabelsRow}>
              <Text style={s.weightLabel}>Actual</Text>
              <View style={s.weightArrowSpacer} />
              <Text style={s.weightLabel}>Objetivo</Text>
            </View>
            <View style={s.weightInputsRow}>
              <View style={s.weightCol}>
                <View style={s.weightInputBox}>
                  <View style={s.weightInputFlex}>
                    <Input
                      dense
                      shrinkToWrap
                      value={currentWeightStr}
                      onChangeText={setCurrentWeightStr}
                      onFocus={bumpScrollForKeyboard}
                      placeholder="—"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Text style={s.weightSuffix}>kg</Text>
                </View>
              </View>

              <View style={s.weightArrow}>
                <Ionicons
                  name={previewTargetWeight !== null && previewTargetWeight > 0 ? 'arrow-forward' : 'remove-outline'}
                  size={18}
                  color={colors.textMuted}
                />
              </View>

              <View style={s.weightCol}>
                <View style={s.weightInputBox}>
                  <View style={s.weightInputFlex}>
                    <Input
                      dense
                      shrinkToWrap
                      value={targetWeightStr}
                      onChangeText={setTargetWeightStr}
                      onFocus={bumpScrollForKeyboard}
                      placeholder="Opcional"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Text style={s.weightSuffix}>kg</Text>
                </View>
              </View>
            </View>
          </Surface>
        </SlideUpView>

        {/* Actividad */}
        <SlideUpView delay={260} duration={500} distance={20}>
          <Surface variant="elevated" padding="lg" style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionIcon}>
                <Ionicons name="fitness-outline" size={16} color={colors.primaryLight} />
              </View>
              <Text style={s.sectionEyebrow}>Actividad física</Text>
            </View>
            <Text style={s.sectionHint}>Indica tu nivel medio de movimiento semanal.</Text>
            <View style={s.activityList}>
              {ACTIVITY_LEVELS.map((a) => (
                <SelectableRow
                  key={a.key}
                  icon={a.icon}
                  label={a.label}
                  desc={a.desc}
                  selected={activityLevel === a.key}
                  onPress={() => handleActivityChange(a.key)}
                />
              ))}
            </View>
          </Surface>
        </SlideUpView>

        {/* Calorías y macros */}
        <SlideUpView delay={320} duration={500} distance={20}>
          <Surface variant="elevated" padding="lg" style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionIcon}>
                <Ionicons name="flame-outline" size={16} color={colors.calories} />
              </View>
              <Text style={s.sectionEyebrow}>Calorías y macros</Text>
            </View>
            <Text style={s.sectionHint}>
              {!manualMode && calculated
                ? 'Calculados según tu perfil, objetivo y actividad.'
                : !manualMode
                  ? 'Selecciona objetivo y actividad para calcular.'
                  : 'Valores personalizados. Ajústalos como prefieras.'}
            </Text>

            <View style={s.kcalHero}>
              <Text style={s.kcalHeroValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {parsedKcal > 0 ? Math.round(parsedKcal).toLocaleString('es-ES') : '—'}
              </Text>
              <Text style={s.kcalHeroUnit}>kcal diarias</Text>
            </View>

            <View style={s.macroRow}>
              <MacroPill label="Proteína" value={parsedProtein} color={colors.protein} />
              <MacroPill label="Carbos" value={parsedCarbs} color={colors.carbs} />
              <MacroPill label="Grasa" value={parsedFat} color={colors.fat} />
            </View>

            {!manualMode && parsedKcal > 0 && calculated && (
              <Pressable
                onPress={() => setTdeeInfoOpen(true)}
                style={({ pressed }) => [s.tdeeRow, pressed && s.tdeeRowPressed]}
                accessibilityRole="button"
                accessibilityLabel="Información sobre el gasto energético diario"
              >
                <View style={s.tdeeIcon}>
                  <Ionicons name="speedometer-outline" size={14} color={colors.primaryLight} />
                </View>
                <View style={s.tdeeBody}>
                  <Text style={s.tdeeLabel}>Gasto energético diario</Text>
                  <Text style={s.tdeeValue}>{calculated.tdee.toLocaleString('es-ES')} kcal</Text>
                </View>
                <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
              </Pressable>
            )}

            <View style={s.manualToggle}>
              <View style={s.manualToggleText}>
                <Text style={s.manualToggleLabel}>Ajustar manualmente</Text>
                <Text style={s.manualToggleHint}>Edita las calorías y macros a tu gusto.</Text>
              </View>
              <Switch
                value={manualMode}
                onValueChange={setManualMode}
                trackColor={{ false: colors.border, true: 'rgba(16,185,129,0.4)' }}
                thumbColor={manualMode ? colors.primaryLight : colors.textMuted}
              />
            </View>

            {manualMode && (
              <View style={s.manualInputs}>
                <Input
                  label="Calorías (kcal)"
                  value={kcal}
                  onChangeText={setKcal}
                  onFocus={bumpScrollForKeyboard}
                  placeholder="2200"
                  keyboardType="numeric"
                />
                <Input
                  label="Proteína (g)"
                  value={protein}
                  onChangeText={setProtein}
                  onFocus={bumpScrollForKeyboard}
                  placeholder="150"
                  keyboardType="decimal-pad"
                />
                <Input
                  label="Carbohidratos (g)"
                  value={carbs}
                  onChangeText={setCarbs}
                  onFocus={bumpScrollForKeyboard}
                  placeholder="250"
                  keyboardType="decimal-pad"
                />
                <Input
                  label="Grasa (g)"
                  value={fat}
                  onChangeText={setFat}
                  onFocus={bumpScrollForKeyboard}
                  placeholder="70"
                  keyboardType="decimal-pad"
                />
                {parsedKcal > 0 && computedKcal > 0 && Math.abs(parsedKcal - computedKcal) > 50 && (
                  <View style={s.hintRow}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                    <Text style={s.hintText}>
                      Tus macros suman ~{computedKcal} kcal ({parsedProtein}P×4 + {parsedCarbs}C×4 + {parsedFat}G×9)
                    </Text>
                  </View>
                )}
              </View>
            )}
          </Surface>
        </SlideUpView>

        {/* Pasos (mismo bloque que el bottom sheet del inicio) */}
        <SlideUpView delay={380} duration={500} distance={18}>
          <Surface variant="elevated" padding="lg" style={s.section}>
            <StepsGoalFields
              value={stepsTargetStr}
              onChangeText={setStepsTargetStr}
              onFocus={bumpScrollForKeyboard}
              subtitleHint="Elige tu meta diaria. También la puedes cambiar desde el inicio tocando el anillo de pasos."
            />
          </Surface>
        </SlideUpView>
      </ScrollView>

      <View style={[s.saveBar, { paddingBottom: stickyBottom }]}>
        <UIButton
          variant="primary"
          title={isSaving ? 'Guardando...' : 'Guardar objetivos'}
          onPress={handleSave}
          disabled={saveDisabled}
          size="lg"
          style={s.saveBtn}
          icon={
            <Ionicons
              name="checkmark-outline"
              size={20}
              color={saveDisabled ? colors.textMuted : colors.white}
            />
          }
        />
      </View>

      <Modal
        visible={tdeeInfoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTdeeInfoOpen(false)}
      >
        <View style={s.tdeeModalRoot}>
          <Pressable
            style={s.tdeeModalBackdrop}
            onPress={() => setTdeeInfoOpen(false)}
            accessibilityLabel="Cerrar"
          />
          <View style={s.tdeeModalCard}>
            <Text style={s.tdeeModalTitle}>Gasto energético diario (TDEE)</Text>
            <Text style={s.tdeeModalBody}>
              Este valor es una estimación de las kilocalorías que tu cuerpo suele gastar en un día con tu perfil
              actual (edad, sexo, peso y altura), más el nivel de actividad que has indicado.
              {'\n\n'}
              Partimos de tu tasa metabólica basal (energía en reposo) y la multiplicamos por un factor según lo
              activo que seas. Así sabemos cuánto “mantenimiento” aproximado representa tu día a día.
              {'\n\n'}
              Las calorías y macros que ves arriba no son exactamente el TDEE: se ajustan según tu objetivo
              (por ejemplo déficit para perder grasa o ligero superávit para ganar músculo). El TDEE te ayuda a
              entender de dónde sale ese punto de partida.
              {'\n\n'}
              Es una guía orientativa; el gasto real puede variar según genética, sueño, estrés o entrenamientos.
            </Text>
            <Pressable
              onPress={() => setTdeeInfoOpen(false)}
              style={({ pressed }) => [s.tdeeModalBtn, pressed && s.tdeeModalBtnPressed]}
              accessibilityRole="button"
            >
              <Text style={s.tdeeModalBtnText}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );

  if (Platform.OS === 'web') {
    return <View style={s.root}>{goalsForm}</View>;
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {goalsForm}
    </KeyboardAvoidingView>
  );
}

function goBackSafe() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.dismissTo('/(tabs)/profile' as never);
  }
}

function notify(msg: string, isError = false) {
  if (Platform.OS === 'web') {
    window.alert(isError ? `Error: ${msg}` : msg);
  } else if (isError) {
    Alert.alert('Error', msg);
  } else {
    Alert.alert('Guardado', msg);
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { paddingHorizontal: screenPaddingX },

  heroHeader: {
    marginBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.primaryLight,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...Platform.select({
      ios: { fontFamily: 'Georgia' },
      android: { fontFamily: 'serif' },
      default: {},
    }),
    fontSize: 28,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  section: {
    marginBottom: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.primaryLight,
    textTransform: 'uppercase',
  },
  sectionHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },

  /** Filas seleccionables (actividad) */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 56,
  },
  rowSelected: {
    borderColor: colors.primaryBorderStrong,
    backgroundColor: colors.primaryMuted,
  },
  rowPressed: { opacity: 0.85 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconSelected: { backgroundColor: 'rgba(16,185,129,0.18)' },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { ...typography.bodyBold, fontSize: 14, color: colors.text },
  rowDesc: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowCheckPlaceholder: { width: 18, height: 18 },

  activityList: { gap: spacing.sm },

  /** Tarjetas de objetivo (grid 2×2 compacto) */
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  goalCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
    minHeight: 96,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    position: 'relative',
  },
  goalCardSelected: {
    borderColor: colors.primaryBorderStrong,
    backgroundColor: colors.primaryMuted,
  },
  goalCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCardIconSelected: { backgroundColor: 'rgba(16,185,129,0.18)' },
  goalCardLabel: {
    ...typography.bodyBold,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
  },
  goalCardLabelSelected: { color: colors.text },
  goalCardCheck: {
    position: 'absolute',
    top: spacing.xs + 2,
    right: spacing.xs + 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /** Pesos */
  weightLabelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  weightArrowSpacer: { width: 32 },
  weightInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  weightCol: { flex: 1, minWidth: 0 },
  weightLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  weightInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 52,
  },
  weightInputFlex: { flex: 1, minWidth: 0 },
  weightSuffix: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    paddingRight: 2,
  },
  weightArrow: {
    width: 32,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /** Hero kcal */
  kcalHero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  kcalHeroValue: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
    lineHeight: 50,
    includeFontPadding: false,
  },
  kcalHeroUnit: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  /** Macros */
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  macroPill: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroPillBody: { flex: 1, minWidth: 0 },
  macroPillLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 1,
  },
  macroPillValue: { ...typography.bodyBold, fontSize: 14, color: colors.text },
  macroPillUnit: { ...typography.caption, fontSize: 11, color: colors.textMuted, fontWeight: '500' },

  /** TDEE row */
  tdeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  tdeeRowPressed: { opacity: 0.85 },
  tdeeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tdeeBody: { flex: 1, minWidth: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  tdeeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  tdeeValue: { ...typography.bodyBold, fontSize: 13, color: colors.text },

  /** Manual toggle */
  manualToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  manualToggleText: { flex: 1, minWidth: 0 },
  manualToggleLabel: { ...typography.bodyBold, fontSize: 14, color: colors.text },
  manualToggleHint: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  manualInputs: { marginTop: spacing.sm, gap: spacing.sm },

  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  hintText: { ...typography.caption, color: colors.textMuted, flex: 1 },


  /** TDEE modal */
  tdeeModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  tdeeModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  tdeeModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  tdeeModalTitle: { ...typography.bodyBold, color: colors.text, fontSize: 18, marginBottom: spacing.sm },
  tdeeModalBody: { ...typography.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.lg },
  tdeeModalBtn: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  tdeeModalBtnPressed: { opacity: 0.88 },
  tdeeModalBtnText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },

  /** Sticky save bar */
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  saveBtn: { width: '100%' },

  emptyWrap: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: screenPaddingX },
  emptyTitle: { ...typography.bodyBold, color: colors.text, fontSize: 18, marginTop: spacing.md },
  emptyDesc: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 22 },
  emptyBtn: { width: '100%' },
});
