import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Pressable,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, Mask, Rect as SvgRect } from 'react-native-svg';
import { parseMealTypeParam } from '../../src/lib/mealDisplay';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { resolvedDiaryYmd } from '../../src/lib/diaryDate';
import { colors, typography, spacing, DOCK_H, DOCK_MARGIN_BOTTOM } from '../../src/theme';
import { useSearchSectionStore } from '../../src/store/searchSectionStore';
import SearchActionBar from '../../src/components/SearchActionBar';

const SCANNER_ACCENT = colors.primary;
const PILL_BG = colors.scannerPill;
const CONTROL_BG = colors.scannerControl;
const OVERLAY_DIM = colors.scannerOverlay;

type ScanMode = 'food' | 'barcode';

function parseModeParam(v: string | undefined): ScanMode {
  return v === 'barcode' ? 'barcode' : 'food';
}

export default function MealScannerScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const pathname = usePathname();
  const { meal_type: mealTypeParam, date: dateParam, mode: modeParam } = useLocalSearchParams<{
    meal_type?: string;
    date?: string;
    mode?: string;
  }>();
  const mealType = parseMealTypeParam(mealTypeParam);
  const diaryDateStr = useMemo(() => resolvedDiaryYmd(dateParam), [dateParam]);
  const [mode, setMode] = useState<ScanMode>(() => parseModeParam(modeParam));
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<InstanceType<typeof CameraView>>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const scanLock = useRef(false);
  const setLastSection = useSearchSectionStore((s) => s.setLastSection);
  const scanLineY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setLastSection('scanner');
  }, [setLastSection]);

  useEffect(() => {
    setMode(parseModeParam(modeParam));
  }, [modeParam]);

  useEffect(() => {
    if (mode !== 'barcode') {
      scanLineY.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineY, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanLineY, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [mode, scanLineY]);

  const tabsVisible = pathname.startsWith('/scanner');
  const tabBarSpace = tabsVisible ? DOCK_H + Math.max(insets.bottom, DOCK_MARGIN_BOTTOM) : 0;
  const safeBottom = Math.max(insets.bottom, 16);
  const actionBarBottom = tabsVisible ? tabBarSpace + 8 : safeBottom + 8;
  const clusterBottom = actionBarBottom + DOCK_H + 12;
  // Altura aproximada del cluster (botón disparador + título + toggle)
  const CLUSTER_CONTENT_HEIGHT = 180;
  // Separación deseada entre el marco y el cluster de cámara
  const FRAME_TO_CLUSTER_GAP = 56;

  const frameGeom = useMemo(() => {
    const padX = 28;
    const clusterTopY = winH - clusterBottom - CLUSTER_CONTENT_HEIGHT;
    const maxBottomY = clusterTopY - FRAME_TO_CLUSTER_GAP;
    if (mode === 'food') {
      const w = Math.min(winW - padX * 2, 320);
      const top = Math.max(insets.top + 56, Math.round(winH * 0.10));
      const desiredH = Math.round(w * 0.95);
      const h = Math.max(200, Math.min(desiredH, maxBottomY - top));
      const left = (winW - w) / 2;
      return { w, h, left, top, rx: 22 };
    }
    const w = winW - padX * 2;
    const h = 128;
    const left = padX;
    const top = Math.max(insets.top + 64, Math.round(winH * 0.14));
    return { w, h, left, top, rx: 16 };
  }, [mode, winW, winH, insets.top, clusterBottom]);

  const mealQuery = useMemo(() => {
    const q = new URLSearchParams({
      meal_type: mealType,
      date: diaryDateStr,
    });
    return q.toString();
  }, [mealType, diaryDateStr]);

  const pushPhotoWithUri = useCallback(
    (uri: string) => {
      const enc = encodeURIComponent(uri);
      router.push(`/add-meal/photo?${mealQuery}&import_uri=${enc}` as never);
    },
    [mealQuery],
  );

  const onGallery = useCallback(async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      Alert.alert(
        'Permiso de galería',
        'Para elegir una foto de comida, permite acceso a tus fotos en el dispositivo.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      pushPhotoWithUri(result.assets[0].uri);
    }
  }, [pushPhotoWithUri]);

  const onShutter = useCallback(async () => {
    if (mode !== 'food' || !cameraReady || capturing || !camRef.current) return;
    setCapturing(true);
    try {
      const photo = await camRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (!photo?.uri) return;

      const imgW = photo.width;
      const imgH = photo.height;

      // The camera preview fills the screen (StyleSheet.absoluteFill),
      // behaving like "cover": it scales to fill winW×winH then crops overflow.
      const previewScale = Math.max(winW / imgW, winH / imgH);
      const visibleW = imgW * previewScale;
      const visibleH = imgH * previewScale;
      const offsetX = (visibleW - winW) / 2;
      const offsetY = (visibleH - winH) / 2;

      const { w: fw, h: fh, left: fx, top: fy } = frameGeom;

      const cropX = Math.max(0, Math.round((fx + offsetX) / previewScale));
      const cropY = Math.max(0, Math.round((fy + offsetY) / previewScale));
      const cropW = Math.min(imgW - cropX, Math.round(fw / previewScale));
      const cropH = Math.min(imgH - cropY, Math.round(fh / previewScale));

      const cropped = await manipulateAsync(
        photo.uri,
        [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
        { compress: 0.85, format: SaveFormat.JPEG },
      );

      pushPhotoWithUri(cropped.uri);
    } catch (e) {
      Alert.alert('No se pudo capturar', toUserFacingErrorMessage(e, 'No se pudo capturar la foto'));
    } finally {
      setCapturing(false);
    }
  }, [mode, cameraReady, capturing, pushPhotoWithUri, winW, winH, frameGeom]);

  const onBarcodeScanned = useCallback(
    (data: { data: string }) => {
      if (mode !== 'barcode' || scanLock.current) return;
      scanLock.current = true;
      const code = data.data;
      router.replace(`/add-meal/barcode?${mealQuery}&scanned_code=${encodeURIComponent(code)}` as never);
    },
    [mode, mealQuery],
  );

  const showScannerHelp = () => {
    Alert.alert(
      'Escáner',
      'Comidas: encuadra el plato y pulsa el botón blanco para analizarlo con IA.\n\nCódigo de barras: cambia a “Barras” y mantén el código dentro del recuadro; se detectará automáticamente.',
    );
  };

  if (!permission) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={SCANNER_ACCENT} />
        <Text style={styles.bootText}>Preparando cámara…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.boot}>
        <StatusBar style="light" />
        <Ionicons name="camera-outline" size={48} color={SCANNER_ACCENT} style={{ marginBottom: spacing.md }} />
        <Text style={styles.permTitle}>Acceso a la cámara</Text>
        <Text style={styles.permDesc}>Necesitamos la cámara para fotografiar comidas o leer códigos de barras.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={styles.permBtnText}>Permitir cámara</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={styles.permBack}>
          <Text style={styles.permBackText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.boot}>
        <StatusBar style="light" />
        <Text style={styles.permTitle}>Escáner no disponible en web</Text>
        <Text style={styles.permDesc}>Usa la app en iOS o Android para la cámara y el lector de códigos.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={() => router.back()}>
          <Text style={styles.permBtnText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { w: fw, h: fh, left: fx, top: fy, rx } = frameGeom;
  const hint =
    mode === 'food' ? 'Toma una foto de tu comida' : 'Apunta al código de barras del producto';
  const modeLabel = mode === 'food' ? 'Comidas' : 'Barras';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <CameraView
        ref={camRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        flash={flash}
        enableTorch={torchOn && mode === 'barcode'}
        barcodeScannerSettings={
          mode === 'barcode'
            ? { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }
            : undefined
        }
        onBarcodeScanned={mode === 'barcode' ? onBarcodeScanned : undefined}
        onCameraReady={() => setCameraReady(true)}
      />

      <Svg width={winW} height={winH} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <Defs>
          <Mask id="scannerHole">
            <SvgRect width={winW} height={winH} fill="white" />
            <SvgRect x={fx} y={fy} width={fw} height={fh} rx={rx} ry={rx} fill="black" />
          </Mask>
        </Defs>
        <SvgRect width={winW} height={winH} fill={OVERLAY_DIM} mask="url(#scannerHole)" />
      </Svg>

      {/* Marco blanco */}
      <View
        style={[
          styles.frameBorder,
          {
            left: fx,
            top: fy,
            width: fw,
            height: fh,
            borderRadius: rx,
            pointerEvents: 'none',
          },
        ]}
      />

      {/* Línea de escaneo animada */}
      {mode === 'barcode' && (
        <Animated.View
          style={[
            styles.scanLine,
            {
              left: fx + 12,
              width: fw - 24,
              top: fy,
              pointerEvents: 'none',
              transform: [{
                translateY: scanLineY.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, fh - 10],
                }),
              }],
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', SCANNER_ACCENT, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.scanLineGradient}
          />
        </Animated.View>
      )}

      {/* Cabecera */}
      <View style={[styles.topRow, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.roundNavBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.hintPill}>
          <Text style={styles.hintText} numberOfLines={2}>
            {hint}
          </Text>
        </View>
        <TouchableOpacity style={styles.roundNavBtn} onPress={showScannerHelp} hitSlop={12}>
          <Ionicons name="information-circle-outline" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Disparador / ayuda barras + flash + galería */}
      <View style={[styles.bottomCluster, { bottom: clusterBottom }]}>
        <View style={styles.captureRow}>
          <TouchableOpacity
            style={styles.sideIconWrap}
            onPress={() => {
              if (mode === 'barcode') {
                setTorchOn((t) => !t);
              } else {
                setFlash((f) => (f === 'off' ? 'on' : 'off'));
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons
              name={
                mode === 'barcode'
                  ? torchOn
                    ? 'flashlight'
                    : 'flashlight-outline'
                  : flash === 'on'
                    ? 'flash'
                    : 'flash-off'
              }
              size={26}
              color={colors.whiteOverlay}
            />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {mode === 'food' ? (
              <Pressable
                style={({ pressed }) => [styles.shutterOuter, pressed && { opacity: 0.85 }]}
                onPress={onShutter}
                disabled={!cameraReady || capturing}
              >
                <View style={styles.shutterInner} />
              </Pressable>
            ) : (
              <View style={styles.barcodeHint}>
                <Text style={styles.barcodeHintText}>Lectura automática</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.sideIconWrap} onPress={onGallery} activeOpacity={0.85}>
            <Ionicons name="images-outline" size={26} color={colors.whiteOverlay} />
          </TouchableOpacity>
        </View>

        <Text style={styles.modeTitle}>{modeLabel}</Text>

        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeHalf, mode === 'food' && styles.modeHalfActive]}
            onPress={() => {
              setTorchOn(false);
              setMode('food');
            }}
            activeOpacity={0.85}
          >
            <View style={[styles.modeIconBox, mode === 'food' && styles.modeIconBoxActive]}>
              <Ionicons name="nutrition-outline" size={22} color={colors.white} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeHalf, mode === 'barcode' && styles.modeHalfActive]}
            onPress={() => {
              scanLock.current = false;
              setFlash('off');
              setMode('barcode');
            }}
            activeOpacity={0.85}
          >
            <View style={[styles.modeIconBox, mode === 'barcode' && styles.modeIconBoxActive]}>
              <Ionicons name="barcode-outline" size={24} color={colors.white} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Barra de acciones (Recetas / Buscar / Escáner) sobre el tab bar */}
      <View style={[styles.actionBarWrap, { bottom: actionBarBottom }]} pointerEvents="box-none">
        <SearchActionBar
          active="scanner"
          onRecipes={() => router.replace(`/add-meal/recipes?${mealQuery}` as never)}
          onSearch={() => router.replace(`/add-meal/search?${mealQuery}` as never)}
        />
      </View>

      {capturing && (
        <View style={styles.capturingOverlay}>
          <ActivityIndicator size="large" color={SCANNER_ACCENT} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
  },
  boot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  bootText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  permTitle: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  permDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  permBtn: {
    backgroundColor: SCANNER_ACCENT,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    minWidth: 200,
    alignItems: 'center',
  },
  permBtnText: {
    ...typography.bodyBold,
    color: colors.white,
    fontSize: 16,
  },
  permBack: { marginTop: spacing.lg, padding: spacing.sm },
  permBackText: { ...typography.body, color: colors.textMuted },
  frameBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.whiteOverlayStrong,
  },
  topRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    gap: 8,
  },
  hintPill: {
    flex: 1,
    maxWidth: '100%',
    backgroundColor: PILL_BG,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  roundNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: colors.whiteOverlayMuted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlaySoft,
  },
  hintText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  sideIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CONTROL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCluster: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  actionBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'stretch',
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.borderDarkSoft,
  },
  barcodeHint: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: CONTROL_BG,
  },
  barcodeHintText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  modeTitle: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 4,
    fontSize: 16,
    letterSpacing: 0.3,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.scannerToggle,
    borderRadius: 22,
    padding: 5,
    gap: 6,
  },
  modeHalf: {
    borderRadius: 18,
    paddingVertical: 4,
    paddingHorizontal: 28,
  },
  modeHalfActive: {},
  modeIconBox: {
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconBoxActive: {
    borderColor: SCANNER_ACCENT,
    backgroundColor: colors.primaryGlow,
  },
  capturingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute',
    height: 2,
    shadowColor: SCANNER_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 7,
    elevation: 6,
  },
  scanLineGradient: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
});
