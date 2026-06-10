import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import {
  Input,
  Chip,
  LoadingScreen,
  Surface,
  UIButton,
  SlideUpView,
} from '../../src/components';
import {
  colors,
  spacing,
  typography,
  screenPaddingX,
  hairlineWidth,
  iconSize,
  borderRadius,
} from '../../src/theme';
import type { InjuriesData, Profile } from '../../src/types';

type FieldRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  unit?: string;
  children: React.ReactNode;
};

function FieldRow({ icon, label, unit, children }: FieldRowProps) {
  return (
    <View style={s.fieldRow}>
      <View style={s.fieldIconCircle}>
        <Ionicons name={icon} size={18} color={colors.primaryLight} />
      </View>
      <View style={s.fieldRowBody}>
        <View style={s.fieldRowLabelRow}>
          <Text style={s.fieldRowLabel}>{label}</Text>
          {unit ? <Text style={s.fieldRowUnit}>{unit}</Text> : null}
        </View>
        {children}
      </View>
    </View>
  );
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
  });

  const [name, setName] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [birthYear, setBirthYear] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [initialized, setInitialized] = useState(false);

  if (profile && !initialized) {
    setName(profile.display_name || '');
    setSex(profile.sex || '');
    setBirthYear(profile.birth_year ? String(profile.birth_year) : '');
    setHeight(profile.height_cm ? String(Math.round(profile.height_cm)) : '');
    setWeight(profile.current_weight_kg ? String(profile.current_weight_kg) : '');
    setInitialized(true);
  }

  const isDirty = useMemo(() => {
    if (!profile) return false;
    const heightNum = height ? parseFloat(height.replace(',', '.')) : undefined;
    const weightNum = weight ? parseFloat(weight.replace(',', '.')) : undefined;
    const birthNum = birthYear ? parseInt(birthYear) : undefined;
    return (
      (name.trim() || '') !== (profile.display_name || '') ||
      (sex || '') !== (profile.sex || '') ||
      birthNum !== (profile.birth_year ?? undefined) ||
      heightNum !== (profile.height_cm ?? undefined) ||
      weightNum !== (profile.current_weight_kg ?? undefined)
    );
  }, [profile, name, sex, birthYear, height, weight]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const weightKg = parseFloat(weight.replace(',', '.'));
      const payload: Record<string, unknown> = {
        display_name: name.trim() || undefined,
        sex: sex || undefined,
        birth_year: birthYear ? parseInt(birthYear) : undefined,
        height_cm: height ? parseFloat(height.replace(',', '.')) : undefined,
        current_weight_kg: Number.isFinite(weightKg) ? weightKg : undefined,
      };
      await api.put('/api/v1/me/profile', payload);

      if (Number.isFinite(weightKg) && weightKg !== profile?.current_weight_kg) {
        try {
          await api.post('/api/v1/progress/weight', {
            weight_kg: weightKg,
            date: new Date().toISOString().split('T')[0],
          });
        } catch { /* peso registrado aparte, no bloquear */ }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['weight-history'] });
      if (Platform.OS === 'web') {
        window.alert('Perfil actualizado');
      } else {
        Alert.alert('Guardado', 'Perfil actualizado correctamente');
      }
      router.back();
    },
    onError: (e: unknown) => {
      const msg = toUserFacingErrorMessage(e, 'Algo salió mal. Inténtalo de nuevo.');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('No se pudo guardar', msg);
      }
    },
  });

  if (isLoading) return <LoadingScreen />;

  const saveDisabled = saveMutation.isPending || !isDirty;
  const stickyBottom = Math.max(insets.bottom, spacing.md);

  return (
    <View style={s.root}>
      <ScrollView
        style={s.container}
        contentContainerStyle={[
          s.content,
          {
            paddingTop: Math.max(insets.top, spacing.md) + spacing.sm,
            paddingBottom: stickyBottom + 96,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SlideUpView delay={60} duration={460} distance={18}>
          <View style={s.heroHeader}>
            <Text style={s.heroEyebrow}>Perfil</Text>
            <Text style={s.heroTitle}>Editar perfil</Text>
            <Text style={s.heroSubtitle}>
              Mantén tus datos al día para que tus objetivos y plan se ajusten a ti.
            </Text>
          </View>
        </SlideUpView>

        <SlideUpView delay={140} duration={500} distance={20}>
          <Surface variant="elevated" padding="lg" style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionIcon}>
                <Ionicons name="person-outline" size={16} color={colors.primaryLight} />
              </View>
              <Text style={s.sectionEyebrow}>Identidad</Text>
            </View>

            <FieldRow icon="text-outline" label="Nombre">
              <Input
                dense
                value={name}
                onChangeText={setName}
                placeholder="Tu nombre"
                autoCapitalize="words"
              />
            </FieldRow>

            <View style={s.fieldDivider} />

            <FieldRow icon="male-female-outline" label="Sexo">
              <View style={s.chipRow}>
                <Chip label="Hombre" selected={sex === 'male'} onPress={() => setSex('male')} />
                <Chip label="Mujer" selected={sex === 'female'} onPress={() => setSex('female')} />
              </View>
            </FieldRow>
          </Surface>
        </SlideUpView>

        <SlideUpView delay={220} duration={500} distance={20}>
          <Surface variant="elevated" padding="lg" style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionIcon}>
                <Ionicons name="fitness-outline" size={16} color={colors.primaryLight} />
              </View>
              <Text style={s.sectionEyebrow}>Datos físicos</Text>
            </View>

            <FieldRow icon="calendar-outline" label="Año de nacimiento" unit="años">
              <Input
                dense
                value={birthYear}
                onChangeText={setBirthYear}
                placeholder="1995"
                keyboardType="numeric"
                maxLength={4}
              />
            </FieldRow>

            <View style={s.fieldDivider} />

            <FieldRow icon="resize-outline" label="Altura" unit="cm">
              <Input
                dense
                value={height}
                onChangeText={setHeight}
                placeholder="175"
                keyboardType="numeric"
                maxLength={3}
              />
            </FieldRow>

            <View style={s.fieldDivider} />

            <FieldRow icon="barbell-outline" label="Peso actual" unit="kg">
              <Input
                dense
                value={weight}
                onChangeText={setWeight}
                placeholder="80"
                keyboardType="decimal-pad"
                maxLength={6}
              />
            </FieldRow>
          </Surface>
        </SlideUpView>

        <SlideUpView delay={300} duration={500} distance={18}>
          <Surface variant="subtle" style={s.moreSurface}>
            <View style={[s.sectionHeader, s.moreSectionHeader]}>
              <View style={s.sectionIcon}>
                <Ionicons name="options-outline" size={16} color={colors.primaryLight} />
              </View>
              <Text style={s.sectionEyebrow}>Más ajustes</Text>
            </View>

            <TouchableOpacity
              style={s.menuRow}
              onPress={() => router.push('/profile/food-restrictions')}
              activeOpacity={0.85}
            >
              <View style={s.menuIconWrap}>
                <Ionicons name="nutrition-outline" size={iconSize.md} color={colors.text} />
              </View>
              <View style={s.menuTextWrap}>
                <Text style={s.menuLabel}>Restricciones alimentarias</Text>
                <Text style={s.menuHint}>Alergias, intolerancias y alimentos prohibidos</Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={s.menuDivider} />

            <TouchableOpacity
              style={s.menuRow}
              onPressIn={() => {
                void queryClient.prefetchQuery({
                  queryKey: ['injuries'],
                  queryFn: () => api.get<InjuriesData>('/api/v1/me/injuries'),
                  staleTime: 5 * 60 * 1000,
                });
              }}
              onPress={() => router.push('/profile/injuries')}
              activeOpacity={0.85}
            >
              <View style={s.menuIconWrap}>
                <Ionicons name="body-outline" size={iconSize.md} color={colors.text} />
              </View>
              <View style={s.menuTextWrap}>
                <Text style={s.menuLabel}>Lesiones y limitaciones</Text>
                <Text style={s.menuHint}>La IA adaptará las rutinas a tus molestias</Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={s.menuDivider} />

            <TouchableOpacity
              style={s.menuRow}
              onPress={() => router.push('/onboarding')}
              activeOpacity={0.85}
            >
              <View style={s.menuIconWrap}>
                <Ionicons name="refresh-outline" size={iconSize.md} color={colors.text} />
              </View>
              <View style={s.menuTextWrap}>
                <Text style={s.menuLabel}>Repetir onboarding</Text>
                <Text style={s.menuHint}>Recalcula tus objetivos desde cero</Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
            </TouchableOpacity>
          </Surface>
        </SlideUpView>
      </ScrollView>

      <View style={[s.saveBar, { paddingBottom: stickyBottom }]}>
        <UIButton
          variant="primary"
          title={
            saveMutation.isPending
              ? 'Guardando...'
              : isDirty
                ? 'Guardar cambios'
                : 'Sin cambios'
          }
          onPress={() => saveMutation.mutate()}
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
    </View>
  );
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
    marginBottom: spacing.md,
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

  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  fieldIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  fieldRowBody: { flex: 1, minWidth: 0 },
  fieldRowLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  fieldRowLabel: {
    ...typography.captionBold,
    color: colors.textSecondary,
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  fieldRowUnit: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  fieldDivider: {
    height: hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },

  chipRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },

  moreSurface: {
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  moreSectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    minHeight: 60,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextWrap: { flex: 1, minWidth: 0 },
  menuLabel: { ...typography.body, color: colors.text, fontSize: 15 },
  menuHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  menuDivider: {
    height: hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },

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
});
