import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, spacing, typography } from '../theme';

type PremiumLockModalProps = {
  visible: boolean;
  onDismiss: () => void;
  /** Nombre de la función bloqueada (p. ej. "el escáner con IA"). */
  featureName?: string;
  /** Título personalizado; por defecto se construye con `featureName`. */
  title?: string;
  /** Mensaje principal personalizado; por defecto explica que es exclusiva de Premium. */
  message?: string;
  /** Lista de beneficios mostrada como bullets. */
  perks?: string[];
  /** Texto del CTA principal. */
  ctaLabel?: string;
  /** Texto del botón secundario. */
  dismissLabel?: string;
  /** Acción al pulsar el CTA. Por defecto navega a la pestaña de pago `/(tabs)/premium`. */
  onUpgrade?: () => void;
};

const DEFAULT_PERKS = [
  'NutriCoach y chat con IA ilimitados',
  'Escáner, código de barras y análisis con IA ilimitados',
  'Planes de alimentación y cambios con IA ilimitados',
  'Recetas y entrenos asistidos con IA ilimitados',
];

export function PremiumLockModal({
  visible,
  onDismiss,
  featureName,
  title,
  message,
  perks = DEFAULT_PERKS,
  ctaLabel = 'Desbloquear con Premium',
  dismissLabel = 'Ahora no',
  onUpgrade,
}: PremiumLockModalProps) {
  const insets = useSafeAreaInsets();
  const backdrop = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(card, {
          toValue: 1,
          friction: 9,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      backdrop.setValue(0);
      card.setValue(0);
    }
  }, [visible, backdrop, card]);

  const resolvedTitle =
    title ??
    (featureName
      ? `${capitalize(featureName)} es una función Premium`
      : 'Función exclusiva de Premium');

  const resolvedMessage =
    message ??
    (featureName
      ? `Has alcanzado el límite de ${featureName} en el plan gratuito. Con Premium el uso de la app es ilimitado: IA, escáner, planes, recetas y entrenos sin cupos.`
      : 'Has alcanzado el límite de esta función en el plan gratuito. Con Premium todo el uso de la app es ilimitado.');

  const handleUpgrade = () => {
    onDismiss();
    if (onUpgrade) {
      onUpgrade();
      return;
    }
    router.push('/(tabs)/premium' as never);
  };

  const cardTranslate = card.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });
  const cardScale = card.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Cerrar" />

        <Animated.View
          style={[
            styles.cardWrapper,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              opacity: card,
              transform: [{ translateY: cardTranslate }, { scale: cardScale }],
            },
          ]}
        >
          <View style={styles.card}>
            <Pressable
              onPress={onDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>

            <View style={styles.iconWrap}>
              <LinearGradient
                colors={[colors.primaryLight, colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconRing}
              >
                <View style={styles.iconInner}>
                  <Ionicons name="lock-closed" size={26} color={colors.primaryLight} />
                </View>
              </LinearGradient>
              <View style={styles.sparkleBadge}>
                <Ionicons name="sparkles" size={12} color={colors.white} />
              </View>
            </View>

            <View style={styles.premiumPill}>
              <Ionicons name="sparkles" size={11} color={colors.primaryLight} />
              <Text style={styles.premiumPillText}>NUTRIA PREMIUM</Text>
            </View>

            <Text style={styles.title}>{resolvedTitle}</Text>
            <Text style={styles.message}>{resolvedMessage}</Text>

            {perks.length > 0 && (
              <View style={styles.perksBox}>
                {perks.map((perk) => (
                  <View key={perk} style={styles.perkRow}>
                    <View style={styles.perkCheck}>
                      <Ionicons name="checkmark" size={12} color={colors.primaryLight} />
                    </View>
                    <Text style={styles.perkText}>{perk}</Text>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              onPress={handleUpgrade}
              accessibilityRole="button"
              accessibilityLabel={ctaLabel}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            >
              <LinearGradient
                colors={[colors.primaryLight, colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaGradient}
              >
                <Ionicons name="sparkles" size={16} color={colors.white} />
                <Text style={styles.ctaText}>{ctaLabel}</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={dismissLabel}
              style={({ pressed }) => [styles.dismissBtn, pressed && styles.dismissBtnPressed]}
            >
              <Text style={styles.dismissText}>{dismissLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 10, 14, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 420,
  },
  card: {
    borderRadius: borderRadius.xxl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl + spacing.xs,
    paddingBottom: spacing.xl,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.45,
        shadowRadius: 32,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 2,
  },
  closeBtnPressed: { opacity: 0.7 },

  iconWrap: {
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  iconRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  iconInner: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 36,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },

  premiumPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.md,
  },
  premiumPillText: {
    ...typography.micro,
    color: colors.primaryLight,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },

  perksBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  perkCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },

  cta: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
  },
  ctaText: {
    ...typography.bodyBold,
    color: colors.white,
    fontWeight: '700',
  },

  dismissBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dismissBtnPressed: { opacity: 0.6 },
  dismissText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
});
