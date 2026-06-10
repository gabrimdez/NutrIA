import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { Button, Surface, Input, MealTypePickerSheet } from '../../src/components';
import { colors, spacing, typography, borderRadius, screenPaddingX, hairlineWidth } from '../../src/theme';
import { NutritionBarcodeResponse, NutritionFoodItem } from '../../src/types';
import { roundMacroG } from '../../src/lib/mealItemMath';
import { invalidateMealRelatedQueries } from '../../src/lib/mealQueryInvalidation';
import { parseMealTypeParam, type MealTypeOrderKey } from '../../src/lib/mealDisplay';
import { resolvedDiaryYmd } from '../../src/lib/diaryDate';

function scannerBarcodeHref(mealType: string, diaryDateStr: string) {
  const q = new URLSearchParams({
    meal_type: mealType,
    date: diaryDateStr,
    mode: 'barcode',
  });
  return `/scanner?${q.toString()}`;
}

export default function BarcodeScanScreen() {
  const queryClient = useQueryClient();
  const { meal_type: mealTypeParam, date: dateParam, scanned_code: scannedCodeParam } = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
    scanned_code?: string;
  }>();
  const mealType = parseMealTypeParam(mealTypeParam);
  const diaryDateStr = useMemo(() => resolvedDiaryYmd(dateParam), [dateParam]);

  const scannedCode = useMemo(() => {
    if (!scannedCodeParam) return null;
    try {
      return decodeURIComponent(scannedCodeParam);
    } catch {
      return scannedCodeParam;
    }
  }, [scannedCodeParam]);

  const [scannedCodeState, setScannedCodeState] = useState<string | null>(null);
  const [product, setProduct] = useState<NutritionFoodItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notFoundMsg, setNotFoundMsg] = useState('');
  const [grams, setGrams] = useState('100');
  const [hideProductImage, setHideProductImage] = useState(false);
  const [showMealPicker, setShowMealPicker] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<MealTypeOrderKey>(mealType as MealTypeOrderKey);
  const redirectRef = useRef(false);
  const lookupStartedRef = useRef(false);

  useEffect(() => {
    if (scannedCode) return;
    if (redirectRef.current) return;
    redirectRef.current = true;
    router.replace(scannerBarcodeHref(mealType, diaryDateStr) as never);
  }, [scannedCode, mealType, diaryDateStr]);

  const lookupMutation = useMutation({
    mutationFn: (code: string) =>
      api.get<NutritionBarcodeResponse>(`/api/v1/nutrition/barcode/${encodeURIComponent(String(code))}`),
    onSuccess: (data) => {
      if (data.found && data.item) {
        setProduct(data.item);
        setNotFound(false);
      } else {
        setNotFound(true);
        setNotFoundMsg(data.message || 'Producto no encontrado.');
      }
    },
    onError: () => {
      setNotFound(true);
      setNotFoundMsg('Error al buscar producto. Intenta de nuevo.');
    },
  });

  useEffect(() => {
    if (!scannedCode) return;
    if (lookupStartedRef.current) return;
    lookupStartedRef.current = true;
    setScannedCodeState(scannedCode);
    setProduct(null);
    setNotFound(false);
    lookupMutation.mutate(scannedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al recibir código desde el escáner
  }, [scannedCode]);

  useEffect(() => {
    setHideProductImage(false);
  }, [product?.image_url]);

  const saveMutation = useMutation({
    mutationFn: (overrideMealType: MealTypeOrderKey) => {
      if (!product) throw new Error('No hay producto');
      const g = Math.max(1, Math.round(parseFloat(grams.replace(',', '.')) || 100));
      const p100 = product.per_100g;
      const factor = g / 100;
      return api.post('/api/v1/meals/confirm', {
        date: diaryDateStr,
        meal_type: overrideMealType,
        title: product.brand ? `${product.name} — ${product.brand}` : product.name,
        items: [
          {
            custom_name: product.name,
            grams: g,
            kcal: roundMacroG((p100?.calories ?? 0) * factor),
            protein_g: roundMacroG((p100?.protein ?? 0) * factor),
            carbs_g: roundMacroG((p100?.carbs ?? 0) * factor),
            fat_g: roundMacroG((p100?.fat ?? 0) * factor),
            source: product.source,
          },
        ],
      });
    },
    onSuccess: () => {
      invalidateMealRelatedQueries(queryClient);
      router.back();
    },
    onError: (e: unknown) =>
      Alert.alert('Error', toUserFacingErrorMessage(e, 'No se pudo guardar')),
  });

  const resetScan = () => {
    router.replace(scannerBarcodeHref(mealType, diaryDateStr) as never);
  };

  const computedMacros = useMemo(() => {
    if (!product?.per_100g) return { kcal: 0, p: 0, c: 0, f: 0 };
    const g = Math.max(0, parseFloat(grams.replace(',', '.')) || 0);
    const factor = g / 100;
    const p100 = product.per_100g;
    return {
      kcal: roundMacroG((p100.calories ?? 0) * factor),
      p: roundMacroG((p100.protein ?? 0) * factor),
      c: roundMacroG((p100.carbs ?? 0) * factor),
      f: roundMacroG((p100.fat ?? 0) * factor),
    };
  }, [product, grams]);

  if (!scannedCode) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primaryLight} />
        <Text style={styles.text}>Abriendo escáner…</Text>
      </View>
    );
  }

  if (lookupMutation.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primaryLight} size="large" style={{ marginBottom: spacing.md }} />
        <Text style={styles.title}>Buscando producto…</Text>
        <Text style={styles.desc}>Código: {scannedCodeState}</Text>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Producto no encontrado</Text>
        <Text style={styles.desc}>{notFoundMsg}</Text>
        <Text style={styles.code}>Código: {scannedCodeState}</Text>
        <Button title="Escanear otro" onPress={resetScan} style={{ marginTop: spacing.lg }} />
        <Button
          title="Buscar manualmente"
          variant="secondary"
          onPress={() => router.replace(`/(tabs)/search?meal_type=${mealType}&date=${diaryDateStr}` as never)}
          style={{ marginTop: spacing.md }}
        />
      </View>
    );
  }

  if (product) {
    const p100 = product.per_100g;
    const showProductImage = Boolean(product.image_url) && !hideProductImage;
    return (
      <ScrollView style={styles.resultContainer} contentContainerStyle={styles.resultContent}>
        <Text style={styles.title}>{product.name}</Text>
        {product.brand && <Text style={styles.brand}>{product.brand}</Text>}
        <Text style={styles.code}>Código: {product.barcode || scannedCodeState}</Text>

        {showProductImage ? (
          <Surface variant="subtle" style={styles.imageCard} padding="sm">
            <Image
              source={{ uri: product.image_url! }}
              style={styles.productImage}
              resizeMode="contain"
              onError={() => setHideProductImage(true)}
            />
          </Surface>
        ) : null}

        <Surface variant="elevated" style={styles.macroCard} padding="md">
          <Text style={styles.macroTitle}>Por 100g</Text>
          <View style={styles.macroRow}>
            <Text style={[styles.macroVal, { color: colors.calories }]}>{p100?.calories ?? 0} kcal</Text>
            <Text style={[styles.macroVal, { color: colors.protein }]}>P:{p100?.protein ?? 0}g</Text>
            <Text style={[styles.macroVal, { color: colors.carbs }]}>C:{p100?.carbs ?? 0}g</Text>
            <Text style={[styles.macroVal, { color: colors.fat }]}>G:{p100?.fat ?? 0}g</Text>
          </View>
        </Surface>

        <Text style={styles.label}>Gramos consumidos</Text>
        <Input
          value={grams}
          onChangeText={setGrams}
          keyboardType="decimal-pad"
          style={styles.gramsInput}
        />

        <Surface variant="subtle" style={styles.macroCard} padding="md">
          <Text style={styles.macroTitle}>Tu porción ({grams}g)</Text>
          <View style={styles.macroRow}>
            <Text style={[styles.macroVal, { color: colors.calories }]}>{computedMacros.kcal} kcal</Text>
            <Text style={[styles.macroVal, { color: colors.protein }]}>P:{computedMacros.p}g</Text>
            <Text style={[styles.macroVal, { color: colors.carbs }]}>C:{computedMacros.c}g</Text>
            <Text style={[styles.macroVal, { color: colors.fat }]}>G:{computedMacros.f}g</Text>
          </View>
        </Surface>

        <View style={styles.actions}>
          <Button title="Guardar comida" onPress={() => setShowMealPicker(true)} loading={saveMutation.isPending} />
          <Button title="Escanear otro" variant="secondary" onPress={resetScan} style={{ marginTop: spacing.md }} />
        </View>

        <MealTypePickerSheet
          visible={showMealPicker}
          title="Guardar como..."
          selectedMealType={selectedMealType}
          onDismiss={() => setShowMealPicker(false)}
          onSelect={(mealTypeToSave) => {
            setSelectedMealType(mealTypeToSave);
            setShowMealPicker(false);
            saveMutation.mutate(mealTypeToSave);
          }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primaryLight} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: screenPaddingX,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  desc: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  text: { ...typography.body, color: colors.text, marginTop: spacing.md },
  code: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  brand: { ...typography.bodyBold, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xs },
  resultContainer: { flex: 1, backgroundColor: colors.background },
  resultContent: { padding: screenPaddingX, paddingTop: spacing.xl, paddingBottom: 120 },
  imageCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 280,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  macroCard: { marginVertical: spacing.md },
  macroTitle: { ...typography.captionBold, color: colors.textMuted, marginBottom: spacing.sm },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around' },
  macroVal: { ...typography.bodyBold },
  label: { ...typography.captionBold, color: colors.textMuted, marginTop: spacing.md },
  gramsInput: { marginTop: spacing.xs, marginBottom: 0 },
  actions: { marginTop: spacing.xl },
});

