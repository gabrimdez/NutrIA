import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Surface } from './Surface';
import { colors, spacing, typography } from '../../theme';
import { roundMacroG } from '../../lib/mealItemMath';

const BAR_H = 8;
const LEGEND_MARKER_W = 48;
const LEGEND_MARKER_W_COMPACT = 42;
const LEGEND_MARKER_GAP = 2;

/** Kcal aportadas por cada macro (Atwater) — útil si se quiere ponderar por energía. */
export function macroEnergyFromGrams(proteinG: number, carbsG: number, fatG: number) {
  const p = Math.max(0, 4 * proteinG);
  const c = Math.max(0, 4 * carbsG);
  const f = Math.max(0, 9 * fatG);
  const t = p + c + f;
  return { p, c, f, t };
}

/** Gramos de cada macro — base de la barra segmentada (100% = P+C+G en peso). */
export function macroGramParts(proteinG: number, carbsG: number, fatG: number) {
  const p = Math.max(0, proteinG);
  const c = Math.max(0, carbsG);
  const f = Math.max(0, fatG);
  const t = p + c + f;
  return { p, c, f, t };
}

type MacroCardProps = {
  value: string;
  label: string;
  color: string;
  compact?: boolean;
};

function MacroCard({ value, label, color, compact }: MacroCardProps) {
  return (
    <Surface variant="elevated" style={[styles.macroCard, compact && styles.macroCardCompact]} padding={compact ? 'xs' : 'sm'}>
      <View style={styles.macroCardInner}>
        <Text style={[styles.macroValue, compact && styles.macroValueCompact, { color }]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={[styles.macroLabel, compact && styles.macroLabelCompact]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Surface>
  );
}

export function MacroSummaryCardsRow({
  kcal,
  proteinG,
  carbsG,
  fatG,
  style,
  compact,
}: {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  return (
    <View style={[styles.cardsRow, compact && styles.cardsRowCompact, style]}>
      <MacroCard compact={compact} value={String(Math.round(kcal))} label="KCAL" color={colors.calories} />
      <MacroCard compact={compact} value={`${roundMacroG(proteinG)}g`} label="PROT" color={colors.protein} />
      <MacroCard compact={compact} value={`${roundMacroG(carbsG)}g`} label="CARBS" color={colors.carbs} />
      <MacroCard compact={compact} value={`${roundMacroG(fatG)}g`} label="GRASA" color={colors.fat} />
    </View>
  );
}

type MacroEnergySplitBarProps = {
  proteinG: number;
  carbsG: number;
  fatG: number;
  style?: StyleProp<ViewStyle>;
  /** Por defecto `grams`: ancho proporcional a gramos P+C+G. */
  basis?: 'grams' | 'energy';
  /**
   * Si es true, una fila P / gramos / g encima de cada tramo (misma proporción que la barra).
   * Por defecto false (p. ej. fila de edición en foto de comida).
   */
  showLegend?: boolean;
  compact?: boolean;
};

function MacroLegendMarker({
  left,
  width,
  letter,
  grams,
  color,
}: {
  left: number;
  width: number;
  letter: string;
  grams: number;
  color: string;
}) {
  return (
    <View
      style={[styles.legendMarker, { left, width, pointerEvents: 'none' }]}
      accessibilityLabel={`${letter} ${roundMacroG(grams)} gramos`}
    >
      <View style={styles.legendInner}>
        <Text style={[styles.legendLetter, { color }]} numberOfLines={1}>
          {letter}
        </Text>
        <Text style={[styles.legendValue, { color, borderBottomColor: color }]} numberOfLines={1}>
          {roundMacroG(grams)}
        </Text>
        <Text style={[styles.legendUnit, { color }]} numberOfLines={1}>
          g
        </Text>
      </View>
    </View>
  );
}

export function MacroEnergySplitBar({
  proteinG,
  carbsG,
  fatG,
  style,
  basis = 'grams',
  showLegend = false,
  compact = false,
}: MacroEnergySplitBarProps) {
  const [legendWidth, setLegendWidth] = React.useState(0);
  const parts = basis === 'energy' ? macroEnergyFromGrams(proteinG, carbsG, fatG) : macroGramParts(proteinG, carbsG, fatG);
  const { p, c, f, t } = parts;
  const barH = compact ? 6 : BAR_H;
  const legendMarkerW = compact ? LEGEND_MARKER_W_COMPACT : LEGEND_MARKER_W;

  const legendItems = React.useMemo(() => {
    if (t <= 0) return [];

    let cursor = 0;
    return [
      { part: p, letter: 'P', grams: proteinG, color: colors.protein },
      { part: c, letter: 'C', grams: carbsG, color: colors.carbs },
      { part: f, letter: 'G', grams: fatG, color: colors.fat },
    ]
      .filter((item) => item.part > 0)
      .map((item) => {
        const start = cursor;
        cursor += item.part;
        return {
          ...item,
          centerShare: (start + item.part / 2) / t,
        };
      });
  }, [carbsG, c, fatG, f, proteinG, p, t]);

  const positionedLegendItems = React.useMemo(() => {
    if (legendWidth <= 0) return [];

    const maxLeft = Math.max(0, legendWidth - legendMarkerW);
    const positioned = legendItems.map((item) => ({
      ...item,
      left: Math.max(0, Math.min(maxLeft, item.centerShare * legendWidth - legendMarkerW / 2)),
    }));

    const minimumNeededWidth =
      positioned.length * legendMarkerW + Math.max(0, positioned.length - 1) * LEGEND_MARKER_GAP;

    if (positioned.length > 1 && minimumNeededWidth <= legendWidth) {
      for (let i = 1; i < positioned.length; i += 1) {
        positioned[i].left = Math.max(positioned[i].left, positioned[i - 1].left + legendMarkerW + LEGEND_MARKER_GAP);
      }

      const overflow = Math.max(0, positioned[positioned.length - 1].left - maxLeft);
      if (overflow > 0) {
        for (const item of positioned) item.left -= overflow;
      }

      positioned[0].left = Math.max(0, positioned[0].left);
      for (let i = 1; i < positioned.length; i += 1) {
        positioned[i].left = Math.max(positioned[i].left, positioned[i - 1].left + legendMarkerW + LEGEND_MARKER_GAP);
      }
      for (let i = positioned.length - 2; i >= 0; i -= 1) {
        positioned[i].left = Math.min(positioned[i].left, positioned[i + 1].left - legendMarkerW - LEGEND_MARKER_GAP);
      }
      for (const item of positioned) {
        item.left = Math.max(0, Math.min(maxLeft, item.left));
      }
    }

    return positioned;
  }, [legendItems, legendMarkerW, legendWidth]);

  return (
    <View style={[styles.splitBarWrap, compact && styles.splitBarWrapCompact, style]}>
      {showLegend && t > 0 ? (
        <View
          style={[styles.legendRow, compact && styles.legendRowCompact]}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            setLegendWidth((prev) => (Math.abs(prev - width) < 1 ? prev : width));
          }}
        >
          {legendWidth > 0
            ? positionedLegendItems.map((item) => {
                return (
                  <MacroLegendMarker
                    key={item.letter}
                    left={item.left}
                    width={legendMarkerW}
                    letter={item.letter}
                    grams={item.grams}
                    color={item.color}
                  />
                );
              })
            : null}
        </View>
      ) : null}
      {showLegend && t <= 0 ? (
        <Text style={styles.legendEmpty}>Sin datos de macros</Text>
      ) : null}

      {t <= 0 ? (
        <View style={[styles.splitBarTrack, { height: barH, borderRadius: barH / 2 }]} />
      ) : (
        <View style={[styles.splitBarTrack, { height: barH, borderRadius: barH / 2 }]}>
          {p > 0 && <View style={[styles.splitSeg, { flex: p, height: barH, backgroundColor: colors.protein }]} />}
          {c > 0 && <View style={[styles.splitSeg, { flex: c, height: barH, backgroundColor: colors.carbs }]} />}
          {f > 0 && <View style={[styles.splitSeg, { flex: f, height: barH, backgroundColor: colors.fat }]} />}
        </View>
      )}
    </View>
  );
}

/** Título «Resumen», fila de recuadros y barra P/C/G proporcional a gramos. */
export function MacroSummarySection({
  kcal,
  proteinG,
  carbsG,
  fatG,
  caption,
  style,
  compact,
}: {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  caption?: string;
  style?: StyleProp<ViewStyle>;
  /** Menos márgenes y tarjetas más bajas (vista previa en sheet). */
  compact?: boolean;
}) {
  return (
    <View style={[styles.section, compact && styles.sectionCompact, style]}>
      <Text style={[styles.sectionLabel, compact && styles.sectionLabelCompact]}>Resumen</Text>
      {caption ? (
        <Text style={[styles.sectionCaption, compact && styles.sectionCaptionCompact]}>{caption}</Text>
      ) : null}
      <MacroSummaryCardsRow
        kcal={kcal}
        proteinG={proteinG}
        carbsG={carbsG}
        fatG={fatG}
        compact={compact}
      />
      <MacroEnergySplitBar
        proteinG={proteinG}
        carbsG={carbsG}
        fatG={fatG}
        showLegend
        compact={compact}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignSelf: 'stretch',
    width: '100%' as unknown as number,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.captionBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  sectionCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  macroCard: { flex: 1, minWidth: 0, minHeight: 64, alignSelf: 'stretch' },
  macroCardInner: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  macroValue: { ...typography.bodyBold, fontSize: 18, marginBottom: 3, maxWidth: '100%', textAlign: 'center' },
  macroLabel: { ...typography.caption, color: colors.textMuted, fontSize: 10, letterSpacing: 0.5, textAlign: 'center' },
  legendRow: {
    flexDirection: 'row',
    width: '100%' as unknown as number,
    marginBottom: spacing.sm,
    minHeight: 22,
    position: 'relative',
    overflow: 'visible',
  },
  legendMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  legendInner: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    gap: 3,
    paddingHorizontal: 2,
    overflow: 'visible',
  },
  legendLetter: {
    ...typography.captionBold,
    fontSize: 12,
  },
  legendValue: {
    ...typography.captionBold,
    fontSize: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 1,
  },
  legendUnit: {
    ...typography.caption,
    fontSize: 11,
    opacity: 0.55,
  },
  legendEmpty: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  splitBarWrap: {
    width: '100%' as unknown as number,
    marginTop: 2,
  },
  splitBarTrack: {
    height: BAR_H,
    borderRadius: BAR_H / 2,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  splitSeg: { minWidth: 3 },
  sectionCompact: {
    marginBottom: spacing.sm,
  },
  sectionLabelCompact: {
    marginBottom: spacing.xs,
    fontSize: 10,
    letterSpacing: 1,
  },
  sectionCaptionCompact: {
    marginBottom: spacing.xs,
    fontSize: 12,
    lineHeight: 16,
  },
  cardsRowCompact: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  macroCardCompact: {
    minHeight: 56,
  },
  macroValueCompact: {
    fontSize: 16,
    marginBottom: 2,
  },
  macroLabelCompact: {
    fontSize: 9,
  },
  splitBarWrapCompact: {
    marginTop: 0,
  },
  legendRowCompact: {
    marginBottom: spacing.xs,
    minHeight: 18,
  },
});
