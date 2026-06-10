import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing } from '../theme';

/** Imágenes idle por tier. */
const TIER_IDLE_IMAGES: Record<string, ReturnType<typeof require>> = {
  cold:      require('../../assets/images/streak/nutria-baby.png'),
  warm:      require('../../assets/images/streak/nutria-baby.png'),
  hot:       require('../../assets/images/streak/nutria-adventurer.png'),
  fire:      require('../../assets/images/streak/nutria-mascot-idle.png'),
  legendary: require('../../assets/images/streak/nutria-legendary-new.png'),
};
/** Escala de la imagen idle por tier (el PNG superhéroe tiene mucho canvas vacío; otros llenan más). */
const TIER_IDLE_SCALE: Record<string, number> = {
  cold:      2.0,
  warm:      2.0,
  hot:       0.82,
  fire:      0.36,
  legendary: 0.80,
};
/**
 * Misma pieza que `docs/gifs/download.gif` (sincronizada a assets para Metro).
 * Reemplaza `mobile/assets/images/streak/download.gif` con una copia de `docs` si actualizas el origen.
 */
const STREAK_MASCOT_GIF = require('../../assets/images/streak/download.gif');
/**
 * Duración de una vuelta completa del GIF (mismo asset: ~153 frames).
 * Si cambias `download.gif`, recalcula: p. ej. Python + Pillow recorriendo `im.seek`.
 * Tras un toque el GIF se muestra exactamente un ciclo y luego vuelve al PNG.
 */
const MASCOT_GIF_PLAY_MS = 5100;
/** Al reproducir el GIF, el bloque se amplía respecto al tamaño de reposo para que se vea más grande. */
const MASCOT_GIF_DISPLAY_SCALE = 1.28;

/** Tamaño máximo de la mascota en el modal (ancho = alto). */
const STREAK_MASCOT_LAYOUT = {
  size: 430,
} as const;

type StreakTier = 'cold' | 'warm' | 'hot' | 'fire' | 'legendary';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  streakDays: number;
  streakTier: StreakTier;
};

const MILESTONES = [
  { days: 3, label: '3 días seguidos', description: 'Nutria despierta' },
  { days: 7, label: '7 días seguidos', description: 'Nutria aventurera' },
  { days: 14, label: '14 días seguidos', description: 'Nutria heroica' },
  { days: 21, label: '21 días seguidos', description: 'Nutria legendaria' },
] as const;

const TIER_CONFIG: Record<
  StreakTier,
  {
    name: string;
    nextTierDays: number | null;
    /** Número grande y acentos fuertes */
    accentColor: string;
    /** Segundo tono para degradados (barra, sombras) */
    accentSecondary: string;
    /** Acento en bordes (bocadillo, progreso, hitos) */
    ringColor: string;
    /** Velo superior (esquina) sobre el fondo */
    accentWash: string;
    /** Fondo vertical: arriba tintado → centro app → abajo ligeramente más claro */
    ambient: readonly [string, string, string];
    /** Degradado de la barra de progreso */
    progressGradient: readonly [string, string];
  }
> = {
  cold: {
    name: 'Nutria bebé',
    nextTierDays: 3,
    accentColor: '#5EEAD4',
    accentSecondary: '#2DD4BF',
    ringColor: 'rgba(94, 234, 212, 0.38)',
    accentWash: 'rgba(45, 212, 191, 0.12)',
    ambient: ['#0c1614', colors.background, '#0e1418'] as const,
    progressGradient: ['#5EEAD4', '#14B8A6'] as const,
  },
  warm: {
    name: 'Nutria despierta',
    nextTierDays: 7,
    accentColor: '#FBBF24',
    accentSecondary: '#F59E0B',
    ringColor: 'rgba(251, 191, 36, 0.42)',
    accentWash: 'rgba(245, 158, 11, 0.14)',
    ambient: ['#16120c', colors.background, '#141008'] as const,
    progressGradient: ['#FCD34D', '#D97706'] as const,
  },
  hot: {
    name: 'Nutria aventurera',
    nextTierDays: 14,
    accentColor: '#FB923C',
    accentSecondary: '#EA580C',
    ringColor: 'rgba(251, 146, 60, 0.45)',
    accentWash: 'rgba(249, 115, 22, 0.12)',
    ambient: ['#160f0c', colors.background, '#120d0a'] as const,
    progressGradient: ['#FDBA74', '#EA580C'] as const,
  },
  fire: {
    name: 'Nutria heroica',
    nextTierDays: 21,
    accentColor: '#FB7185',
    accentSecondary: '#EF4444',
    ringColor: 'rgba(251, 113, 133, 0.45)',
    accentWash: 'rgba(239, 68, 68, 0.12)',
    ambient: ['#160c0d', colors.background, '#140a0c'] as const,
    progressGradient: ['#FDA4AF', '#DC2626'] as const,
  },
  legendary: {
    name: 'Nutria legendaria',
    nextTierDays: null,
    accentColor: '#E9D5FF',
    accentSecondary: '#C084FC',
    ringColor: 'rgba(232, 121, 249, 0.5)',
    accentWash: 'rgba(167, 139, 250, 0.14)',
    ambient: ['#110f16', colors.background, '#0f0d14'] as const,
    progressGradient: ['#E879F9', '#7C3AED'] as const,
  },
};

function getTierStart(tier: StreakTier): number {
  switch (tier) {
    case 'cold': return 0;
    case 'warm': return 3;
    case 'hot': return 7;
    case 'fire': return 14;
    case 'legendary': return 21;
  }
}

export function StreakModal({ visible, onDismiss, streakDays, streakTier }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const config = TIER_CONFIG[streakTier];

  const tierStart = getTierStart(streakTier);
  const nextDays = config.nextTierDays;
  const progressFraction = nextDays
    ? Math.min((streakDays - tierStart) / (nextDays - tierStart), 1)
    : 1;
  const pointsText = nextDays
    ? `${nextDays - streakDays} días para la siguiente evolución`
    : '¡Nivel máximo alcanzado!';

  const [isTapped, setIsTapped] = useState(false);
  const [playMascotGif, setPlayMascotGif] = useState(false);
  const [mascotGifKey, setMascotGifKey] = useState(0);
  const mascotGifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gifOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      if (mascotGifTimeoutRef.current) {
        clearTimeout(mascotGifTimeoutRef.current);
        mascotGifTimeoutRef.current = null;
      }
      setPlayMascotGif(false);
      setIsTapped(false);
    }
  }, [visible]);

  useEffect(
    () => () => {
      if (mascotGifTimeoutRef.current) {
        clearTimeout(mascotGifTimeoutRef.current);
      }
    },
    [],
  );

  /** Alto del bloque cabecera (cerrar + título + número de racha). */
  const headerBlockHeight =
    Math.max(insets.top, spacing.md) + spacing.sm + 78 + spacing.sm;
  /** Espacio realmente disponible para el contenido scrollable. */
  const availableHeight = Math.max(
    0,
    windowHeight - headerBlockHeight - Math.max(insets.bottom, 20) - 20,
  );
  /** Mascota: ocupa ~50% del alto disponible, acotada entre 180 y el tamaño base. */
  const mascotSize = Math.round(
    Math.max(180, Math.min(STREAK_MASCOT_LAYOUT.size, availableHeight * 0.5)),
  );
  /** Mientras el GIF está en pantalla, se usa un bloque más ancho (sin salirse del ancho útil). */
  const maxMascotByWidth = Math.max(0, windowWidth - spacing.xl * 2 - 8);
  const mascotBlockSize = Math.min(Math.round(mascotSize * MASCOT_GIF_DISPLAY_SCALE), maxMascotByWidth);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <LinearGradient
          colors={[...config.ambient]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        <LinearGradient
          colors={[config.accentWash, 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.2, y: 0.55 }}
        />

        <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.md) + spacing.sm }]}>
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Días de racha</Text>
            <Text
              style={[
                styles.headerDays,
                { color: config.accentColor, textShadowColor: config.accentWash, textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 } },
              ]}
            >
              {streakDays}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              minHeight: availableHeight,
              paddingBottom: Math.max(insets.bottom, 20) + 20,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Mascota: PNG en reposo; al pulsar se muestra el GIF unos segundos */}
          <View style={styles.mascotSection}>
            <Pressable
              onPress={() => {
                setIsTapped(true);
                setTimeout(() => setIsTapped(false), 1200);

                // El GIF de superhéroe solo se reproduce en el tier 'fire'
                if (streakTier !== 'fire') return;

                if (mascotGifTimeoutRef.current) {
                  clearTimeout(mascotGifTimeoutRef.current);
                  mascotGifTimeoutRef.current = null;
                }

                const FADE_MS = 120;

                const fadeInGif = () => {
                  gifOpacity.setValue(0);
                  Animated.timing(gifOpacity, {
                    toValue: 1,
                    duration: FADE_MS,
                    useNativeDriver: true,
                  }).start();
                };

                const fadeOutGif = (onDone: () => void) => {
                  Animated.timing(gifOpacity, {
                    toValue: 0,
                    duration: FADE_MS,
                    useNativeDriver: true,
                  }).start(({ finished }) => { if (finished) onDone(); });
                };

                const scheduleEnd = () => {
                  mascotGifTimeoutRef.current = setTimeout(() => {
                    fadeOutGif(() => {
                      setPlayMascotGif(false);
                      mascotGifTimeoutRef.current = null;
                    });
                  }, MASCOT_GIF_PLAY_MS);
                };

                const startFromFrameZero = () => {
                  setMascotGifKey((k) => k + 1);
                  setPlayMascotGif(true);
                  fadeInGif();
                  scheduleEnd();
                };

                if (playMascotGif) {
                  fadeOutGif(() => {
                    setPlayMascotGif(false);
                    setTimeout(startFromFrameZero, 0);
                  });
                } else {
                  startFromFrameZero();
                }
              }}
              style={[
                styles.mascotHit,
                {
                  width: mascotBlockSize,
                  height: mascotBlockSize,
                  alignSelf: 'center',
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Tocar mascota"
            >
              {/* PNG idle — opacidad inversa al GIF */}
              <Animated.Image
                source={TIER_IDLE_IMAGES[streakTier] ?? TIER_IDLE_IMAGES.warm}
                style={[
                  styles.mascotImg,
                  {
                    transform: [{ scale: TIER_IDLE_SCALE[streakTier] ?? 0.8 }],
                    opacity: Animated.subtract(1, gifOpacity),
                  },
                ]}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
                accessibilityRole="image"
                accessibilityLabel="Nutria mascota"
              />
              {/* GIF encima con fade */}
              {playMascotGif && (
                <Animated.Image
                  key={`mascot-gif-${mascotGifKey}`}
                  source={STREAK_MASCOT_GIF}
                  style={[styles.mascotImg, styles.mascotImgOverlay, { opacity: gifOpacity }]}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                  accessibilityRole="image"
                  accessibilityLabel="Nutria mascota animada"
                />
              )}
            </Pressable>
            <View
              style={[
                styles.speechBubble,
                { borderColor: config.ringColor, marginTop: spacing.md },
              ]}
            >
              <Text style={styles.speechText}>
                {isTapped
                  ? '¡Jiji, me haces cosquillas!'
                  : streakDays === 0
                    ? '¡Empieza tu racha hoy!'
                    : streakDays < 7
                      ? '¡Sigue así, estoy creciendo!'
                      : streakDays < 21
                        ? '¡Mira lo fuerte que estoy!'
                        : '¡Somos imparables!'}
              </Text>
              {/* Flecha con borde del tier: triángulo exterior (borde) + interior (fondo) */}
              <View style={[styles.speechArrowBorder, { borderBottomColor: config.ringColor }]} />
              <View style={styles.speechArrow} />
            </View>
          </View>

          {/* Nombre de la mascota */}
          <View style={styles.nameRow}>
            <Text style={[styles.mascotName, { color: config.accentSecondary }]}>{config.name}</Text>
          </View>

          {/* Barra de progreso */}
          <View style={[styles.progressCard, { borderColor: config.ringColor }]}>
            <Text style={[styles.progressLabel, { color: config.accentSecondary }]}>{pointsText}</Text>
          </View>

          {/* Hitos */}
          <View style={[styles.milestonesCard, { borderColor: config.ringColor }]}>
            <Text style={styles.milestonesTitle}>Haz crecer tu mascota</Text>
            {MILESTONES.map((m) => {
              const achieved = streakDays >= m.days;
              return (
                <View key={m.days} style={styles.milestoneRow}>
                  <View style={[styles.milestoneCheck, achieved && styles.milestoneCheckDoneWrap]}>
                    {achieved && (
                      <LinearGradient
                        colors={[colors.primaryLight, colors.primary, colors.primaryDark]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.milestoneCheckGradient}
                      >
                        <Ionicons name="checkmark" size={14} color={colors.white} />
                      </LinearGradient>
                    )}
                  </View>
                  <View style={styles.milestoneTextWrap}>
                    <Text style={[styles.milestoneLabel, achieved && styles.milestoneLabelDone]}>
                      {m.label}
                    </Text>
                    <Text style={[styles.milestoneDesc, achieved && styles.milestoneDescDone]}>
                      {m.description}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Botón motivacional */}
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
          >
            <LinearGradient
              colors={[colors.primaryLight, colors.primary, colors.primaryDark]}
              style={styles.ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.ctaText}>¡A seguir con la racha!</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: { opacity: 0.7 },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  headerDays: {
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 60,
  },
  headerSpacer: { width: 36 },

  scrollView: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    flexGrow: 1,
    width: '100%',
  },

  mascotSection: {
    alignItems: 'center',
    width: '100%',
    marginTop: -spacing.xl * 2,
    marginBottom: spacing.sm,
  },
  mascotHit: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 1,
  },
  mascotImg: {
    width: '100%',
    height: '100%',
  },
  mascotImgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  speechBubble: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    maxWidth: 260,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  speechText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  speechArrowBorder: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  speechArrow: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.surfaceElevated,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  mascotName: {
    fontSize: 18,
    fontWeight: '700',
  },

  progressCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  progressBarTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressBarFillWrap: {
    height: 12,
    minWidth: 0,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFillGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  milestonesCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    flexShrink: 1,
  },
  milestonesAccent: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  milestonesTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  milestoneCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  milestoneCheckDoneWrap: {
    borderWidth: 0,
  },
  milestoneCheckGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneTextWrap: {
    flex: 1,
  },
  milestoneLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  milestoneLabelDone: {
    color: colors.text,
  },
  milestoneDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textTertiary,
    marginTop: 1,
  },
  milestoneDescDone: {
    color: colors.textSecondary,
  },

  ctaButton: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  ctaButtonPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  ctaGradient: {
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.full,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
  },
});
