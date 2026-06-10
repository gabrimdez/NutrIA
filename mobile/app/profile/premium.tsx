import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Surface } from '../../src/components';
import {
  PREMIUM_BILLING_LABEL,
  PREMIUM_PRICE_ANCHOR,
  PREMIUM_PRODUCT_NAME,
} from '../../src/constants/premiumMarketing';
import { SUBSCRIPTION_LIMITS } from '../../src/constants/subscriptionLimits';
import {
  borderRadius,
  colors,
  elevation,
  hairlineWidth,
  iconSize,
  screenPaddingX,
  spacing,
  typography,
} from '../../src/theme';

const {
  freeChatUserMessagesPerMonth,
  freeVisionAnalysesPerMonth,
  freePlanRegenerationsPerWeek,
  freeRecipeRecommendationsPerDay,
} = SUBSCRIPTION_LIMITS;

type IconName = keyof typeof Ionicons.glyphMap;
type FreeTone = 'included' | 'limited' | 'manual' | 'locked';

type HeroProof = {
  icon: IconName;
  label: string;
};

type ValueCard = {
  icon: IconName;
  title: string;
  body: string;
};

type ComparisonRow = {
  icon: IconName;
  feature: string;
  freeLabel: string;
  freeDetail: string;
  freeTone: FreeTone;
  premiumLabel: string;
  premiumDetail: string;
};

type Notice = {
  icon: IconName;
  title: string;
  body: string;
};

const HERO_PROOFS: HeroProof[] = [
  { icon: 'checkmark-circle-outline', label: 'App manual incluida' },
  { icon: 'sparkles-outline', label: 'IA ilimitada' },
];

const VALUE_CARDS: ValueCard[] = [
  {
    icon: 'chatbubbles-outline',
    title: 'NutriCoach ilimitado',
    body: 'Resuelve dudas, convierte texto en comida y recibe ayuda conectada con tu actividad sin cupos de mensajes.',
  },
  {
    icon: 'scan-outline',
    title: 'Escáner y análisis ilimitados',
    body: 'Foto, imagen, código de barras y análisis nutricional con IA sin límites de uso Premium.',
  },
  {
    icon: 'calendar-outline',
    title: 'Planes semanales sin cupos',
    body: 'Genera planes completos, regenera comidas y sustituye alimentos con IA de forma ilimitada.',
  },
  {
    icon: 'restaurant-outline',
    title: 'Recetas y entrenos ilimitados',
    body: 'Obtén ideas de recetas y estima calorías quemadas a partir de tu entreno sin cupos Premium.',
  },
];

/** Textos alineados con reglas de negocio (backend) y `GET /me/profile` → `usage`. */
const COMPARISON_ROWS: ComparisonRow[] = [
  {
    icon: 'journal-outline',
    feature: 'Diario, comidas, planes y recetas manuales',
    freeLabel: 'Incluido',
    freeDetail: 'Sí, sin límite de registro en la app.',
    freeTone: 'included',
    premiumLabel: 'Incluido',
    premiumDetail: 'Sí, igual que en Gratis.',
  },
  {
    icon: 'calendar-outline',
    feature: 'Generar el plan semanal completo con IA',
    freeLabel: 'Manual',
    freeDetail: 'No. Puedes crear y editar el plan solo a mano.',
    freeTone: 'manual',
    premiumLabel: 'Ilimitado',
    premiumDetail: 'Sí, generaciones de plan ilimitadas.',
  },
  {
    icon: 'swap-horizontal-outline',
    feature: 'Sustituir alimentos en el plan con sugerencias de IA',
    freeLabel: 'Manual',
    freeDetail: 'No. Puedes cambiar alimentos manualmente.',
    freeTone: 'manual',
    premiumLabel: 'Ilimitado',
    premiumDetail: 'Sí, cambios con IA ilimitados.',
  },
  {
    icon: 'refresh-outline',
    feature: 'Regenerar una comida del plan con IA',
    freeLabel: 'Limitado',
    freeDetail: `Hasta ${freePlanRegenerationsPerWeek} por semana (UTC).`,
    freeTone: 'limited',
    premiumLabel: 'Ilimitado',
    premiumDetail: 'Regeneraciones con IA ilimitadas.',
  },
  {
    icon: 'chatbubbles-outline',
    feature: 'NutriCoach, chat y “texto → comida”',
    freeLabel: 'Prueba IA',
    freeDetail: `Hasta ${freeChatUserMessagesPerMonth} mensajes o descripciones al mes (mes calendario UTC).`,
    freeTone: 'limited',
    premiumLabel: 'Ilimitado',
    premiumDetail: 'Chat, NutriCoach y texto a comida ilimitados.',
  },
  {
    icon: 'scan-outline',
    feature: 'Foto, escáner y lector de código de barras',
    freeLabel: 'Limitado',
    freeDetail: `Hasta ${freeVisionAnalysesPerMonth} análisis de visión al mes en una bolsa compartida.`,
    freeTone: 'limited',
    premiumLabel: 'Ilimitado',
    premiumDetail: 'Foto, escáner y código de barras con IA ilimitados.',
  },
  {
    icon: 'restaurant-outline',
    feature: 'Sugerencias de recetas con IA',
    freeLabel: 'Limitado',
    freeDetail: `Hasta ${freeRecipeRecommendationsPerDay} al día (día en UTC).`,
    freeTone: 'limited',
    premiumLabel: 'Ilimitado',
    premiumDetail: 'Sugerencias de recetas con IA ilimitadas.',
  },
  {
    icon: 'barbell-outline',
    feature: 'Entreno → calorías estimadas con IA',
    freeLabel: 'No incluido',
    freeDetail: 'No.',
    freeTone: 'locked',
    premiumLabel: 'Ilimitado',
    premiumDetail: 'Sí, estimaciones IA ilimitadas.',
  },
];

const NOTICES: Notice[] = [
  {
    icon: 'storefront-outline',
    title: 'Suscripción in-app',
    body: 'El cobro con Apple y Google está en preparación. La gestión en tienda aplicará cuando el producto esté publicado.',
  },
  {
    icon: 'server-outline',
    title: 'Premium sin cupos',
    body: 'Los cupos solo aplican al plan Gratis. En Premium, el perfil muestra uso ilimitado porque no hay límites de producto.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Sin promesas futuras',
    body: 'Solo se muestran funciones existentes en cliente y backend. Otras ventajas se añadirán cuando estén disponibles.',
  },
];

const freeToneMeta: Record<FreeTone, { icon: IconName; color: string; backgroundColor: string; borderColor: string }> = {
  included: {
    icon: 'checkmark-circle-outline',
    color: colors.primaryLight,
    backgroundColor: colors.primaryGlowSoft,
    borderColor: colors.primaryBorder,
  },
  limited: {
    icon: 'time-outline',
    color: colors.warning,
    backgroundColor: colors.warningMuted,
    borderColor: 'rgba(245, 158, 11, 0.28)',
  },
  manual: {
    icon: 'create-outline',
    color: colors.textSecondary,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: colors.border,
  },
  locked: {
    icon: 'lock-closed-outline',
    color: colors.textMuted,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: colors.border,
  },
};

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={['rgba(16, 185, 129, 0.34)', 'rgba(16, 185, 129, 0.08)', 'rgba(26, 29, 38, 0.98)']}
        locations={[0, 0.48, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="sparkles" size={30} color={colors.white} />
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="diamond-outline" size={13} color={colors.primaryLight} />
            <Text style={styles.heroBadgeText}>Plan avanzado</Text>
          </View>
        </View>

        <Text style={styles.heroProduct}>{PREMIUM_PRODUCT_NAME}</Text>
        <Text style={styles.heroTitle}>Más IA para comer mejor, con menos esfuerzo</Text>
        <Text style={styles.heroSubtitle}>
          Premium elimina los cupos: puedes planificar, escanear, consultar, crear recetas y ajustar tu nutrición con IA de forma ilimitada.
        </Text>

        <View style={styles.pricePanel}>
          <View>
            <Text style={styles.priceLabel}>Precio orientativo</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceValue}>{PREMIUM_PRICE_ANCHOR}</Text>
              <Text style={styles.pricePeriod}>{PREMIUM_BILLING_LABEL}</Text>
            </View>
          </View>
          <View style={styles.priceStatusPill}>
            <Ionicons name="information-circle-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.priceStatusText}>Cobro en preparación</Text>
          </View>
        </View>

        <View style={styles.heroProofGrid}>
          {HERO_PROOFS.map((item) => (
            <View key={item.label} style={styles.heroProofPill}>
              <Ionicons name={item.icon} size={14} color={colors.primaryLight} />
              <Text style={styles.heroProofText}>{item.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionKicker}>Beneficios principales</Text>
        <Text style={styles.sectionTitle}>Qué cambia al pasar a Premium</Text>
        <Text style={styles.sectionSubtitle}>
          Una propuesta clara: mantener la app manual y añadir uso ilimitado de IA donde más tiempo ahorra.
        </Text>
      </View>

      <View style={styles.valueGrid}>
        {VALUE_CARDS.map((item) => (
          <Surface key={item.title} variant="elevated" padding="lg" style={styles.valueCard}>
            <View style={styles.valueIconWrap}>
              <Ionicons name={item.icon} size={iconSize.md} color={colors.primaryLight} />
            </View>
            <Text style={styles.valueTitle}>{item.title}</Text>
            <Text style={styles.valueBody}>{item.body}</Text>
          </Surface>
        ))}
      </View>

      <View style={styles.sectionHeaderCompact}>
        <Text style={styles.sectionKicker}>Comparativa</Text>
        <Text style={styles.sectionTitle}>Gratis vs Premium, sin letra pequeña</Text>
        <Text style={styles.sectionSubtitle}>
          Textos alineados con el backend. Los periodos de uso se calculan en UTC y se reflejan en tu perfil.
        </Text>
      </View>

      <View
        style={styles.compareShell}
        accessibilityLabel="Comparación de plan gratuito y plan premium, función a función"
      >
        <View style={styles.planCardsRow}>
          <View style={styles.planCardFree}>
            <View style={styles.planCardHeader}>
              <Ionicons name="leaf-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.planCardNameFree}>Gratis</Text>
            </View>
            <Text style={styles.planCardHeadline}>Manual + prueba de IA</Text>
            <Text style={styles.planCardBody}>Ideal para empezar y registrar tu rutina sin coste.</Text>
          </View>

          <LinearGradient
            colors={[colors.primaryDark, colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.planCardPremium}
          >
            <View style={styles.planCardHeader}>
              <Ionicons name="sparkles" size={18} color={colors.white} />
              <Text style={styles.planCardNamePremium}>Premium</Text>
            </View>
            <Text style={styles.planCardHeadlinePremium}>IA ilimitada</Text>
            <Text style={styles.planCardBodyPremium}>Pensado para ahorrar tiempo sin cupos en funciones avanzadas.</Text>
            <View style={styles.recommendedPill}>
              <Text style={styles.recommendedPillText}>Recomendado</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.comparisonList}>
          {COMPARISON_ROWS.map((row) => {
            const tone = freeToneMeta[row.freeTone];

            return (
              <View key={row.feature} style={styles.comparisonCard}>
                <View style={styles.comparisonCardHeader}>
                  <View style={styles.comparisonIconWrap}>
                    <Ionicons name={row.icon} size={iconSize.md} color={colors.primaryLight} />
                  </View>
                  <Text style={styles.comparisonTitle}>{row.feature}</Text>
                </View>

                <View style={styles.planResultStack}>
                  <View style={styles.freeResultCard}>
                    <View style={styles.resultHeaderRow}>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor },
                        ]}
                      >
                        <Ionicons name={tone.icon} size={12} color={tone.color} />
                        <Text style={[styles.statusPillText, { color: tone.color }]}>{row.freeLabel}</Text>
                      </View>
                      <Text style={styles.planMiniLabelFree}>Gratis</Text>
                    </View>
                    <Text style={styles.freeResultText}>{row.freeDetail}</Text>
                  </View>

                  <View style={styles.premiumResultCard}>
                    <LinearGradient
                      colors={['rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.03)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.premiumSideGlow} />
                    <View style={styles.resultHeaderRow}>
                      <View style={[styles.statusPill, styles.premiumStatusPill]}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.primaryLight} />
                        <Text style={styles.premiumStatusPillText}>{row.premiumLabel}</Text>
                      </View>
                      <Text style={styles.planMiniLabelPremium}>Premium</Text>
                    </View>
                    <Text style={styles.premiumResultText}>{row.premiumDetail}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <Surface variant="subtle" padding="lg" style={styles.noticePanel}>
        <View style={styles.noticeHeader}>
          <View style={styles.noticeHeaderIcon}>
            <Ionicons name="document-text-outline" size={18} color={colors.primaryLight} />
          </View>
          <View style={styles.noticeHeaderCopy}>
            <Text style={styles.noticeTitle}>Transparencia antes de suscribirte</Text>
            <Text style={styles.noticeSubtitle}>Lo importante sobre disponibilidad, uso ilimitado y condiciones.</Text>
          </View>
        </View>

        {NOTICES.map((notice, index) => (
          <View key={notice.title} style={[styles.noticeRow, index > 0 && styles.noticeRowWithBorder]}>
            <View style={styles.noticeIconWrap}>
              <Ionicons name={notice.icon} size={16} color={colors.textSecondary} />
            </View>
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeItemTitle}>{notice.title}</Text>
              <Text style={styles.noticeBody}>{notice.body}</Text>
            </View>
          </View>
        ))}
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPaddingX, paddingTop: spacing.md },
  heroCard: {
    borderRadius: borderRadius.xxxl,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
    overflow: 'hidden',
    ...elevation.floating,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  heroIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(15, 17, 23, 0.48)',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  heroBadgeText: { ...typography.micro, color: colors.primaryLight, fontWeight: '800', textTransform: 'uppercase' },
  heroProduct: { ...typography.captionBold, color: colors.primaryLight, marginBottom: spacing.xs },
  heroTitle: { ...typography.h1, color: colors.text, marginBottom: spacing.sm, letterSpacing: -0.4 },
  heroSubtitle: { ...typography.body, color: colors.textSecondary, lineHeight: 23, marginBottom: spacing.lg },
  pricePanel: {
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(15, 17, 23, 0.58)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  priceLabel: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.sm },
  priceValue: { ...typography.metricLg, color: colors.text },
  pricePeriod: { ...typography.caption, color: colors.textSecondary, flex: 1, minWidth: 150 },
  priceStatusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceStatusText: { ...typography.micro, color: colors.textSecondary, fontWeight: '700' },
  heroProofGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroProofPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryGlowSoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  heroProofText: { ...typography.micro, color: colors.text, fontWeight: '700' },
  sectionHeader: { marginBottom: spacing.md },
  sectionHeaderCompact: { marginTop: spacing.xs, marginBottom: spacing.md },
  sectionKicker: {
    ...typography.label,
    color: colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: spacing.xs,
  },
  sectionTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  sectionSubtitle: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
  valueGrid: { gap: spacing.md, marginBottom: spacing.xxl },
  valueCard: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
  },
  valueIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  valueTitle: { ...typography.bodyBold, color: colors.text, marginBottom: 5 },
  valueBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
  compareShell: {
    borderRadius: borderRadius.xxxl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.xxl,
    ...elevation.card,
  },
  planCardsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: hairlineWidth,
    borderBottomColor: colors.border,
  },
  planCardFree: {
    flex: 1,
    minWidth: 0,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  planCardPremium: {
    flex: 1,
    minWidth: 0,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    overflow: 'hidden',
  },
  planCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  planCardNameFree: { ...typography.captionBold, color: colors.textSecondary },
  planCardNamePremium: { ...typography.captionBold, color: colors.white },
  planCardHeadline: { ...typography.captionBold, color: colors.text, marginBottom: 4 },
  planCardHeadlinePremium: { ...typography.captionBold, color: colors.white, marginBottom: 4 },
  planCardBody: { ...typography.small, color: colors.textSecondary, lineHeight: 16 },
  planCardBodyPremium: { ...typography.small, color: colors.whiteOverlayStrong, lineHeight: 16, marginBottom: spacing.sm },
  recommendedPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  recommendedPillText: { ...typography.micro, color: colors.white, fontWeight: '800' },
  comparisonList: { padding: spacing.md, gap: spacing.md },
  comparisonCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
  },
  comparisonCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  comparisonIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparisonTitle: { ...typography.bodyBold, color: colors.text, flex: 1, lineHeight: 21 },
  planResultStack: { gap: spacing.sm },
  freeResultCard: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  premiumResultCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorderStrong,
    padding: spacing.md,
  },
  premiumSideGlow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 4,
    backgroundColor: colors.primaryLight,
  },
  resultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPillText: { ...typography.micro, fontWeight: '800' },
  premiumStatusPill: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryBorder,
  },
  premiumStatusPillText: { ...typography.micro, color: colors.primaryLight, fontWeight: '800' },
  planMiniLabelFree: {
    ...typography.micro,
    color: colors.textTertiary,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  planMiniLabelPremium: {
    ...typography.micro,
    color: colors.primaryLight,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  freeResultText: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
  premiumResultText: { ...typography.captionBold, color: colors.text, lineHeight: 20 },
  noticePanel: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  noticeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  noticeHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeHeaderCopy: { flex: 1, minWidth: 0 },
  noticeTitle: { ...typography.bodyBold, color: colors.text, marginBottom: 3 },
  noticeSubtitle: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingTop: spacing.md },
  noticeRowWithBorder: {
    marginTop: spacing.md,
    borderTopWidth: hairlineWidth,
    borderTopColor: colors.border,
  },
  noticeIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeCopy: { flex: 1, minWidth: 0 },
  noticeItemTitle: { ...typography.captionBold, color: colors.textSecondary, marginBottom: 2 },
  noticeBody: { ...typography.caption, color: colors.textTertiary, lineHeight: 19 },
});
