import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BlurView } from 'expo-blur';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useDebouncedKeyboardHeight } from '../../hooks/useDebouncedKeyboardOpen';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { blurActiveElementOnWeb } from '../../lib/webFocus';
import { KEYBOARD_DEBUG_LOGS } from '../../lib/keyboardDebug';
import { colors, borderRadius, spacing } from '../../theme';

function dismissKeyboardFromSheet(): void {
  Keyboard.dismiss();
  blurActiveElementOnWeb();
}

/** Sin spring: evita que la hoja “rebote” hacia arriba al asentarse. */
const OPEN_MS = 300;
const CLOSE_MS = 280;
const SHEET_EASING = Easing.out(Easing.cubic);

type Props = {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Altura máxima como fracción de la ventana (p. ej. 0.78 ≈ no pantalla completa). */
  maxHeightFraction?: number;
  /** Tope absoluto en px para pantallas muy altas. */
  maxHeightCap?: number;
  /**
   * Si es true, la hoja usa altura fija = min(ventana × fracción, cap).
   * Sin esto solo hay maxHeight y el panel queda al tamaño del contenido (p. ej. chat muy bajo).
   */
  expandToMaxHeight?: boolean;
  /**
   * Si es true, en iOS también se sube toda la hoja con translateY al aparecer el teclado
   * (igual que en Android). Útil para hojas compactas con TextInput cuyo
   * KeyboardAvoidingView interno no tiene altura medible (`bodyKavAuto`) y no empuja
   * el contenido. Desactivado por defecto para no romper hojas que ya gestionan el
   * teclado a su manera (p. ej. chat).
   */
  liftOnKeyboard?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/**
 * Solo Android: subir toda la hoja con translateY evita solaparse con el teclado.
 * En iOS ese desplazamiento usa endCoordinates.height completo y suele empujar
 * demasiado (el campo de búsqueda queda fuera de vista); ahí usamos KeyboardAvoidingView interno.
 *
 * Usa `useDebouncedKeyboardHeight` para ignorar "hides" espurios en Android
 * (edge-to-edge + adjustResize) que provocaban un bucle show/hide al subir/bajar la hoja.
 */
function useKeyboardLiftPx(active: boolean, liftOnIos: boolean): number {
  const isAndroid = Platform.OS === 'android';
  const isIos = Platform.OS === 'ios';
  const shouldListen = active && (isAndroid || (isIos && liftOnIos));
  return useDebouncedKeyboardHeight(shouldListen);
}

export function BottomSheet({
  visible,
  onDismiss,
  children,
  maxHeightFraction = 0.78,
  maxHeightCap = 620,
  expandToMaxHeight = false,
  liftOnKeyboard = false,
  contentContainerStyle,
}: Props) {
  const { height: liveWindowH } = useWindowDimensions();
  const wasVisibleRef = useRef(false);
  if (visible && !wasVisibleRef.current && Platform.OS === 'web') {
    blurActiveElementOnWeb();
  }
  wasVisibleRef.current = visible;
  const kbHeight = useKeyboardLiftPx(visible, liftOnKeyboard);
  /**
   * Congelar la altura de ventana al abrir la hoja. Si no, con adjustResize+IME
   * `liveWindowH` baja, `sheetMaxH` cambia y el efecto de apertura re-dispara
   * translateY → parpadeo del teclado (input pierde foco y el IME hace ciclos).
   */
  const [frozenWindowH, setFrozenWindowH] = useState(0);
  useEffect(() => {
    if (visible) {
      setFrozenWindowH((prev) => (prev > 0 ? prev : Math.max(liveWindowH, 1)));
    } else {
      setFrozenWindowH(0);
    }
  }, [visible, liveWindowH]);

  const baseWindowH = frozenWindowH > 0 ? frozenWindowH : Math.max(liveWindowH, 1);
  const sheetMaxH = Math.min(baseWindowH * maxHeightFraction, maxHeightCap);

  useEffect(() => {
    if (KEYBOARD_DEBUG_LOGS) {
      // eslint-disable-next-line no-console
      console.log(
        '[BottomSheet] sheetMaxH',
        sheetMaxH,
        'liveH',
        liveWindowH,
        'frozenH',
        frozenWindowH,
      );
    }
  }, [sheetMaxH, liveWindowH, frozenWindowH]);

  const translateY = useSharedValue(sheetMaxH);
  const kbOffset = useSharedValue(0);
  const contextStart = useSharedValue(0);

  useEffect(() => {
    kbOffset.value = withTiming(kbHeight, { duration: 250, easing: SHEET_EASING });
  }, [kbHeight, kbOffset]);

  const closeSheet = useCallback(() => {
    dismissKeyboardFromSheet();
    translateY.value = withTiming(
      sheetMaxH,
      { duration: CLOSE_MS, easing: SHEET_EASING },
      (finished) => {
        if (finished) runOnJS(onDismiss)();
      },
    );
  }, [onDismiss, sheetMaxH, translateY]);

  useEffect(() => {
    if (visible) {
      translateY.value = sheetMaxH;
      const id = requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: OPEN_MS, easing: SHEET_EASING });
      });
      return () => cancelAnimationFrame(id);
    }
    translateY.value = sheetMaxH;
  }, [visible, sheetMaxH, translateY]);

  /** Evita foco en un control tapado por aria-hidden (stack web + modal). */
  useEffect(() => {
    if (!visible) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const el = document.activeElement as HTMLElement | null;
      el?.blur?.();
    }
  }, [visible]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onStart(() => {
      contextStart.value = translateY.value;
      runOnJS(dismissKeyboardFromSheet)();
    })
    .onUpdate((e) => {
      const next = contextStart.value + e.translationY;
      translateY.value = Math.max(0, next);
    })
    .onEnd((e) => {
      const dismissDistance = sheetMaxH * 0.18;
      const fast = e.velocityY > 650;
      if (translateY.value > dismissDistance || fast) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withTiming(0, { duration: OPEN_MS, easing: SHEET_EASING });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateY: -kbOffset.value },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, sheetMaxH], [1, 0], Extrapolation.CLAMP),
  }));

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
      accessibilityViewIsModal
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdropShell, backdropStyle, { pointerEvents: 'box-none' }]}>
          <View
            style={[
              StyleSheet.absoluteFill,
              Platform.OS === 'web' ? styles.backdropDimWeb : styles.backdropDimNative,
              { pointerEvents: 'none' },
            ]}
          />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeSheet}
            accessibilityRole="button"
            accessibilityLabel="Cerrar panel"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheetOuter,
            { maxHeight: sheetMaxH },
            expandToMaxHeight && { height: sheetMaxH },
            sheetStyle,
          ]}
        >
          {Platform.OS === 'web' ? (
            <View style={[StyleSheet.absoluteFill, styles.sheetBehindBlur, { pointerEvents: 'none' }]} />
          ) : (
            <BlurView
              tint={Platform.OS === 'ios' ? 'systemThinMaterialDark' : 'dark'}
              intensity={Platform.OS === 'ios' ? 38 : 32}
              {...(Platform.OS === 'android'
                ? {
                    experimentalBlurMethod: 'dimezisBlurView' as const,
                    blurReductionFactor: 2.4,
                  }
                : {})}
              style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
            />
          )}
          <View style={[styles.sheet, expandToMaxHeight && styles.sheetFill]}>
            {/* Capa decorativa detrás: en iOS el Blur debe quedar bajo el contenido o el texto se ve “lavado”. */}
            <View style={[styles.sheetDecorLayer, { pointerEvents: 'none' }]}>
              <SheetFrostedBackground />
            </View>
            <View
              style={[
                styles.sheetContentLayer,
                expandToMaxHeight && styles.sheetContentLayerGrow,
              ]}
            >
              <GestureDetector gesture={pan}>
                <View
                  style={styles.handleZone}
                  accessibilityLabel="Arrastra hacia abajo para cerrar"
                  accessibilityRole="adjustable"
                >
                  <View style={styles.handle} />
                </View>
              </GestureDetector>
              {/* View (no Pressable): en web un Pressable envolviendo ScrollView suele dejar flex:1 sin altura y roba gestos. */}
              <View
                accessible={false}
                style={[
                  styles.body,
                  expandToMaxHeight && styles.bodyFill,
                  contentContainerStyle,
                ]}
              >
                {Platform.OS === 'ios' && !liftOnKeyboard ? (
                  <KeyboardAvoidingView
                    behavior="padding"
                    style={expandToMaxHeight ? styles.bodyKav : styles.bodyKavAuto}
                    keyboardVerticalOffset={0}
                  >
                    {children}
                  </KeyboardAvoidingView>
                ) : (
                  children
                )}
              </View>
            </View>
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * Cristal esmerilado fuerte: blur alto + velo oscuro → fondo ilegible, solo manchas/contraste.
 */
function SheetFrostedBackground() {
  if (Platform.OS === 'web') {
    return (
      <View
        style={[StyleSheet.absoluteFill, styles.sheetFrostWeb, { pointerEvents: 'none' }]}
      />
    );
  }

  return (
    <>
      <BlurView
        tint={Platform.OS === 'ios' ? 'systemThickMaterialDark' : 'dark'}
        intensity={Platform.OS === 'ios' ? 92 : 56}
        {...(Platform.OS === 'android'
          ? {
              experimentalBlurMethod: 'dimezisBlurView' as const,
              blurReductionFactor: 2.2,
            }
          : {})}
        style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      />
      <View style={[StyleSheet.absoluteFill, styles.sheetFrostVeil, { pointerEvents: 'none' }]} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  /** Velo a pantalla completa: solo atenuación; el blur va en la hoja (misma caja que el panel). */
  backdropShell: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropDimWeb: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  backdropDimNative: {
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  /** Alineado con el panel: el desenfoque solo afecta a esta franja inferior (misma altura que la hoja). */
  sheetOuter: {
    width: '100%',
    overflow: 'hidden',
    borderTopLeftRadius: borderRadius.xxxl,
    borderTopRightRadius: borderRadius.xxxl,
  },
  sheetBehindBlur: {
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(22px)',
          WebkitBackdropFilter: 'blur(22px)',
        } as const)
      : {}),
  },
  sheet: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderTopLeftRadius: borderRadius.xxxl,
    borderTopRightRadius: borderRadius.xxxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.dockBorder,
    paddingBottom: spacing.md,
    position: 'relative',
  },
  /** Con expandToMaxHeight: la hoja interior ocupa todo sheetOuter para que flex del cuerpo funcione en iOS. */
  sheetFill: {
    flex: 1,
    minHeight: 0,
  },
  sheetDecorLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  /** Fondo opaco bajo texto: evita que BlurView “coma” títulos e inputs en iOS dentro del Modal. */
  sheetContentLayer: {
    zIndex: 1,
    backgroundColor: colors.surfaceElevated,
    alignSelf: 'stretch',
  },
  /** Solo con expandToMaxHeight: sin altura fija del padre, flex:1 en iOS puede colapsar a 0. */
  sheetContentLayerGrow: {
    flex: 1,
    minHeight: 0,
  },
  /** Velo más cerrado: texto ilegible; el blur sigue dejando solo formas difusas. */
  sheetFrostVeil: {
    backgroundColor: 'rgba(16, 18, 26, 0.78)',
  },
  sheetFrostWeb: {
    backgroundColor: 'rgba(28, 30, 38, 0.94)',
    borderTopLeftRadius: borderRadius.xxxl,
    borderTopRightRadius: borderRadius.xxxl,
  },
  handleZone: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.textTertiary,
    opacity: 0.5,
  },
  body: {
    alignSelf: 'stretch',
    minHeight: 120,
  },
  /** Con expandToMaxHeight: el cuerpo ocupa el espacio bajo el asa para listas/teclado. */
  bodyFill: {
    flex: 1,
    minHeight: 0,
  },
  bodyKav: {
    flex: 1,
    minHeight: 0,
  },
  /** Vista previa / hojas compactas: altura según hijos (evita KAV+flex colapsando en iOS). */
  bodyKavAuto: {
    width: '100%',
  },
});
