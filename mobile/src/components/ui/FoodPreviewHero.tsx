import React from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MealEntry } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../theme';
import {
  mealItemVisualIconForLookupName,
  mealItemDisplayPartsForUi,
  stripLeadingMealIconFromTitle,
  mealLeadingVisual,
} from '../../lib/mealDisplay';
import { MealItemIconMedia } from './MealItemIconMedia';

const HERO = { full: 88, compact: 72 } as const;
const EMOJI = { full: 38, compact: 30 } as const;

export type FoodPreviewHeroVariant = 'catalog' | 'diary_food' | 'diary_meal';

export type FoodPreviewHeroProps = {
  imageUri?: string | null;
  nameRaw?: string;
  meal?: MealEntry;
  variant: FoodPreviewHeroVariant;
  /** Fila: icono izquierda, textos derecha (menos altura vertical). */
  compact?: boolean;
  /** Menos margen vertical (p. ej. «Resumen» justo debajo en un sheet). */
  tightLayout?: boolean;
  overline?: string;
  title?: string;
  titleElement?: React.ReactNode;
  subtitle?: string;
  /** Sustituye al texto de `subtitle` (p. ej. cantidad editable en el héroe). */
  subtitleElement?: React.ReactNode;
};

/** Tarjeta tipo icono de app: imagen o emoji, check solo en catálogo. */
export function FoodPreviewHero({
  imageUri,
  nameRaw,
  meal,
  variant,
  compact,
  tightLayout,
  overline,
  title,
  titleElement,
  subtitle,
  subtitleElement,
}: FoodPreviewHeroProps) {
  const showVerified = variant === 'catalog';

  const size: 'full' | 'compact' =
    compact && (overline || title || subtitle || titleElement || subtitleElement) ? 'compact' : 'full';
  const dim = HERO[size];
  const emojiSize = EMOJI[size];
  const cardRadius = size === 'compact' ? borderRadius.lg : 20;
  const innerRadius = size === 'compact' ? borderRadius.lg - 1 : 19;

  let body: React.ReactNode;
  if (imageUri) {
    body = <Image source={{ uri: imageUri }} style={styles.heroImage} resizeMode="contain" />;
  } else if (meal) {
    const heroVisual = mealLeadingVisual(meal);
    body = (
      <View style={styles.heroEmojiInset}>
        <MealItemIconMedia
          visual={heroVisual}
          emojiStyle={[styles.heroEmoji, { fontSize: emojiSize, lineHeight: emojiSize + 6 }]}
          imageSize={Math.round(emojiSize * 1.85)}
        />
      </View>
    );
  } else {
    const raw = (nameRaw || 'Alimento').trim() || 'Alimento';
    const { icon } = stripLeadingMealIconFromTitle(raw);
    const { title: parsedTitle } = mealItemDisplayPartsForUi(raw);
    const nameVisual = icon ? { kind: 'emoji' as const, emoji: icon } : mealItemVisualIconForLookupName(parsedTitle);
    body = (
      <View style={styles.heroEmojiInset}>
        <MealItemIconMedia
          visual={nameVisual}
          emojiStyle={[styles.heroEmoji, { fontSize: emojiSize, lineHeight: emojiSize + 6 }]}
          imageSize={Math.round(emojiSize * 1.85)}
        />
      </View>
    );
  }

  const cardShell = (
    <View
      style={[
        styles.heroCard,
        { width: dim, height: dim, borderRadius: cardRadius },
      ]}
    >
      <View style={[styles.heroCardClip, { borderRadius: innerRadius }]}>
        {body}
      </View>
    </View>
  );

  const badge =
    showVerified && size === 'full' ? (
      <View style={[styles.badgeWrap, { pointerEvents: 'none' }]}>
        <View style={styles.badge}>
          <Ionicons name="checkmark" size={12} color="#0a0a0a" />
        </View>
      </View>
    ) : showVerified && size === 'compact' ? (
      <View style={[styles.badgeWrapCompact, { pointerEvents: 'none' }]}>
        <View style={styles.badgeCompact}>
          <Ionicons name="checkmark" size={10} color="#0a0a0a" />
        </View>
      </View>
    ) : null;

  if (size === 'compact') {
    return (
      <View style={[styles.compactRow, tightLayout && styles.compactRowTight]}>
        <View style={styles.compactHeroWrap}>
          {cardShell}
          {badge}
        </View>
        <View style={styles.compactTextCol}>
          {overline ? (
            <Text
              style={[styles.compactOverline, tightLayout && styles.compactOverlineTight]}
              numberOfLines={1}
            >
              {overline}
            </Text>
          ) : null}
          {titleElement ? (
            <View style={styles.compactTitleSlot}>{titleElement}</View>
          ) : title ? (
            <Text style={styles.compactTitle} numberOfLines={3}>
              {title}
            </Text>
          ) : null}
          {subtitleElement ? (
            <View style={styles.compactSubtitleSlot}>{subtitleElement}</View>
          ) : subtitle ? (
            <Text style={styles.compactSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.heroOuter}>
      {cardShell}
      {badge}
    </View>
  );
}

const styles = StyleSheet.create({
  heroOuter: {
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    position: 'relative',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'stretch',
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  compactRowTight: {
    marginTop: 0,
    marginBottom: spacing.xs,
  },
  compactHeroWrap: {
    position: 'relative',
  },
  compactTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  compactOverline: {
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  compactOverlineTight: {
    marginBottom: 3,
  },
  compactTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  compactTitleSlot: {
    width: '100%',
    marginBottom: 2,
  },
  compactSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  compactSubtitleSlot: {
    marginTop: 2,
    width: '100%' as unknown as number,
  },
  heroCard: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...Platform.select({
      web: { boxShadow: '0 8px 28px rgba(0,0,0,0.4)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16 },
      android: { elevation: 10 },
      default: { boxShadow: '0 8px 28px rgba(0,0,0,0.4)' },
    }),
  },
  heroCardClip: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  heroImage: {
    width: '82%' as unknown as number,
    height: '82%' as unknown as number,
  },
  heroEmojiInset: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  heroEmoji: {
    fontSize: 38,
    lineHeight: 44,
    textAlign: 'center' as const,
  },
  badgeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -2,
    alignItems: 'center',
    zIndex: 2,
  },
  badgeWrapCompact: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    zIndex: 2,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceElevated,
  },
  badgeCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surfaceElevated,
  },
});
