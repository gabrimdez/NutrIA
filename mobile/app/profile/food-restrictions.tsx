import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  TextInput,
  TouchableOpacity,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { LoadingScreen, Surface, UIButton, SlideUpView } from '../../src/components';
import type { FoodRestrictions } from '../../src/types';
import {
  colors,
  spacing,
  typography,
  screenPaddingX,
  borderRadius,
  hairlineWidth,
} from '../../src/theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type RestrictionKey =
  | 'dietaryPreferences'
  | 'allergies'
  | 'intolerances'
  | 'forbiddenFoods'
  | 'dislikedFoods';

type RestrictionsDraft = Record<RestrictionKey, string[]>;

type RestrictionSection = {
  key: RestrictionKey;
  icon: IconName;
  title: string;
  eyebrow: string;
  description: string;
  placeholder: string;
  suggestions: string[];
  emptyText: string;
  modeLabel: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
};

type QuickAction = {
  title: string;
  subtitle: string;
  icon: IconName;
  patch?: Partial<RestrictionsDraft>;
  clear?: boolean;
};

const LIST_KEYS: RestrictionKey[] = [
  'dietaryPreferences',
  'allergies',
  'intolerances',
  'forbiddenFoods',
  'dislikedFoods',
];

const SECTIONS: RestrictionSection[] = [
  {
    key: 'dietaryPreferences',
    icon: 'restaurant-outline',
    title: 'Estilo alimentario',
    eyebrow: 'Guía para la IA',
    description:
      'Preferencias que orientan tus planes. Por sí solas no bloquean alimentos; márcalos también en alergias, intolerancias o bloqueos.',
    placeholder: 'Ej. mediterránea, alta en proteína...',
    suggestions: [
      'Mediterránea',
      'Alta en proteína',
      'Vegetariana',
      'Vegana',
      'Sin lácteos',
      'Baja en FODMAP',
      'Halal',
      'Kosher',
    ],
    emptyText: 'Sin estilo específico',
    modeLabel: 'Guía',
    accent: colors.primaryLight,
    accentBg: colors.primaryMuted,
    accentBorder: colors.primaryBorder,
  },
  {
    key: 'allergies',
    icon: 'warning-outline',
    title: 'Alergias',
    eyebrow: 'Evitar siempre',
    description:
      'Alimentos o familias que no deben aparecer en ningún plan. Úsalo para riesgos reales.',
    placeholder: 'Ej. gluten, marisco, frutos secos...',
    suggestions: ['Gluten', 'Frutos secos', 'Marisco', 'Huevo', 'Soja', 'Pescado', 'Sésamo'],
    emptyText: 'Sin alergias declaradas',
    modeLabel: 'Crítica',
    accent: colors.error,
    accentBg: colors.errorMuted,
    accentBorder: colors.errorBorder,
  },
  {
    key: 'intolerances',
    icon: 'alert-circle-outline',
    title: 'Intolerancias',
    eyebrow: 'Evitar por digestión',
    description:
      'Marca lo que te sienta mal. La app lo tratará como restricción fuerte al generar comidas.',
    placeholder: 'Ej. lactosa, fructosa, histamina...',
    suggestions: ['Lactosa', 'Fructosa', 'Histamina', 'Sorbitol', 'Gluten no celíaco', 'FODMAP'],
    emptyText: 'Sin intolerancias',
    modeLabel: 'Crítica',
    accent: colors.warning,
    accentBg: colors.warningMuted,
    accentBorder: 'rgba(245, 158, 11, 0.30)',
  },
  {
    key: 'forbiddenFoods',
    icon: 'ban-outline',
    title: 'No incluir nunca',
    eyebrow: 'Bloqueo personal',
    description:
      'Alimentos que no quieres por ética, religión, objetivos o preferencia firme.',
    placeholder: 'Ej. cerdo, alcohol, carne roja...',
    suggestions: ['Cerdo', 'Alcohol', 'Carne roja', 'Marisco', 'Azúcar añadido', 'Ultraprocesados'],
    emptyText: 'Sin alimentos bloqueados',
    modeLabel: 'Bloqueo',
    accent: colors.error,
    accentBg: colors.errorMuted,
    accentBorder: colors.errorBorder,
  },
  {
    key: 'dislikedFoods',
    icon: 'thumbs-down-outline',
    title: 'Prefiero evitar',
    eyebrow: 'Flexible',
    description:
      'La IA intentará evitarlos, pero no se consideran una prohibición absoluta.',
    placeholder: 'Ej. brócoli, pescado, avena...',
    suggestions: ['Brócoli', 'Pescado', 'Avena', 'Queso', 'Legumbres', 'Picante'],
    emptyText: 'Sin alimentos poco preferidos',
    modeLabel: 'Flexible',
    accent: colors.textSecondary,
    accentBg: colors.surfaceMuted,
    accentBorder: colors.borderStrong,
  },
];

const QUICK_ACTIONS: QuickAction[] = [
  {
    title: 'Sin restricciones',
    subtitle: 'Deja todo limpio',
    icon: 'sparkles-outline',
    clear: true,
  },
  {
    title: 'Sin lactosa',
    subtitle: 'Lácteos fuera del plan',
    icon: 'cafe-outline',
    patch: {
      dietaryPreferences: ['Sin lácteos'],
      intolerances: ['Lactosa'],
    },
  },
  {
    title: 'Celíaco',
    subtitle: 'Gluten bloqueado',
    icon: 'shield-checkmark-outline',
    patch: {
      allergies: ['Gluten'],
    },
  },
  {
    title: 'Vegetariano',
    subtitle: 'Sin carne ni pescado',
    icon: 'leaf-outline',
    patch: {
      dietaryPreferences: ['Vegetariana'],
      forbiddenFoods: ['Carne', 'Pescado', 'Marisco'],
    },
  },
  {
    title: 'Vegano',
    subtitle: 'Sin productos animales',
    icon: 'flower-outline',
    patch: {
      dietaryPreferences: ['Vegana'],
      forbiddenFoods: ['Carne', 'Pescado', 'Marisco', 'Lácteos', 'Huevo', 'Miel'],
    },
  },
  {
    title: 'Sin cerdo',
    subtitle: 'Bloqueo cultural/religioso',
    icon: 'ban-outline',
    patch: {
      forbiddenFoods: ['Cerdo'],
    },
  },
];

function createEmptyDraft(): RestrictionsDraft {
  return {
    dietaryPreferences: [],
    allergies: [],
    intolerances: [],
    forbiddenFoods: [],
    dislikedFoods: [],
  };
}

function createCollapsedExpansion(): Record<RestrictionKey, boolean> {
  return {
    dietaryPreferences: false,
    allergies: false,
    intolerances: false,
    forbiddenFoods: false,
    dislikedFoods: false,
  };
}

function normalizeItem(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function splitItems(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map(normalizeItem)
    .filter(Boolean);
}

function mergeUnique(current: string[], incoming: string[]): string[] {
  const seen = new Set(current.map((item) => item.toLocaleLowerCase()));
  const next = [...current];
  incoming.forEach((raw) => {
    const item = normalizeItem(raw);
    if (!item) return;
    const key = item.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      next.push(item);
    }
  });
  return next;
}

function normalizeList(values: string[]): string[] {
  return mergeUnique([], values);
}

function draftFromResponse(data?: FoodRestrictions | null): RestrictionsDraft {
  return {
    dietaryPreferences: normalizeList(data?.dietary_preferences || []),
    allergies: normalizeList(data?.allergies || []),
    intolerances: normalizeList(data?.intolerances || []),
    forbiddenFoods: normalizeList(data?.forbidden_foods || []),
    dislikedFoods: normalizeList(data?.disliked_foods || []),
  };
}

function snapshotDraft(draft: RestrictionsDraft): string {
  return JSON.stringify({
    dietaryPreferences: normalizeList(draft.dietaryPreferences),
    allergies: normalizeList(draft.allergies),
    intolerances: normalizeList(draft.intolerances),
    forbiddenFoods: normalizeList(draft.forbiddenFoods),
    dislikedFoods: normalizeList(draft.dislikedFoods),
  });
}

function friendlyCount(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function a11yListSummary(items: string[], emptyText: string): string {
  if (items.length === 0) return emptyText;
  return items.join(', ');
}

function actionIncludesAll(action: QuickAction, draft: RestrictionsDraft, hasAny: boolean): boolean {
  if (action.clear) return !hasAny;
  return LIST_KEYS.every((key) => {
    const incoming = action.patch?.[key] || [];
    if (incoming.length === 0) return true;
    const selected = new Set(draft[key].map((item) => item.toLocaleLowerCase()));
    return incoming.every((item) => selected.has(item.toLocaleLowerCase()));
  });
}

function SectionHeader({
  section,
  count,
  expanded,
  onToggle,
}: {
  section: RestrictionSection;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${section.title}. ${count} elementos. ${expanded ? 'Expandido' : 'Colapsado'}`}
      accessibilityHint={expanded ? 'Toca para ocultar las opciones' : 'Toca para mostrar las opciones'}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={s.sectionHeader}
    >
      <View
        style={[
          s.sectionIcon,
          { backgroundColor: section.accentBg, borderColor: section.accentBorder },
        ]}
      >
        <Ionicons name={section.icon} size={18} color={section.accent} />
      </View>
      <View style={s.sectionCopy}>
        <View style={s.sectionTitleRow}>
          <Text style={s.sectionEyebrow} numberOfLines={1}>
            {section.eyebrow}
          </Text>
          <View style={s.headerRightCluster}>
            <Text
              accessibilityLabel={`${count} elementos en ${section.title}`}
              style={[s.countPill, { color: section.accent, borderColor: section.accentBorder }]}
            >
              {count}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textMuted}
            />
          </View>
        </View>
        <View style={s.titleRow}>
          <Text accessibilityRole="header" style={s.sectionTitle} numberOfLines={1}>
            {section.title}
          </Text>
          <Text
            numberOfLines={1}
            style={[s.modePill, { color: section.accent, borderColor: section.accentBorder }]}
          >
            {section.modeLabel}
          </Text>
        </View>
        <Text style={s.sectionDescription}>{section.description}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SuggestionChip({
  label,
  selected,
  accent,
  accentBg,
  accentBorder,
  onPress,
}: {
  label: string;
  selected: boolean;
  accent: string;
  accentBg: string;
  accentBorder: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${selected ? 'Quitar' : 'Añadir'} ${label}`}
      accessibilityHint="Toca para alternar esta sugerencia"
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={[
        s.suggestionChip,
        selected && s.suggestionChipSelected,
        selected && { backgroundColor: accentBg, borderColor: accentBorder },
      ]}
    >
      {selected ? <Ionicons name="checkmark" size={13} color={accent} /> : null}
      <Text style={[s.suggestionText, selected && { color: accent, fontWeight: '700' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SelectedTag({
  label,
  accent,
  accentBg,
  accentBorder,
  onRemove,
}: {
  label: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  onRemove: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={`Eliminar ${label}`}
      accessibilityHint="Quita este elemento de la lista"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={[s.selectedTag, { backgroundColor: accentBg, borderColor: accentBorder }]}
    >
      <Text style={[s.selectedTagText, { color: accent }]}>{label}</Text>
      <Ionicons name="close" size={14} color={accent} />
    </TouchableOpacity>
  );
}

function SmartTagField({
  items,
  sectionTitle,
  selectedSummary,
  placeholder,
  emptyText,
  accent,
  accentBg,
  accentBorder,
  onAdd,
  onRemove,
  onRemoveLast,
}: {
  items: string[];
  sectionTitle: string;
  selectedSummary: string;
  placeholder: string;
  emptyText: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  onAdd: (raw: string) => void;
  onRemove: (index: number) => void;
  onRemoveLast: () => void;
}) {
  const [text, setText] = useState('');
  const textRef = useRef('');
  const inputRef = useRef<TextInput>(null);

  const commit = useCallback(
    (raw: string) => {
      const value = normalizeItem(raw);
      if (!value) return;
      onAdd(value);
      textRef.current = '';
      setText('');
    },
    [onAdd],
  );

  const handleChangeText = useCallback(
    (value: string) => {
      if (/[,;\n]/.test(value)) {
        commit(value);
      } else {
        textRef.current = value;
        setText(value);
      }
    },
    [commit],
  );

  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === 'Backspace' && text.length === 0 && items.length > 0) {
        onRemoveLast();
      }
    },
    [items.length, onRemoveLast, text.length],
  );

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => inputRef.current?.focus()}
      accessible={false}
      style={s.tagField}
    >
      <View style={s.selectedTagsRow}>
        {items.map((item, index) => (
          <SelectedTag
            key={`${item}-${index}`}
            label={item}
            accent={accent}
            accentBg={accentBg}
            accentBorder={accentBorder}
            onRemove={() => onRemove(index)}
          />
        ))}
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={handleChangeText}
          onSubmitEditing={() => commit(text)}
          onBlur={() => {
            const current = textRef.current;
            if (current.trim()) commit(current);
          }}
          onKeyPress={handleKeyPress}
          placeholder={items.length === 0 ? placeholder : 'Añadir más…'}
          placeholderTextColor={colors.textMuted}
          style={s.tagInput}
          accessibilityLabel={`Añadir elemento a ${sectionTitle}. Actual: ${selectedSummary}`}
          accessibilityHint="Escribe un alimento o preferencia y pulsa intro. También puedes separar varios con comas."
          returnKeyType="done"
          blurOnSubmit={false}
        />
      </View>
      {items.length === 0 ? <Text style={s.emptyHint}>{emptyText}</Text> : null}
    </TouchableOpacity>
  );
}

function RestrictionCard({
  section,
  items,
  expanded,
  onToggleExpanded,
  onAdd,
  onToggleSuggestion,
  onRemove,
  onRemoveLast,
}: {
  section: RestrictionSection;
  items: string[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onAdd: (key: RestrictionKey, raw: string) => void;
  onToggleSuggestion: (key: RestrictionKey, label: string) => void;
  onRemove: (key: RestrictionKey, index: number) => void;
  onRemoveLast: (key: RestrictionKey) => void;
}) {
  const selectedKeys = useMemo(
    () => new Set(items.map((item) => item.toLocaleLowerCase())),
    [items],
  );
  const selectedSummary = a11yListSummary(items, section.emptyText);

  return (
    <Surface variant="elevated" padding="lg" style={s.restrictionCard}>
      <SectionHeader
        section={section}
        count={items.length}
        expanded={expanded}
        onToggle={onToggleExpanded}
      />

      {expanded ? (
        <View style={s.cardBody}>
          <View style={s.suggestionHeaderRow}>
            <Text style={s.subLabel}>Sugerencias rápidas</Text>
            <Text
              accessibilityLiveRegion="polite"
              style={[s.selectionStatus, items.length > 0 && { color: section.accent }]}
            >
              {items.length > 0 ? friendlyCount(items.length, 'seleccionado', 'seleccionados') : 'Opcional'}
            </Text>
          </View>
          <View style={s.suggestionWrap}>
            {section.suggestions.map((suggestion) => (
              <SuggestionChip
                key={suggestion}
                label={suggestion}
                selected={selectedKeys.has(suggestion.toLocaleLowerCase())}
                accent={section.accent}
                accentBg={section.accentBg}
                accentBorder={section.accentBorder}
                onPress={() => onToggleSuggestion(section.key, suggestion)}
              />
            ))}
          </View>

          <SmartTagField
            items={items}
            sectionTitle={section.title}
            selectedSummary={selectedSummary}
            placeholder={section.placeholder}
            emptyText={section.emptyText}
            accent={section.accent}
            accentBg={section.accentBg}
            accentBorder={section.accentBorder}
            onAdd={(raw) => onAdd(section.key, raw)}
            onRemove={(index) => onRemove(section.key, index)}
            onRemoveLast={() => onRemoveLast(section.key)}
          />
        </View>
      ) : items.length > 0 ? (
        <Text style={s.collapsedSummary} numberOfLines={2}>
          {items.join(' · ')}
        </Text>
      ) : null}
    </Surface>
  );
}

function QuickActionCard({
  action,
  selected,
  onPress,
}: {
  action: QuickAction;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${action.title}. ${action.subtitle}${selected ? '. Aplicado' : ''}`}
      accessibilityHint={action.clear ? 'Limpia todas las restricciones' : 'Añade esta plantilla a tus restricciones'}
      accessibilityState={{ selected }}
      style={[s.quickAction, selected && s.quickActionSelected]}
    >
      <View style={[s.quickIcon, selected && s.quickIconSelected]}>
        <Ionicons name={selected ? 'checkmark-outline' : action.icon} size={17} color={colors.primaryLight} />
      </View>
      <View style={s.quickCopy}>
        <Text style={s.quickTitle}>{action.title}</Text>
        <Text style={s.quickSubtitle}>{action.subtitle}</Text>
      </View>
      {selected ? (
        <View style={s.quickAppliedBadge}>
          <Text style={s.quickAppliedText}>Activo</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function FoodRestrictionsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [initialized, setInitialized] = useState(false);
  const [draft, setDraft] = useState<RestrictionsDraft>(() => createEmptyDraft());
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshotDraft(createEmptyDraft()));
  const [expandedSections, setExpandedSections] = useState<Record<RestrictionKey, boolean>>(
    () => createCollapsedExpansion(),
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['food-restrictions'],
    queryFn: () => api.get<FoodRestrictions>('/api/v1/me/food-restrictions'),
  });

  useEffect(() => {
    if (data && !initialized) {
      const next = draftFromResponse(data);
      setDraft(next);
      setSavedSnapshot(snapshotDraft(next));
      setInitialized(true);
    }
  }, [data, initialized]);

  const strictCount = draft.allergies.length + draft.intolerances.length + draft.forbiddenFoods.length;
  const preferenceCount = draft.dietaryPreferences.length;
  const softCount = draft.dislikedFoods.length;
  const totalCount = strictCount + preferenceCount + softCount;
  const hasAny = totalCount > 0;
  const isDirty = useMemo(() => snapshotDraft(draft) !== savedSnapshot, [draft, savedSnapshot]);

  const toggleSectionExpanded = useCallback((key: RestrictionKey) => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const allExpanded = useMemo(
    () => LIST_KEYS.every((key) => expandedSections[key]),
    [expandedSections],
  );

  const toggleAllSections = useCallback(() => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpandedSections((prev) => {
      const everyOpen = LIST_KEYS.every((key) => prev[key]);
      const target = !everyOpen;
      return LIST_KEYS.reduce(
        (acc, key) => {
          acc[key] = target;
          return acc;
        },
        {} as Record<RestrictionKey, boolean>,
      );
    });
  }, []);

  const addToList = useCallback((key: RestrictionKey, raw: string) => {
    const incoming = splitItems(raw);
    if (incoming.length === 0) return;
    setDraft((prev) => ({ ...prev, [key]: mergeUnique(prev[key], incoming) }));
  }, []);

  const removeAt = useCallback((key: RestrictionKey, index: number) => {
    setDraft((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));
  }, []);

  const removeLast = useCallback((key: RestrictionKey) => {
    setDraft((prev) => ({ ...prev, [key]: prev[key].slice(0, -1) }));
  }, []);

  const toggleSuggestion = useCallback((key: RestrictionKey, label: string) => {
    setDraft((prev) => {
      const exists = prev[key].some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase());
      return {
        ...prev,
        [key]: exists
          ? prev[key].filter((item) => item.toLocaleLowerCase() !== label.toLocaleLowerCase())
          : mergeUnique(prev[key], [label]),
      };
    });
  }, []);

  const applyQuickAction = useCallback((action: QuickAction) => {
    setDraft((prev) => {
      if (action.clear) return createEmptyDraft();
      const next: RestrictionsDraft = {
        dietaryPreferences: [...prev.dietaryPreferences],
        allergies: [...prev.allergies],
        intolerances: [...prev.intolerances],
        forbiddenFoods: [...prev.forbiddenFoods],
        dislikedFoods: [...prev.dislikedFoods],
      };
      LIST_KEYS.forEach((key) => {
        const incoming = action.patch?.[key];
        if (incoming && incoming.length > 0) {
          next[key] = mergeUnique(next[key], incoming);
        }
      });
      return next;
    });
  }, []);

  const requestClearAll = useCallback(() => {
    if (!hasAny) return;
    const clear = () => setDraft(createEmptyDraft());
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('¿Limpiar todas las restricciones alimentarias?')) {
        clear();
      }
      return;
    }
    Alert.alert(
      'Limpiar restricciones',
      'Se eliminarán alergias, intolerancias, alimentos bloqueados y preferencias guardadas en esta pantalla.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Limpiar', style: 'destructive', onPress: clear },
      ],
    );
  }, [hasAny]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<FoodRestrictions>('/api/v1/me/food-restrictions', {
        dietary_preferences: draft.dietaryPreferences,
        allergies: draft.allergies,
        intolerances: draft.intolerances,
        forbidden_foods: draft.forbiddenFoods,
        disliked_foods: draft.dislikedFoods,
      }),
    onSuccess: (saved) => {
      const next = draftFromResponse(saved);
      queryClient.setQueryData(['food-restrictions'], saved);
      queryClient.invalidateQueries({ queryKey: ['food-restrictions'] });
      setDraft(next);
      setSavedSnapshot(snapshotDraft(next));
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert('Restricciones actualizadas');
        router.back();
      } else {
        Alert.alert('Guardado', 'Restricciones alimentarias actualizadas.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar. Inténtalo de nuevo.';
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(`Error: ${msg}`);
      } else {
        Alert.alert('Error', msg);
      }
    },
  });

  if (isLoading && !initialized) return <LoadingScreen />;

  const stickyBottom = Math.max(insets.bottom, spacing.md);
  const saveDisabled = saveMutation.isPending || !isDirty;

  return (
    <View style={s.root}>
      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingBottom: stickyBottom + 112 }]}
        keyboardShouldPersistTaps="handled"
      >
        <SlideUpView delay={50} duration={440} distance={18}>
          <Surface variant="floating" padding="xl" style={s.heroCard}>
            <View style={s.heroTopRow}>
              <View style={s.heroIconWrap}>
                <Ionicons name="nutrition-outline" size={25} color={colors.primaryLight} />
              </View>
              <View style={s.heroCopy}>
                <Text style={s.heroKicker}>Perfil nutricional</Text>
                <Text style={s.heroTitle}>Restricciones alimentarias</Text>
              </View>
            </View>
            <Text style={s.heroBody}>
              Configura qué debe evitar la app y qué estilo prefieres. Las alergias,
              intolerancias y bloqueos se tratan como prioridad al generar planes con IA.
            </Text>

            <View style={s.heroStatsRow}>
              <View
                accessible
                accessibilityLabel={`${strictCount} restricciones críticas`}
                style={s.heroStatItem}
              >
                <Text style={[s.heroStatValue, strictCount > 0 && { color: colors.error }]}>{strictCount}</Text>
                <Text style={s.heroStatLabel}>Críticas</Text>
              </View>
              <View style={s.heroStatDivider} />
              <View
                accessible
                accessibilityLabel={`${preferenceCount} preferencias de estilo alimentario`}
                style={s.heroStatItem}
              >
                <Text style={s.heroStatValue}>{preferenceCount}</Text>
                <Text style={s.heroStatLabel}>Estilo</Text>
              </View>
              <View style={s.heroStatDivider} />
              <View
                accessible
                accessibilityLabel={`${softCount} alimentos flexibles a evitar`}
                style={s.heroStatItem}
              >
                <Text style={s.heroStatValue}>{softCount}</Text>
                <Text style={s.heroStatLabel}>Flexibles</Text>
              </View>
            </View>
          </Surface>
        </SlideUpView>

        {isError ? (
          <View accessibilityRole="alert" style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={s.errorText}>
              {error instanceof Error ? error.message : 'No se pudieron cargar las restricciones guardadas.'}
            </Text>
          </View>
        ) : null}

        <SlideUpView delay={130} duration={460} distance={18}>
          <Surface variant="subtle" padding="lg" style={s.quickPanel}>
            <View style={s.panelHeaderRow}>
              <View style={s.panelHeaderCopy}>
                <Text style={s.panelEyebrow}>Atajos rápidos</Text>
                <Text style={s.panelTitle}>Empieza con una plantilla</Text>
                <Text style={s.panelHelper}>
                  Toca un atajo para añadir restricciones comunes. Después puedes ajustar cada chip.
                </Text>
              </View>
              {hasAny ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={requestClearAll}
                  style={s.clearButton}
                  accessibilityRole="button"
                  accessibilityLabel="Limpiar todas las restricciones alimentarias"
                  accessibilityHint="Abre una confirmación antes de borrar las listas"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.error} />
                  <Text style={s.clearButtonText}>Limpiar</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={s.quickGrid}>
              {QUICK_ACTIONS.map((action) => (
                <QuickActionCard
                  key={action.title}
                  action={action}
                  selected={actionIncludesAll(action, draft, hasAny)}
                  onPress={() => applyQuickAction(action)}
                />
              ))}
            </View>
          </Surface>
        </SlideUpView>

        <SlideUpView delay={200} duration={460} distance={18}>
          <View
            accessible
            accessibilityLabel="Prioridad. Alergias, intolerancias y no incluir nunca bloquean alimentos. Prefiero evitar solo orienta a la IA."
            style={s.legendCard}
          >
            <View style={s.legendIcon}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primaryLight} />
            </View>
            <Text style={s.legendText}>
              <Text style={s.legendStrong}>Prioridad:</Text> alergias, intolerancias y “no incluir nunca” bloquean alimentos. “Prefiero evitar” solo orienta a la IA.
            </Text>
          </View>
        </SlideUpView>

        <View style={s.sectionsToolbar}>
          <Text style={s.sectionsToolbarTitle}>Listas detalladas</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={toggleAllSections}
            accessibilityRole="button"
            accessibilityLabel={allExpanded ? 'Colapsar todas las secciones' : 'Expandir todas las secciones'}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={s.toolbarToggle}
          >
            <Ionicons
              name={allExpanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.primaryLight}
            />
            <Text style={s.toolbarToggleText}>
              {allExpanded ? 'Colapsar todo' : 'Expandir todo'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={s.sectionsStack}>
          {SECTIONS.map((section, index) => (
            <SlideUpView key={section.key} delay={260 + index * 55} duration={480} distance={18}>
              <RestrictionCard
                section={section}
                items={draft[section.key]}
                expanded={expandedSections[section.key]}
                onToggleExpanded={() => toggleSectionExpanded(section.key)}
                onAdd={addToList}
                onToggleSuggestion={toggleSuggestion}
                onRemove={removeAt}
                onRemoveLast={removeLast}
              />
            </SlideUpView>
          ))}
        </View>

        {!hasAny ? (
          <Surface variant="plain" style={s.emptySummary}>
            <Ionicons name="checkmark-circle-outline" size={20} color={colors.primaryLight} />
            <Text accessibilityLiveRegion="polite" style={s.emptySummaryText}>
              No tienes restricciones activas. Puedes guardar así o añadir solo lo importante.
            </Text>
          </Surface>
        ) : (
          <Surface variant="plain" style={s.summaryPanel}>
            <Text accessibilityLiveRegion="polite" style={s.summaryText}>
              Resumen: {friendlyCount(strictCount, 'restricción crítica', 'restricciones críticas')}, {friendlyCount(preferenceCount, 'preferencia', 'preferencias')} y {friendlyCount(softCount, 'evitación flexible', 'evitaciones flexibles')}.
            </Text>
          </Surface>
        )}
      </ScrollView>

      <View style={[s.saveBar, { paddingBottom: stickyBottom }]}>
        <Text
          accessibilityLiveRegion="polite"
          style={[s.saveHint, isDirty && s.saveHintDirty]}
        >
          {isDirty ? 'Hay cambios sin guardar' : 'Preferencias sincronizadas'}
        </Text>
        <UIButton
          variant="primary"
          title={
            saveMutation.isPending
              ? 'Guardando...'
              : isDirty
                ? 'Guardar preferencias'
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
  content: {
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  heroCard: { gap: spacing.lg, overflow: 'hidden' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
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
  heroStatLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroStatDivider: { width: hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },

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

  quickPanel: { gap: spacing.md },
  panelHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  panelHeaderCopy: { flex: 1, minWidth: 0 },
  panelEyebrow: {
    ...typography.micro,
    color: colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  panelTitle: { ...typography.bodyBold, color: colors.text },
  panelHelper: { ...typography.caption, color: colors.textMuted, lineHeight: 18, marginTop: 2 },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.errorMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.errorBorder,
  },
  clearButtonText: { ...typography.small, color: colors.error, fontWeight: '700' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickAction: {
    width: '48%',
    minWidth: 145,
    flexGrow: 1,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  quickActionSelected: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryGlowSoft,
  },
  quickIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
  },
  quickIconSelected: {
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  quickCopy: { flex: 1, minWidth: 0 },
  quickTitle: { ...typography.captionBold, color: colors.text },
  quickSubtitle: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  quickAppliedBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  quickAppliedText: { ...typography.micro, color: colors.primaryLight, fontWeight: '700' },

  legendCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryMuted,
  },
  legendIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryGlowSoft,
  },
  legendText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 19 },
  legendStrong: { color: colors.text, fontWeight: '700' },

  sectionsToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xs,
  },
  sectionsToolbarTitle: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  toolbarToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  toolbarToggleText: {
    ...typography.micro,
    color: colors.primaryLight,
    fontWeight: '700',
  },

  sectionsStack: { gap: spacing.md },
  restrictionCard: {
    gap: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 0,
  },
  cardBody: { gap: spacing.md },
  collapsedSummary: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: -spacing.xs,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerRightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  sectionEyebrow: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
    minWidth: 0,
  },
  modePill: {
    ...typography.micro,
    overflow: 'hidden',
    borderRadius: borderRadius.full,
    borderWidth: hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    fontWeight: '700',
    flexShrink: 0,
    alignSelf: 'center',
  },
  countPill: {
    ...typography.small,
    overflow: 'hidden',
    minWidth: 28,
    textAlign: 'center',
    borderRadius: borderRadius.full,
    borderWidth: hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  sectionTitle: { ...typography.sectionTitle, color: colors.text, flex: 1, minWidth: 0 },
  sectionDescription: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: spacing.xs,
    paddingBottom: Platform.OS === 'android' ? 1 : 0,
  },
  suggestionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: -spacing.xs,
  },
  subLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  selectionStatus: { ...typography.small, color: colors.textTertiary, fontWeight: '700' },
  suggestionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  suggestionChipSelected: {
    transform: [{ translateY: -1 }],
  },
  suggestionText: { ...typography.caption, color: colors.textSecondary },

  tagField: {
    borderWidth: hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  selectedTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  selectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: hairlineWidth,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  selectedTagText: { ...typography.captionBold },
  tagInput: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    minWidth: 130,
    paddingVertical: spacing.xs,
  },
  emptyHint: { ...typography.small, color: colors.textTertiary, marginTop: spacing.xs },

  emptySummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  emptySummaryText: { ...typography.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },
  summaryPanel: { padding: spacing.md },
  summaryText: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },

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
  saveHint: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  saveHintDirty: { color: colors.primaryLight, fontWeight: '700' },
  saveBtn: { width: '100%' },
});
