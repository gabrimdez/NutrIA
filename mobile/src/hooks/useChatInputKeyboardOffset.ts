import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Keyboard, Platform, useWindowDimensions, type EmitterSubscription } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnimatedKeyboard, useAnimatedReaction, runOnJS } from 'react-native-reanimated';

const IS_WEB = Platform.OS === 'web';
const HIDE_DLY = Platform.OS === 'android' ? 120 : 0;

/**
 * Pixels desde el fondo (parte baja) del "window" (React Native) hasta el borde superior del IME.
 * Para usar con `position: "absolute"`, `bottom: offset + (offset ? 0 : insets.bottom)`.
 */
function keyboardOverlapFromEvent(
  e: { endCoordinates?: { height?: number; screenY?: number } },
  windowHeight: number,
): number {
  const c = e.endCoordinates;
  if (!c) return 0;
  if (typeof c.screenY === 'number' && c.screenY >= 0) {
    const overlap = windowHeight - c.screenY;
    if (overlap > 1) {
      return overlap;
    }
    // Si `screenY` ya coincide con el borde inferior del window de RN, el
    // sistema ya redimensionó la raíz (`adjustResize`) y no hay solape extra.
    if (typeof c.height === 'number' && c.height > 1 && c.screenY >= windowHeight - 1) {
      return 0;
    }
  }
  if (typeof c.height === 'number' && c.height > 1) {
    return c.height;
  }
  return 0;
}

/**
 * Altura del teclado para fijar un **input** encima del IME: listeners JS (iOS: `WillChangeFrame`),
 * Reanimated `useAnimatedKeyboard` (nativo), y web `visualViewport` + `Keyboard` si aplica.
 */
export function useChatInputKeyboardOffset(): { keyboardOffset: number; safeBottom: number } {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const [fromJs, setFromJs] = useState(0);
  const [fromWeb, setFromWeb] = useState(0);
  const [fromAnim, setFromAnim] = useState(0);
  const [jsKeyboardVisible, setJsKeyboardVisible] = useState(false);
  const [hasJsKeyboardFrame, setHasJsKeyboardFrame] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aKb = useAnimatedKeyboard();
  const setFromAnimJ = useCallback((v: number) => {
    setFromAnim((p) => (Math.abs(p - v) < 0.5 ? p : v));
  }, []);
  useAnimatedReaction(
    () => aKb.height.value,
    (h) => {
      runOnJS(setFromAnimJ)(h);
    },
    [setFromAnimJ],
  );

  useEffect(() => {
    if (IS_WEB) {
      if (typeof window === 'undefined' || !window.visualViewport) {
        return;
      }
      const vv = window.visualViewport;
      const sync = () => {
        const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        setFromWeb(Math.round(overlap));
      };
      vv.addEventListener('resize', sync);
      vv.addEventListener('scroll', sync);
      const onKShow = (e: { endCoordinates?: { height?: number } }) => {
        setFromWeb(Math.max(0, e.endCoordinates?.height ?? 0));
        sync();
      };
      const onKHide = () => setFromWeb(0);
      const a = Keyboard.addListener('keyboardDidShow', onKShow);
      const b = Keyboard.addListener('keyboardDidHide', onKHide);
      sync();
      return () => {
        vv.removeEventListener('resize', sync);
        vv.removeEventListener('scroll', sync);
        a.remove();
        b.remove();
      };
    }

    const onShow = (e: { endCoordinates?: { height?: number; screenY?: number } }) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      const h = keyboardOverlapFromEvent(e, windowH);
      setHasJsKeyboardFrame(true);
      setJsKeyboardVisible(true);
      setFromJs((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
    };
    const onFrame = (e: { endCoordinates?: { height?: number; screenY?: number } }) => {
      if (Platform.OS !== 'ios') return;
      const h = keyboardOverlapFromEvent(e, windowH);
      setHasJsKeyboardFrame(true);
      setJsKeyboardVisible(h > 0);
      setFromJs((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
    };
    const onHide = () => {
      if (HIDE_DLY <= 0) {
        setFromJs(0);
        setJsKeyboardVisible(false);
        setHasJsKeyboardFrame(false);
        return;
      }
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setFromJs(0);
        setJsKeyboardVisible(false);
        setHasJsKeyboardFrame(false);
        hideTimer.current = null;
      }, HIDE_DLY);
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs: EmitterSubscription[] = [Keyboard.addListener(showEvent, onShow)];
    if (Platform.OS === 'ios') {
      subs.push(Keyboard.addListener('keyboardWillChangeFrame', onFrame));
    }
    subs.push(Keyboard.addListener(hideEvent, onHide));

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      subs.forEach((s) => s.remove());
    };
  }, [windowH]);

  const keyboardOffset = useMemo(
    () => {
      if (IS_WEB) return Math.max(0, fromWeb, fromJs);
      if (hasJsKeyboardFrame && jsKeyboardVisible && fromJs <= 0) {
        return 0;
      }
      return Math.max(0, fromJs, fromAnim, fromWeb);
    },
    [fromWeb, fromJs, fromAnim, hasJsKeyboardFrame, jsKeyboardVisible],
  );

  return { keyboardOffset, safeBottom: insets.bottom };
}
