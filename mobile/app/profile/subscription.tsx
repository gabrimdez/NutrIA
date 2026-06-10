import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api } from '../../src/lib/api';
import { isNonPremiumTier } from '../../src/lib/planAiPremiumGate';
import { GradientButton, Surface } from '../../src/components';
import { PREMIUM_PRODUCT_NAME } from '../../src/constants/premiumMarketing';
import {
  borderRadius,
  colors,
  hairlineWidth,
  screenPaddingX,
  spacing,
  typography,
} from '../../src/theme';
import { Profile, SubscriptionUsageSnapshot } from '../../src/types';

const STORE_SUBS_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
  default: 'https://play.google.com/store/account/subscriptions',
});

function UsageMeter({
  label,
  used,
  limit,
  periodNote,
}: {
  label: string;
  used: number;
  limit: number;
  periodNote: string;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <View style={styles.meter}>
      <View style={styles.meterHeader}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterValues}>
          {used} / {limit} {periodNote}
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function renderUsage(u: SubscriptionUsageSnapshot | null | undefined, isPremium: boolean) {
  if (isPremium) {
    return (
      <View style={styles.usageBlock}>
        <Text style={styles.sectionLabel}>Uso con tu plan</Text>
        <View style={styles.unlimitedBlock}>
          <Ionicons name="infinite-outline" size={20} color={colors.primary} />
          <View style={styles.unlimitedTextWrap}>
            <Text style={styles.unlimitedTitle}>Uso ilimitado</Text>
            <Text style={styles.unlimitedSub}>
              Premium no tiene cupos de producto: mensajes, visión, planes, regeneraciones, recetas y entrenos IA son ilimitados.
            </Text>
          </View>
        </View>
      </View>
    );
  }
  if (!u) return null;
  const chatPeriod = u.chat_messages_period === 'day' ? 'hoy' : 'este mes';
  return (
    <View style={styles.usageBlock}>
      <Text style={styles.sectionLabel}>Uso con tu plan</Text>
      <UsageMeter
        label="Mensajes NutriCoach / parseos"
        used={u.chat_messages_used}
        limit={u.chat_messages_limit}
        periodNote={isPremium ? `(${chatPeriod})` : `(${chatPeriod})`}
      />
      <UsageMeter
        label="Análisis de visión (IA)"
        used={u.vision_analyses_this_month}
        limit={u.vision_analyses_limit_per_month}
        periodNote="(mes)"
      />
      <UsageMeter
        label="Regeneraciones de plan (IA)"
        used={u.plan_regenerations_this_week}
        limit={u.plan_regenerations_limit_per_week}
        periodNote="(semana)"
      />
    </View>
  );
}

export default function SubscriptionManageScreen() {
  const insets = useSafeAreaInsets();

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
  });

  const isFree = isNonPremiumTier(profile?.subscription_tier);
  const effectivePremium = !isFree;

  const openStore = useCallback(() => {
    void Linking.openURL(STORE_SUBS_URL).catch(() => {});
  }, []);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md, paddingTop: spacing.sm },
      ]}
    >
      <Surface variant="elevated" padding="lg" style={styles.statusCard}>
        {effectivePremium ? (
          <LinearGradient
            colors={[colors.primaryDark, colors.primary]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.premiumBanner}
          >
            <Ionicons name="sparkles" size={20} color={colors.white} />
            <View style={styles.premiumBannerText}>
              <Text style={styles.premiumTitle}>{PREMIUM_PRODUCT_NAME}</Text>
              <Text style={styles.premiumSub}>Activo: uso ilimitado en toda la app</Text>
            </View>
          </LinearGradient>
        ) : (
          <View style={styles.freeBanner}>
            <View style={styles.freeIcon}>
              <Ionicons name="leaf-outline" size={22} color={colors.textSecondary} />
            </View>
            <View style={styles.premiumBannerText}>
              <Text style={styles.freeTitle}>Plan Gratis</Text>
              <Text style={styles.freeSub}>
                Tienes la app en modo manual con prueba limitada de IA. Pasa a Premium para usar toda la app sin cupos.
              </Text>
            </View>
          </View>
        )}
      </Surface>

      {renderUsage(profile?.usage ?? null, effectivePremium)}

      <Text style={styles.sectionLabel}>Facturación y cancelación</Text>
      <Text style={styles.help}>
        Las suscripciones se gestionan en la tienda (Apple o Google). Desde allí puedes cancelar, cambiar de plan o
        revisar el historial de pagos. NutrIA no almacena tu tarjeta.
      </Text>

      <GradientButton
        title={Platform.OS === 'ios' ? 'Abrir suscripciones de Apple' : 'Abrir suscripciones de Google Play'}
        onPress={openStore}
        icon={<Ionicons name="open-outline" size={18} color={colors.white} />}
      />

      <Pressable
        onPress={() => router.push('/(tabs)/premium' as never)}
        style={({ pressed }) => [styles.textLink, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="Ver planes y precios"
      >
        <Ionicons name="pricetag-outline" size={16} color={colors.primaryLight} />
        <Text style={styles.textLinkLabel}>Ver planes, precio y condiciones de Premium</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/profile/premium' as never)}
        style={({ pressed }) => [styles.textLink, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.textLinkSecondary}>Comparativa detallada Gratis frente a Premium</Text>
      </Pressable>

      <View style={styles.resto}>
        <Ionicons name="information-circle-outline" size={18} color={colors.textTertiary} />
        <Text style={styles.restoText}>
          Si activamos compras in-app, el saldo de tu suscripción se sincronizará con la tienda. Cuentas de prueba
          internas pueden mostrar Premium sin pasar por el cobro.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, gap: spacing.lg },
  statusCard: { borderWidth: 1, borderColor: colors.border, padding: 0, overflow: 'hidden' },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  premiumBannerText: { flex: 1, minWidth: 0 },
  premiumTitle: { ...typography.h3, color: colors.white, fontWeight: '700' },
  premiumSub: { ...typography.caption, color: 'rgba(255,255,255,0.88)', marginTop: 4 },
  freeBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg },
  freeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeTitle: { ...typography.h3, color: colors.text },
  freeSub: { ...typography.caption, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  usageBlock: { gap: spacing.md },
  unlimitedBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  unlimitedTextWrap: { flex: 1, minWidth: 0 },
  unlimitedTitle: { ...typography.captionBold, color: colors.text },
  unlimitedSub: { ...typography.small, color: colors.textSecondary, lineHeight: 18, marginTop: 2 },
  meter: { gap: 6 },
  meterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  meterLabel: { ...typography.captionBold, color: colors.text, flex: 1 },
  meterValues: { ...typography.small, color: colors.textSecondary },
  meterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  help: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
  textLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.xs },
  textLinkLabel: { ...typography.captionBold, color: colors.primaryLight, flex: 1 },
  textLinkSecondary: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  resto: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: hairlineWidth,
    borderColor: colors.border,
  },
  restoText: { ...typography.small, color: colors.textTertiary, lineHeight: 18, flex: 1 },
});
