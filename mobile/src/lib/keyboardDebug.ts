import { useEffect, useRef } from 'react';
import { Keyboard, Platform } from 'react-native';
import { KEYBOARD_REPRO_CHECKLIST } from './keyboardRepro';

/**
 * Pon a true para trazar keyboardDid* en pantallas y layout del BottomSheet.
 * Dejar en false en commits normales; activar solo al reproducir en dispositivo.
 */
export const KEYBOARD_DEBUG_LOGS = false;

export function logKeyboardReproChecklist(): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(KEYBOARD_REPRO_CHECKLIST);
  }
}

/**
 * En __DEV__ y con KEYBOARD_DEBUG_LOGS, registra eventos de teclado (útil con adb logcat paralelo).
 */
export function useKeyboardScreenDebug(screenName: string): void {
  const t0 = useRef(Date.now());
  const lastEv = useRef<string | null>(null);

  useEffect(() => {
    if (!KEYBOARD_DEBUG_LOGS) return;
    t0.current = Date.now();
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: { endCoordinates: { height: number } }) => {
      const now = Date.now();
      // eslint-disable-next-line no-console
      console.log(
        `[KeyboardDebug][${screenName}] SHOW +${now - t0.current}ms h=${e.endCoordinates?.height} prev=${lastEv.current}`,
      );
      lastEv.current = 'show';
    };
    const onHide = () => {
      const now = Date.now();
      // eslint-disable-next-line no-console
      console.log(`[KeyboardDebug][${screenName}] HIDE +${now - t0.current}ms prev=${lastEv.current}`);
      lastEv.current = 'hide';
    };
    const a = Keyboard.addListener(showEvt, onShow);
    const b = Keyboard.addListener(hideEvt, onHide);
    // eslint-disable-next-line no-console
    console.log(`[KeyboardDebug][${screenName}] logger attached`);
    return () => {
      a.remove();
      b.remove();
    };
  }, [screenName]);
}
