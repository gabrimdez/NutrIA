import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from './Chip';
import { Input } from './Input';
import { Surface } from './ui/Surface';
import { colors, spacing, typography } from '../theme';
import { estimateStepsKcal, STEPS_KCAL_PER_STEP } from '../lib/healthSteps';
import {
  STEPS_GOAL_PRESETS,
  STEPS_TARGET_MAX,
  STEPS_TARGET_MIN,
  parseStepsTargetInput,
} from '../lib/stepsGoal';

export type StepsGoalFieldsProps = {
  value: string;
  onChangeText: (t: string) => void;
  onFocus?: () => void;
  /** Texto bajo el título (p. ej. en inicio vs. Mis objetivos). */
  subtitleHint: string;
};

export function StepsGoalFields({ value, onChangeText, onFocus, subtitleHint }: StepsGoalFieldsProps) {
  const parsed = React.useMemo(() => parseStepsTargetInput(value), [value]);
  const kcalEst =
    parsed != null && parsed > 0 ? estimateStepsKcal(parsed) : null;
  const inRange =
    parsed != null && parsed >= STEPS_TARGET_MIN && parsed <= STEPS_TARGET_MAX;

  return (
    <View>
      <View style={styles.headerRow}>
        <View style={styles.headerIcon} importantForAccessibility="no">
          <Ionicons name="footsteps" size={22} color={colors.primaryLight} />
        </View>
        <View style={styles.headerTextCol}>
          <Text style={styles.sheetTitle}>Objetivo de pasos</Text>
          <Text style={styles.sheetHint}>{subtitleHint}</Text>
        </View>
      </View>

      <Text style={styles.presetsLabel}>Metas rápidas</Text>
      <View style={styles.presetsRow}>
        {STEPS_GOAL_PRESETS.map((n) => {
          const selected = parsed === n;
          return (
            <Chip
              key={n}
              label={n.toLocaleString('es-ES')}
              compact
              selected={selected}
              onPress={() => onChangeText(String(n))}
              style={styles.presetChip}
            />
          );
        })}
      </View>

      <Input
        label="Pasos al día"
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder="10.000"
        keyboardType="number-pad"
        importantForAutofill="no"
        textContentType="none"
      />

      {kcalEst != null && inRange && parsed != null ? (
        <Surface variant="subtle" padding="md" style={styles.kcalCard}>
          <View style={styles.kcalRow}>
            <Ionicons name="flame" size={24} color={colors.warning} />
            <View style={styles.kcalTextCol}>
              <Text style={styles.kcalValue}>~{kcalEst.toLocaleString('es-ES')} kcal</Text>
              <Text style={styles.kcalSub}>
                Aprox. de energía gastada si completas este objetivo de caminata.
              </Text>
            </View>
          </View>
          <Text style={styles.kcalFine}>
            {`Cálculo orientativo (~${STEPS_KCAL_PER_STEP.toFixed(2).replace('.', ',')} kcal/paso; ${parsed.toLocaleString('es-ES')} pasos). Varía según peso, ritmo, pendiente y zancada.`}
          </Text>
        </Surface>
      ) : null}

      {parsed != null && !inRange ? (
        <Text
          style={styles.validationHint}
          accessibilityLiveRegion="polite"
          accessibilityLabel="El rango permitido es entre 1.000 y 50.000 pasos"
        >
          {parsed < STEPS_TARGET_MIN ? 'Mínimo 1.000 pasos.' : 'Máximo 50.000 pasos.'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryGlowSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  sheetTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: 4,
  },
  sheetHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 0,
    lineHeight: 19,
  },
  presetsLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
    letterSpacing: 0.2,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  presetChip: {
    minHeight: 40,
    minWidth: 64,
    justifyContent: 'center',
  },
  kcalCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.warningMuted,
  },
  kcalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  kcalTextCol: { flex: 1, minWidth: 0 },
  kcalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  kcalSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 19,
  },
  kcalFine: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.md,
    lineHeight: 17,
  },
  validationHint: {
    ...typography.small,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
