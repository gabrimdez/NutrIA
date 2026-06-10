import { useState, useEffect, useRef } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * En Android, `keyboardDidHide` a veces se dispara en falso durante ajuste de layout
 * (edge-to-edge + adjustResize, o al re-medirse un contenedor). Retrasar el pase a
 * "cerrado" evita bucles: show inmediato, hide con pequeño debounce (solo Android).
 */
const HIDE_DELAY_MS = Platform.OS === 'android' ? 200 : 0;

export function useDebouncedKeyboardOpen(active: boolean = true): boolean {
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      setOpen(false);
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setOpen(true);
    };
    const onHide = () => {
      if (HIDE_DELAY_MS <= 0) {
        setOpen(false);
        return;
      }
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setOpen(false);
        hideTimer.current = null;
      }, HIDE_DELAY_MS);
    };
    const a = Keyboard.addListener(showEvt, onShow);
    const b = Keyboard.addListener(hideEvt, onHide);
    return () => {
      a.remove();
      b.remove();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [active]);

  return open;
}

/**
 * Altura del teclado con la misma política de debounce que `useDebouncedKeyboardOpen`.
 * - Show: actualiza inmediatamente a `endCoordinates.height`.
 * - Hide: en Android, espera `HIDE_DELAY_MS` antes de pasar a 0 (si otro `show` llega
 *   en ese lapso, se cancela la bajada, cortando el bucle show/hide con el layout).
 * Pasa `active=false` cuando el modal/sheet esté cerrado para no escuchar en balde.
 */
export function useDebouncedKeyboardHeight(active: boolean = true): number {
  const [height, setHeight] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setHeight(0);
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: { endCoordinates?: { height?: number } }) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      const h = e.endCoordinates?.height ?? 0;
      setHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
    };
    const onHide = () => {
      if (HIDE_DELAY_MS <= 0) {
        setHeight(0);
        return;
      }
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setHeight(0);
        hideTimer.current = null;
      }, HIDE_DELAY_MS);
    };
    const a = Keyboard.addListener(showEvt, onShow);
    const b = Keyboard.addListener(hideEvt, onHide);
    return () => {
      a.remove();
      b.remove();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [active]);

  return height;
}
