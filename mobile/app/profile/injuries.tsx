import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  type TextInputProps,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { Chip, Input, Surface, UIButton } from '../../src/components';
import type { InjuriesData, InjuryBodyZone, InjuryProfile } from '../../src/types';
import {
  colors,
  spacing,
  typography,
  screenPaddingX,
  hairlineWidth,
  borderRadius,
} from '../../src/theme';

export type DraftInjury = Omit<InjuryProfile, 'bodyZone' | 'customAvoidMovements'> & {
  bodyZone?: InjuryBodyZone;
  customAvoidMovements: string[];
  customAvoidMovementsText?: string;
  isNew?: boolean;
};

export type DraftInjuryErrors = Partial<
  Record<
    | 'bodyZone'
    | 'diagnosisLabel'
    | 'customBodyZoneLabel'
    | 'customAvoidMovements'
    | 'notes'
    | 'painAtRest'
    | 'painWithMovement',
    string
  >
>;

type SectionIcon = React.ComponentProps<typeof Ionicons>['name'];

const BODY_ZONE_OPTIONS: { label: string; value: InjuryBodyZone }[] = [
  { label: 'Hombro', value: 'shoulder' },
  { label: 'Rodilla', value: 'knee' },
  { label: 'Lumbar', value: 'lumbar' },
  { label: 'Cervical', value: 'cervical' },
  { label: 'Codo', value: 'elbow' },
  { label: 'Muñeca / mano', value: 'wrist_hand' },
  { label: 'Cadera', value: 'hip' },
  { label: 'Tobillo / pie', value: 'ankle_foot' },
  { label: 'Tórax / dorsal', value: 'thoracic' },
  { label: 'Otra / no estoy seguro', value: 'other' },
];

const ZONE_LABELS: Record<InjuryBodyZone, string> = BODY_ZONE_OPTIONS.reduce(
  (acc, option) => ({ ...acc, [option.value]: option.label }),
  {} as Record<InjuryBodyZone, string>,
);

const PHASE_OPTIONS: { key: InjuryProfile['phase']; label: string }[] = [
  { key: 'trainable_low_pain', label: 'Leve: entreno con ajustes' },
  { key: 'return_to_training', label: 'Volviendo poco a poco' },
  { key: 'acute', label: 'Aguda / reciente' },
  { key: 'rehab_only', label: 'Solo movilidad/readaptación' },
];

const GOAL_OPTIONS: { key: InjuryProfile['goal']; label: string }[] = [
  { key: 'maintain_fitness', label: 'Mantener forma' },
  { key: 'prioritize_recovery', label: 'Priorizar recuperación' },
  { key: 'maintain_strength', label: 'Mantener fuerza' },
  { key: 'return_to_performance', label: 'Rendimiento' },
];

/** Tags cerrados alineados con los defaults del backend y opciones manuales del producto. */
const MOVEMENT_TAG_OPTIONS: { id: string; label: string }[] = [
  { id: 'overhead_press', label: 'Press vertical' },
  { id: 'horizontal_press', label: 'Press horizontal' },
  { id: 'vertical_pull', label: 'Tracción vertical' },
  { id: 'deep_knee_flexion', label: 'Flexión profunda rodilla' },
  { id: 'jumping_impact', label: 'Impacto / salto' },
  { id: 'running_impact', label: 'Carrera' },
  { id: 'change_of_direction', label: 'Cambios de dirección' },
  { id: 'hip_hinge', label: 'Bisagra / PNR' },
  { id: 'loaded_spinal_flexion', label: 'Flexión lumbar cargada' },
  { id: 'loaded_spinal_rotation', label: 'Rotación lumbar cargada' },
  { id: 'axial_loading', label: 'Carga axial alta' },
  { id: 'shoulder_end_range_abduction', label: 'Abducción hombro extremo' },
  { id: 'shoulder_external_rotation_load', label: 'Rotación externa hombro cargada' },
  { id: 'ankle_plyometric_load', label: 'Pliometría de tobillo' },
  { id: 'wrist_extension_load', label: 'Carga en extensión de muñeca' },
];

function mapLegacyZoneToBodyZone(z: string): InjuryBodyZone {
  const s = z.trim().toLowerCase();
  if (s.includes('rodilla')) return 'knee';
  if (s.includes('lumbar') || s.includes('lumba')) return 'lumbar';
  if (s.includes('cervical')) return 'cervical';
  if (s.includes('codo')) return 'elbow';
  if (s.includes('muñeca') || s.includes('muneca') || s.includes('mano')) return 'wrist_hand';
  if (s.includes('cadera')) return 'hip';
  if (s.includes('tobillo') || s.includes('pie')) return 'ankle_foot';
  if (s.includes('dorsal') || s.includes('torax') || s.includes('tórax')) return 'thoracic';
  if (s.includes('hombro')) return 'shoulder';
  return 'other';
}

function normalizePainValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.trunc(n))) : undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  value.forEach((x) => {
    const sValue = String(x).trim();
    if (sValue && !seen.has(sValue)) {
      seen.add(sValue);
      out.push(sValue);
    }
  });
  return out;
}

function parseCustomAvoidMovements(text: string): string[] {
  return normalizeStringList(text.split(/[,\n]+/));
}

export function normalizeInjury(raw: Partial<InjuryProfile> & { zone?: string }): InjuryProfile {
  const bodyZone =
    raw.bodyZone ||
    (raw.zone ? mapLegacyZoneToBodyZone(raw.zone) : 'shoulder');
  return {
    id: raw.id,
    bodyZone,
    laterality: raw.laterality ?? 'bilateral',
    diagnosisLabel: raw.diagnosisLabel?.trim() || undefined,
    customBodyZoneLabel: raw.customBodyZoneLabel?.trim() || undefined,
    phase: raw.phase ?? 'trainable_low_pain',
    goal: raw.goal ?? 'maintain_fitness',
    painAtRest: normalizePainValue(raw.painAtRest),
    painWithMovement: normalizePainValue(raw.painWithMovement),
    excludeTags: normalizeStringList(raw.excludeTags),
    cautionTags: normalizeStringList(raw.cautionTags),
    preferredTags: normalizeStringList(raw.preferredTags),
    customAvoidMovements: normalizeStringList(raw.customAvoidMovements),
    notes: raw.notes?.trim() || undefined,
    redFlagsReported: !!raw.redFlagsReported,
  };
}

export function normalizeDraft(raw: Partial<DraftInjury> & { zone?: string }): DraftInjury {
  const bodyZone = raw.bodyZone || (raw.zone ? mapLegacyZoneToBodyZone(raw.zone) : undefined);
  const movementText =
    raw.customAvoidMovementsText ?? normalizeStringList(raw.customAvoidMovements).join('\n');
  return {
    id: raw.id,
    bodyZone,
    laterality: raw.laterality ?? 'bilateral',
    diagnosisLabel: raw.diagnosisLabel,
    customBodyZoneLabel: raw.customBodyZoneLabel,
    phase: raw.phase ?? 'trainable_low_pain',
    goal: raw.goal ?? 'maintain_fitness',
    painAtRest: normalizePainValue(raw.painAtRest),
    painWithMovement: normalizePainValue(raw.painWithMovement),
    excludeTags: normalizeStringList(raw.excludeTags),
    cautionTags: normalizeStringList(raw.cautionTags),
    preferredTags: normalizeStringList(raw.preferredTags),
    customAvoidMovements: parseCustomAvoidMovements(movementText),
    customAvoidMovementsText: movementText,
    notes: raw.notes,
    redFlagsReported: !!raw.redFlagsReported,
    isNew: !!raw.isNew,
  };
}

export function draftFromInjury(injury: InjuryProfile): DraftInjury {
  return normalizeDraft({ ...injury, isNew: false });
}

export function validateDraftInjury(injury: DraftInjury): DraftInjuryErrors {
  const errors: DraftInjuryErrors = {};
  const diagnosis = injury.diagnosisLabel?.trim() ?? '';
  const customZone = injury.customBodyZoneLabel?.trim() ?? '';
  const movementText = injury.customAvoidMovementsText ?? '';
  const movementItems = parseCustomAvoidMovements(movementText);

  if (injury.isNew && !diagnosis) {
    errors.diagnosisLabel = 'Describe la lesión, molestia o limitación.';
  } else if (diagnosis.length > 200) {
    errors.diagnosisLabel = 'Máximo 200 caracteres.';
  }
  if (!injury.bodyZone) {
    errors.bodyZone = 'Selecciona una zona aproximada.';
  }
  if (injury.bodyZone === 'other' && !customZone) {
    errors.customBodyZoneLabel = 'Describe la zona o el área afectada.';
  } else if (customZone.length > 120) {
    errors.customBodyZoneLabel = 'Máximo 120 caracteres.';
  }
  if (movementItems.length > 10) {
    errors.customAvoidMovements = 'Máximo 10 movimientos personalizados.';
  } else if (movementItems.some((m) => m.length > 80)) {
    errors.customAvoidMovements = 'Cada movimiento debe tener 80 caracteres o menos.';
  }
  if ((injury.notes ?? '').length > 500) {
    errors.notes = 'Máximo 500 caracteres.';
  }
  if (injury.painAtRest !== undefined && (injury.painAtRest < 0 || injury.painAtRest > 10)) {
    errors.painAtRest = 'Debe estar entre 0 y 10.';
  }
  if (injury.painWithMovement !== undefined && (injury.painWithMovement < 0 || injury.painWithMovement > 10)) {
    errors.painWithMovement = 'Debe estar entre 0 y 10.';
  }
  return errors;
}

export function draftToPayload(injury: DraftInjury): InjuryProfile | null {
  if (!injury.bodyZone) return null;
  return {
    id: injury.id,
    bodyZone: injury.bodyZone,
    laterality: injury.laterality ?? 'bilateral',
    diagnosisLabel: injury.diagnosisLabel?.trim() || undefined,
    customBodyZoneLabel: injury.customBodyZoneLabel?.trim() || undefined,
    phase: injury.phase ?? 'trainable_low_pain',
    goal: injury.goal ?? 'maintain_fitness',
    painAtRest: normalizePainValue(injury.painAtRest),
    painWithMovement: normalizePainValue(injury.painWithMovement),
    excludeTags: normalizeStringList(injury.excludeTags),
    cautionTags: normalizeStringList(injury.cautionTags),
    preferredTags: normalizeStringList(injury.preferredTags),
    customAvoidMovements: parseCustomAvoidMovements(injury.customAvoidMovementsText ?? ''),
    notes: injury.notes?.trim() || undefined,
    redFlagsReported: !!injury.redFlagsReported,
  };
}

export function snapshotDrafts(injuries: DraftInjury[]): string {
  return JSON.stringify(
    injuries.map((injury) => ({
      id: injury.id ?? '',
      bodyZone: injury.bodyZone ?? '',
      laterality: injury.laterality ?? 'bilateral',
      diagnosisLabel: injury.diagnosisLabel?.trim() || '',
      customBodyZoneLabel: injury.customBodyZoneLabel?.trim() || '',
      phase: injury.phase ?? 'trainable_low_pain',
      goal: injury.goal ?? 'maintain_fitness',
      painAtRest: normalizePainValue(injury.painAtRest) ?? null,
      painWithMovement: normalizePainValue(injury.painWithMovement) ?? null,
      excludeTags: normalizeStringList(injury.excludeTags),
      cautionTags: normalizeStringList(injury.cautionTags),
      preferredTags: normalizeStringList(injury.preferredTags),
      customAvoidMovements: parseCustomAvoidMovements(injury.customAvoidMovementsText ?? ''),
      notes: injury.notes?.trim() || '',
      redFlagsReported: !!injury.redFlagsReported,
    })),
  );
}

function zoneSummary(injury: DraftInjury): string {
  if (!injury.bodyZone) return 'Zona pendiente';
  const base = ZONE_LABELS[injury.bodyZone] ?? injury.bodyZone;
  const detail = injury.customBodyZoneLabel?.trim();
  return detail ? `${base} · ${detail}` : base;
}

function SectionHeader({ icon, title, helper }: { icon: SectionIcon; title: string; helper?: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionIconBubble}>
        <Ionicons name={icon} size={16} color={colors.primaryLight} />
      </View>
      <View style={s.sectionCopy}>
        <Text style={s.sectionTitle}>{title}</Text>
        {helper ? <Text style={s.sectionHelper}>{helper}</Text> : null}
      </View>
    </View>
  );
}

function FieldPanel({ children }: { children: React.ReactNode }) {
  return <View style={s.fieldPanel}>{children}</View>;
}

function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
}) {
  return <Text style={[s.statusPill, s[`statusPill_${tone}`]]}>{label}</Text>;
}

function InjurySummaryCard({
  injury,
  index,
  errors,
  onPress,
}: {
  injury: DraftInjury;
  index: number;
  errors: DraftInjuryErrors;
  onPress: () => void;
}) {
  const title = injury.diagnosisLabel?.trim() || `Lesión o limitación #${index + 1}`;
  const hasErrors = Object.keys(errors).length > 0;
  const pain =
    injury.painAtRest !== undefined || injury.painWithMovement !== undefined
      ? `Dolor ${injury.painAtRest ?? '—'}/${injury.painWithMovement ?? '—'}`
      : null;

  return (
    <Surface variant="interactive" onPress={onPress} style={s.summaryCard}>
      <View style={s.summaryLeft}>
        <View style={[s.summaryIcon, injury.redFlagsReported && s.summaryIconDanger]}>
          <Ionicons
            name={injury.redFlagsReported ? 'warning-outline' : 'fitness-outline'}
            size={18}
            color={injury.redFlagsReported ? colors.error : colors.primaryLight}
          />
        </View>
        <View style={s.summaryCopy}>
          <Text style={s.summaryTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.summarySubtitle} numberOfLines={1}>{zoneSummary(injury)}</Text>
          <View style={s.summaryMetaRow}>
            {pain ? <Text style={s.summaryMeta}>{pain}</Text> : null}
            {injury.excludeTags.length > 0 ? <Text style={s.summaryMeta}>{injury.excludeTags.length} tags</Text> : null}
            {hasErrors ? <Text style={[s.summaryMeta, s.summaryMetaWarning]}>Pendiente</Text> : null}
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Surface>
  );
}

export function InjuryForm({
  injury,
  index,
  errors,
  stackPainInputs,
  onUpdate,
  onRemove,
  onInputFocus,
}: {
  injury: DraftInjury;
  index: number;
  errors: DraftInjuryErrors;
  stackPainInputs: boolean;
  onUpdate: (idx: number, patch: Partial<DraftInjury>) => void;
  onRemove: (idx: number) => void;
  onInputFocus?: TextInputProps['onFocus'];
}) {
  const [zoneOptionsOpen, setZoneOptionsOpen] = useState(!injury.bodyZone);
  const [knownPatternsOpen, setKnownPatternsOpen] = useState(false);

  const toggleExcludeTag = (tagId: string) => {
    const set = new Set(injury.excludeTags);
    if (set.has(tagId)) set.delete(tagId);
    else set.add(tagId);
    onUpdate(index, { excludeTags: [...set] });
  };

  const customMovementCount = parseCustomAvoidMovements(injury.customAvoidMovementsText ?? '').length;

  return (
    <Surface variant="elevated" padding="lg" style={s.injuryCard}>
      <View style={s.cardHeader}>
        <View style={s.cardTitleRow}>
          <View style={s.cardNumberBadge}>
            <Text style={s.cardNumberText}>{index + 1}</Text>
          </View>
          <View style={s.cardTitleCopy}>
            <Text style={s.cardTitle} numberOfLines={1}>
              {injury.diagnosisLabel?.trim() || 'Nueva lesión o limitación'}
            </Text>
            <Text style={s.cardSubtitle} numberOfLines={1}>{zoneSummary(injury)}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => onRemove(index)}
          hitSlop={10}
          style={s.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel="Eliminar lesión o limitación"
        >
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>

      <View style={s.cardMetaRow}>
        <StatusPill label={injury.bodyZone ? 'Zona definida' : 'Zona pendiente'} tone={injury.bodyZone ? 'success' : 'warning'} />
        {injury.redFlagsReported ? <StatusPill label="Señales de alerta" tone="danger" /> : null}
        {injury.excludeTags.length > 0 ? <StatusPill label={`${injury.excludeTags.length} tags`} /> : null}
      </View>

      <View style={s.sectionStack}>
        <FieldPanel>
          <SectionHeader
            icon="create-outline"
            title="Descripción"
            helper="Empieza con tus palabras. No tiene que ser un diagnóstico médico."
          />
          <Input
            label="Lesión, molestia o limitación"
            value={injury.diagnosisLabel || ''}
            onChangeText={(v) => onUpdate(index, { diagnosisLabel: v || undefined })}
            onFocus={onInputFocus}
            placeholder="Ej. pubalgia, ciática, dolor al correr, tendón de Aquiles..."
            maxLength={220}
            error={errors.diagnosisLabel}
            hint={`${(injury.diagnosisLabel ?? '').length}/200`}
          />
        </FieldPanel>

        <FieldPanel>
          <SectionHeader
            icon="locate-outline"
            title="Zona aproximada"
            helper="Sirve para adaptar ejercicios; si no encaja, elige “Otra”."
          />
          <TouchableOpacity
            onPress={() => setZoneOptionsOpen((v) => !v)}
            style={s.dropdownHeader}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ expanded: zoneOptionsOpen }}
            accessibilityLabel="Zona aproximada"
          >
            <View style={s.dropdownCopy}>
              <Text style={s.dropdownTitle}>Zona aproximada</Text>
              <Text style={s.dropdownHint}>
                {injury.bodyZone ? zoneSummary(injury) : 'Selecciona una zona'}
              </Text>
            </View>
            <View style={[s.dropdownChevron, { pointerEvents: 'none' }]}>
              <Ionicons
                name={zoneOptionsOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
          {zoneOptionsOpen ? (
            <View style={s.chipRow}>
              {BODY_ZONE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={injury.bodyZone === o.value}
                  onPress={() => onUpdate(index, { bodyZone: o.value })}
                />
              ))}
            </View>
          ) : null}
          {errors.bodyZone ? <Text style={s.fieldError}>{errors.bodyZone}</Text> : null}

          {injury.bodyZone ? (
            <Input
              label={injury.bodyZone === 'other' ? 'Zona personalizada' : 'Detalle de zona'}
              value={injury.customBodyZoneLabel || ''}
              onChangeText={(v) => onUpdate(index, { customBodyZoneLabel: v || undefined })}
              onFocus={onInputFocus}
              placeholder={injury.bodyZone === 'other' ? 'Ej. ingle / pubis, Aquiles, bíceps femoral...' : 'Ej. parte anterior, zona interna, lado externo...'}
              maxLength={140}
              error={errors.customBodyZoneLabel}
              hint={injury.bodyZone === 'other' ? `${(injury.customBodyZoneLabel ?? '').length}/120 · obligatorio` : `${(injury.customBodyZoneLabel ?? '').length}/120 · opcional`}
            />
          ) : null}
        </FieldPanel>

        <FieldPanel>
          <SectionHeader
            icon="pulse-outline"
            title="Intensidad y fase"
            helper="Ayuda a decidir si conviene bajar carga, progresar o priorizar recuperación."
          />
          <View style={[s.rowPain, stackPainInputs && s.rowPainStack]}>
            <View style={s.painField}>
              <Input
                label="Dolor reposo"
                value={injury.painAtRest !== undefined ? String(injury.painAtRest) : ''}
                onChangeText={(v) => {
                  const n = parseInt(v.replace(/\D/g, ''), 10);
                  onUpdate(index, { painAtRest: Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : undefined });
                }}
                onFocus={onInputFocus}
                placeholder="0-10"
                keyboardType="number-pad"
                error={errors.painAtRest}
              />
            </View>
            <View style={s.painField}>
              <Input
                label="Dolor movimiento"
                value={injury.painWithMovement !== undefined ? String(injury.painWithMovement) : ''}
                onChangeText={(v) => {
                  const n = parseInt(v.replace(/\D/g, ''), 10);
                  onUpdate(index, { painWithMovement: Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : undefined });
                }}
                onFocus={onInputFocus}
                placeholder="0-10"
                keyboardType="number-pad"
                error={errors.painWithMovement}
              />
            </View>
          </View>

          <Text style={s.subFieldLabel}>Fase actual</Text>
          <View style={s.chipRow}>
            {PHASE_OPTIONS.map((o) => (
              <Chip key={o.key} label={o.label} selected={injury.phase === o.key} onPress={() => onUpdate(index, { phase: o.key })} />
            ))}
          </View>

          <Text style={s.subFieldLabel}>Objetivo de entrenamiento</Text>
          <View style={s.chipRow}>
            {GOAL_OPTIONS.map((o) => (
              <Chip key={o.key} label={o.label} selected={injury.goal === o.key} onPress={() => onUpdate(index, { goal: o.key })} />
            ))}
          </View>
        </FieldPanel>

        <FieldPanel>
          <SectionHeader
            icon="options-outline"
            title="Movimientos y seguridad"
            helper="Combina tags automáticos con contexto libre que el usuario sí entiende."
          />
          <View style={s.infoCallout}>
            <Ionicons name="shield-checkmark-outline" size={17} color={colors.primaryLight} />
            <Text style={s.infoCalloutText}>
              Los tags conocidos filtran rutinas. Los movimientos personalizados se guardan como contexto adicional.
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setKnownPatternsOpen((v) => !v)}
            style={s.dropdownHeader}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ expanded: knownPatternsOpen }}
            accessibilityLabel="Patrones conocidos a evitar"
          >
            <View style={s.dropdownCopy}>
              <Text style={s.dropdownTitle}>Patrones conocidos a evitar</Text>
              <Text style={s.dropdownHint}>
                {injury.excludeTags.length > 0
                  ? `${injury.excludeTags.length} seleccionados`
                  : 'Opcional, toca para desplegar'}
              </Text>
            </View>
            <View style={[s.dropdownChevron, { pointerEvents: 'none' }]}>
              <Ionicons
                name={knownPatternsOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
          {knownPatternsOpen ? (
            <View style={s.chipRow}>
              {MOVEMENT_TAG_OPTIONS.map((t) => (
                <Chip key={t.id} label={t.label} selected={injury.excludeTags.includes(t.id)} onPress={() => toggleExcludeTag(t.id)} />
              ))}
            </View>
          ) : null}

          <Input
            label="Otros movimientos que te molestan"
            value={injury.customAvoidMovementsText || ''}
            onChangeText={(v) => onUpdate(index, { customAvoidMovementsText: v })}
            onFocus={onInputFocus}
            placeholder="Ej. correr cuesta abajo, zancadas, sprints, abrir mucho la cadera..."
            multiline
            error={errors.customAvoidMovements}
            hint={`${customMovementCount}/10 · separados por comas o saltos de línea`}
          />

          <View style={s.redFlagRow}>
            <View style={s.redFlagCopy}>
              <Text style={s.switchLabel}>Señales de alerta</Text>
              <Text style={s.switchHint}>Marca si hay síntomas que requieren derivación o prudencia extra.</Text>
            </View>
            <Switch
              value={!!injury.redFlagsReported}
              onValueChange={(v) => onUpdate(index, { redFlagsReported: v })}
              trackColor={{ false: colors.border, true: colors.errorMuted }}
              thumbColor={injury.redFlagsReported ? colors.error : colors.textMuted}
            />
          </View>
          {injury.redFlagsReported ? (
            <View style={s.redFlagBanner}>
              <Ionicons name="warning-outline" size={18} color={colors.error} />
              <Text style={s.redFlagText}>
                Si hay dolor intenso, pérdida de fuerza, hormigueos, fiebre, traumatismo reciente o empeoramiento claro, consulta con un profesional antes de entrenar.
              </Text>
            </View>
          ) : null}
        </FieldPanel>

        <FieldPanel>
          <SectionHeader icon="document-text-outline" title="Notas extra" helper="Opcional: contexto que puede ayudar a interpretar el caso." />
          <Input
            label="Notas"
            value={injury.notes || ''}
            onChangeText={(v) => onUpdate(index, { notes: v })}
            onFocus={onInputFocus}
            placeholder="Detalles para la app / IA..."
            multiline
            maxLength={540}
            error={errors.notes}
            hint={`${(injury.notes ?? '').length}/500`}
          />
        </FieldPanel>
      </View>
    </Surface>
  );
}

export const newId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 11);
};

export const EMPTY_DRAFT_INJURY: DraftInjury = {
  laterality: 'bilateral',
  phase: 'trainable_low_pain',
  goal: 'maintain_fitness',
  excludeTags: [],
  customAvoidMovements: [],
  customAvoidMovementsText: '',
  redFlagsReported: false,
  isNew: true,
};

export default function InjuriesScreen() {
  const insets = useSafeAreaInsets();
  const [draftInjuries, setDraftInjuries] = useState<DraftInjury[]>([]);

  const validationErrors = useMemo(() => draftInjuries.map(validateDraftInjury), [draftInjuries]);
  const redFlagCount = draftInjuries.filter((injury) => injury.redFlagsReported).length;
  const incompleteCount = validationErrors.filter((errors) => Object.keys(errors).length > 0).length;
  const openDetail = useCallback((id: string | undefined, index: number) => {
    const query = id ? `id=${encodeURIComponent(id)}` : `index=${index}`;
    router.push(`/profile/injury-detail?${query}` as never);
  }, []);

  const { data, isError, error } = useQuery({
    queryKey: ['injuries'],
    queryFn: () => api.get<InjuriesData>('/api/v1/me/injuries'),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (data === undefined) return;
    const nextDrafts = (data.active_injuries || []).map((item) => draftFromInjury(normalizeInjury(item)));
    setDraftInjuries(nextDrafts);
  }, [data]);

  const handleAdd = useCallback(() => {
    router.push('/profile/injury-detail?id=new' as never);
  }, []);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Surface variant="floating" padding="xl" style={s.heroCard}>
        <View style={s.heroTopRow}>
          <View style={s.heroIconWrap}>
            <Ionicons name="medkit-outline" size={24} color={colors.primaryLight} />
          </View>
          <View style={s.heroCopy}>
            <Text style={s.heroKicker}>Perfil de entrenamiento</Text>
            <Text style={s.heroTitle}>Lesiones y limitaciones</Text>
          </View>
        </View>
        <Text style={s.heroBody}>
          Registra molestias reales con lenguaje claro. La app usa la zona y los patrones
          para adaptar rutinas; esto no sustituye valoración médica.
        </Text>
        <View style={s.heroStatsRow}>
          <View style={s.heroStatItem}>
            <Text style={s.heroStatValue}>{draftInjuries.length}</Text>
            <Text style={s.heroStatLabel}>Activas</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStatItem}>
            <Text style={s.heroStatValue}>{redFlagCount}</Text>
            <Text style={s.heroStatLabel}>Alertas</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStatItem}>
            <Text style={[s.heroStatValue, incompleteCount > 0 && { color: colors.warning }]}>
              {incompleteCount}
            </Text>
            <Text style={s.heroStatLabel}>Pendientes</Text>
          </View>
        </View>
      </Surface>

      {isError ? (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
          <Text style={s.errorText}>
            {error instanceof Error ? error.message : 'No se pudieron cargar las lesiones guardadas.'}
          </Text>
        </View>
      ) : null}

      {draftInjuries.length === 0 ? (
        <Surface variant="subtle" padding="xl" style={s.emptyState}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="body-outline" size={30} color={colors.primaryLight} />
          </View>
          <Text style={s.emptyTitle}>No hay limitaciones activas</Text>
          <Text style={s.emptyText}>
            Añade solo molestias actuales. Puedes escribir cualquier caso aunque no aparezca en la lista.
          </Text>
          <UIButton
            variant="primary"
            title="Añadir primera limitación"
            onPress={handleAdd}
            size="md"
            style={s.emptyCta}
            icon={<Ionicons name="add-outline" size={20} color={colors.white} />}
          />
        </Surface>
      ) : null}

      {draftInjuries.length > 0 ? (
        <View style={s.summaryList}>
          {draftInjuries.map((inj, i) => (
            <InjurySummaryCard
              key={inj.id ?? i}
              injury={inj}
              index={i}
              errors={validationErrors[i] ?? {}}
              onPress={() => openDetail(inj.id, i)}
            />
          ))}
        </View>
      ) : null}

      {draftInjuries.length > 0 ? (
        <Surface variant="plain" style={s.actionPanel}>
          <UIButton
            variant="outline"
            title="Añadir otra"
            onPress={handleAdd}
            size="md"
            style={s.addBtn}
            icon={<Ionicons name="add-outline" size={20} color={colors.white} />}
          />
        </Surface>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md, gap: spacing.md },
  heroCard: { gap: spacing.lg, overflow: 'hidden' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  heroCopy: { flex: 1, minWidth: 0 },
  heroKicker: {
    ...typography.micro,
    color: colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  heroTitle: { ...typography.h2, color: colors.text, letterSpacing: -0.4 },
  heroBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
  },
  heroStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatValue: { ...typography.metricSm, color: colors.text },
  heroStatLabel: { ...typography.micro, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroStatDivider: { width: hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  summaryList: { gap: spacing.sm },
  summaryCard: {
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 },
  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  summaryIconDanger: {
    backgroundColor: colors.errorMuted,
    borderColor: colors.errorBorder,
  },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryTitle: { ...typography.bodyBold, color: colors.text },
  summarySubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  summaryMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  summaryMeta: { ...typography.small, color: colors.textSecondary },
  summaryMetaWarning: { color: colors.warning },
  injuryCard: { gap: spacing.lg, borderColor: colors.borderStrong },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 },
  cardNumberBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  cardNumberText: { ...typography.captionBold, color: colors.primaryLight },
  cardTitleCopy: { flex: 1, minWidth: 0 },
  cardTitle: { ...typography.sectionTitle, color: colors.text },
  cardSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.errorBorder,
  },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusPill: {
    ...typography.small,
    overflow: 'hidden',
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: hairlineWidth,
  },
  statusPill_neutral: { color: colors.textSecondary, backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  statusPill_warning: { color: colors.warning, backgroundColor: colors.warningMuted, borderColor: colors.warningMuted },
  statusPill_danger: { color: colors.error, backgroundColor: colors.errorMuted, borderColor: colors.errorBorder },
  statusPill_success: { color: colors.primaryLight, backgroundColor: colors.primaryMuted, borderColor: colors.primaryBorder },
  sectionStack: { gap: spacing.md },
  fieldPanel: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs },
  sectionIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
  },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { ...typography.bodyBold, color: colors.text },
  sectionHelper: { ...typography.small, color: colors.textMuted, marginTop: 2, lineHeight: 15 },
  subFieldLabel: { ...typography.captionBold, color: colors.textSecondary, marginTop: spacing.xs },
  fieldError: { ...typography.small, color: colors.error, marginTop: -spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dropdownHeader: {
    position: 'relative',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  dropdownCopy: { minWidth: 0, paddingRight: 36 },
  /** Icono alineado abajo a la derecha del bloque (misma interacción táctil en todo el header). */
  dropdownChevron: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.sm,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownTitle: { ...typography.captionBold, color: colors.text },
  dropdownHint: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  rowPain: { flexDirection: 'row', gap: spacing.sm },
  rowPainStack: { flexDirection: 'column' },
  painField: { flex: 1, minWidth: 0 },
  infoCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  infoCalloutText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  redFlagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  redFlagCopy: { flex: 1, minWidth: 0 },
  switchLabel: { ...typography.bodyBold, color: colors.text },
  switchHint: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  redFlagBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: hairlineWidth,
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorMuted,
  },
  redFlagText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  emptyState: { alignItems: 'center', gap: spacing.sm },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...typography.bodyBold, color: colors.text, textAlign: 'center' },
  emptyText: { ...typography.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 19, maxWidth: 320 },
  emptyCta: { marginTop: spacing.sm, width: '100%' },
  actionPanel: { gap: spacing.sm, paddingTop: spacing.sm },
  addBtn: { alignSelf: 'stretch' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.errorMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.errorBorder,
  },
  errorText: { ...typography.caption, color: colors.error, flex: 1, lineHeight: 18 },
});
