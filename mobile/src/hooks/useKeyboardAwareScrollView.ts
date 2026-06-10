import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  type KeyboardEvent,
  Platform,
  UIManager,
  findNodeHandle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type TextInputProps,
} from 'react-native';

const ANDROID_HIDE_DELAY_MS = 200;
const EXTRA_TOP_MARGIN = 12;
/** Separación mínima entre el borde inferior del input y el borde superior del teclado (px). */
const GAP_ABOVE_IME = 24;
const FOCUS_SCROLL_DELAYS_MS = [60, 200, 420];
/** Reintentos de scroll en web (ms): el visualViewport se estabiliza tarde tras abrir el IME. */
const WEB_FOCUS_SCROLL_DELAYS_MS = [60, 200, 420, 700];

type KeyboardMetrics = {
  height: number;
  screenY?: number;
};
type TextInputFocusEvent = Parameters<NonNullable<TextInputProps['onFocus']>>[0];

function getNodeHandle(target: unknown): number | null {
  if (typeof target === 'number') return target;
  if (target == null) return null;
  return findNodeHandle(target as Parameters<typeof findNodeHandle>[0]);
}

/** `event.target` a veces no apunta al nodo nativo; en Android/iOS hace falta `nativeEvent.target`. */
function resolveFocusNativeTarget(
  e: TextInputFocusEvent,
): number | null {
  const ne = (e as { nativeEvent?: { target?: unknown; tag?: number } }).nativeEvent;
  const raw = ne?.target ?? ne?.tag ?? (e as { target?: unknown }).target;
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  return getNodeHandle(raw);
}

/**
 * ScrollView helper for Android edge-to-edge forms.
 *
 * On Android 15 / target SDK 35, `adjustResize` may leave the app laid out behind
 * the IME. This hook therefore does not rely on the root view being resized:
 * it tracks IME screen coordinates, adds equivalent bottom space, and scrolls
 * the currently focused TextInput above the keyboard using window measurements.
 *
 * En iOS también ajusta el scroll. En **web** (móvil con teclado virtual) usa
 * `visualViewport` + `scrollIntoView` (no hay `Keyboard` fiable con RN-Web).
 * Pasa `active={true}` en pantallas de formulario.
 */
export function useKeyboardAwareScrollView(active: boolean) {
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const focusedTargetRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  /** Actualizado de forma síncrona al mostrar el IME (antes de setState) para que el scroll use ya la altura real. */
  const keyboardMetricsRef = useRef<KeyboardMetrics>({ height: 0 });
  const [keyboardMetrics, setKeyboardMetrics] = useState<KeyboardMetrics>({ height: 0 });
  const [webKeyboardOverlap, setWebKeyboardOverlap] = useState(0);
  /** Web: input HTML actualmente enfocado (para reaccionar a cambios del visualViewport). */
  const focusedWebElRef = useRef<HTMLElement | null>(null);
  /** Web: overlap del teclado virtual sincronizado para callbacks (sin esperar al render). */
  const webKeyboardOverlapRef = useRef(0);

  const clearScrollTimers = useCallback(() => {
    scrollTimersRef.current.forEach(clearTimeout);
    scrollTimersRef.current = [];
  }, []);

  const scrollFocusedInputIntoView = useCallback(() => {
    if (!active || Platform.OS === 'web') return;

    const target = focusedTargetRef.current;
    const scrollView = scrollViewRef.current;
    const scrollNode = getNodeHandle(scrollView);
    if (!target || !scrollView || !scrollNode) return;

    // Android: animated=false evita cierres del IME. iOS tolera un scroll suave corto.
    const doAnimate = Platform.OS === 'ios';

    UIManager.measureInWindow(scrollNode, (_sx, scrollTop, _sw, scrollHeight) => {
      UIManager.measureInWindow(target, (_x, inputTop, _w, inputHeight) => {
        const windowHeight = Dimensions.get('window').height;
        const km = keyboardMetricsRef.current;
        const kH = km.height;
        const topOfKeyboard =
          kH > 0
            ? (km.screenY != null
                ? km.screenY
                : windowHeight - kH)
            : windowHeight;
        const visibleTop = scrollTop + EXTRA_TOP_MARGIN;
        const viewBottomY = Math.min(scrollTop + scrollHeight, topOfKeyboard);
        // Borde inferior del input alineado justo encima del teclado (salvo márgen GAP)
        const maxBottomVisible = viewBottomY - GAP_ABOVE_IME;
        const inputBottom = inputTop + inputHeight;
        const currentScrollY = scrollYRef.current;

        if (inputBottom > maxBottomVisible) {
          const delta = inputBottom - maxBottomVisible;
          const y = Math.max(0, currentScrollY + delta);
          scrollView.scrollTo({ y, animated: doAnimate });
          scrollYRef.current = y;
          return;
        }

        if (inputTop < visibleTop) {
          const y = Math.max(0, currentScrollY - (visibleTop - inputTop));
          scrollView.scrollTo({ y, animated: doAnimate });
          scrollYRef.current = y;
        }
      });
    });
  }, [active]);

  const ensureWebFocusedInputVisible = useCallback(() => {
    if (Platform.OS !== 'web' || typeof globalThis.window === 'undefined') return;
    const w = globalThis.window;
    const doc = globalThis.document;
    const el = focusedWebElRef.current;
    if (!el || !doc || doc.activeElement !== el) return;

    const overlap = webKeyboardOverlapRef.current;
    // `scroll-margin-bottom` indica al navegador cuánto espacio dejar bajo el elemento al
    // alinearlo con el borde inferior del viewport / scrollport. Imprescindible para que
    // `scrollIntoView` no encaje el input justo bajo el teclado virtual.
    const marginPx = `${Math.max(0, overlap) + GAP_ABOVE_IME}px`;
    if (el.style.scrollMarginBottom !== marginPx) {
      el.style.scrollMarginBottom = marginPx;
    }

    if (typeof el.scrollIntoView === 'function') {
      // `nearest` con scroll-margin-bottom = teclado + GAP coloca el input encima del IME
      // sin bajarlo más de lo necesario cuando ya está visible.
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    // Fallback manual: si tras el scrollIntoView el input sigue por debajo del borde superior
    // del teclado (pasa cuando el ancestro scrollable no llega al borde físico de la ventana),
    // desplazamos los ancestros scrollables manualmente.
    w.requestAnimationFrame(() => {
      const vv = w.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : w.innerHeight;
      const rect = el.getBoundingClientRect();
      const allowedBottom = visibleBottom - GAP_ABOVE_IME;
      if (rect.bottom <= allowedBottom) return;
      const delta = rect.bottom - allowedBottom;
      let node: HTMLElement | null = el.parentElement;
      let remaining = delta;
      while (node && remaining > 0.5) {
        const cs = w.getComputedStyle(node);
        const overflowY = cs.overflowY;
        const isScrollable =
          (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
          node.scrollHeight > node.clientHeight + 1;
        if (isScrollable) {
          const max = node.scrollHeight - node.clientHeight - node.scrollTop;
          const apply = Math.min(remaining, Math.max(0, max));
          if (apply > 0) {
            node.scrollTop += apply;
            remaining -= apply;
          }
        }
        node = node.parentElement;
      }
      if (remaining > 0.5) {
        // Como último recurso desplaza el documento principal.
        w.scrollBy({ top: remaining, behavior: 'smooth' });
      }
    });
  }, []);

  const scheduleScrollFocusedInputIntoView = useCallback(() => {
    if (!active) return;
    if (Platform.OS === 'web') {
      clearScrollTimers();
      scrollTimersRef.current = WEB_FOCUS_SCROLL_DELAYS_MS.map((delay) =>
        setTimeout(ensureWebFocusedInputVisible, delay),
      );
      return;
    }
    clearScrollTimers();
    scrollTimersRef.current = FOCUS_SCROLL_DELAYS_MS.map((delay) =>
      setTimeout(scrollFocusedInputIntoView, delay),
    );
  }, [active, clearScrollTimers, ensureWebFocusedInputVisible, scrollFocusedInputIntoView]);

  const handleTextInputFocus = useCallback(
    (event: TextInputFocusEvent) => {
      const tag = resolveFocusNativeTarget(event) ?? getNodeHandle((event as { target?: unknown }).target);
      if (tag != null) {
        focusedTargetRef.current = tag;
      }
      scheduleScrollFocusedInputIntoView();
    },
    [scheduleScrollFocusedInputIntoView],
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  // Web: forzar a html/body/#root a usar la altura del **visual viewport** (100dvh) y declarar
  // `interactive-widget=resizes-content` en el meta viewport. Sin esto, los contenedores
  // raíz de RN-Web (position: absolute; top:0; bottom:0) se anclan al layout viewport, que NO
  // cambia al abrir el teclado, y el IME tapa el input independientemente del padding interno.
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof globalThis.document === 'undefined') {
      return undefined;
    }
    const doc = globalThis.document;
    const STYLE_ID = '__nutria_kb_aware_root__';
    let styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.textContent =
        'html,body,#root,#root>div{height:100dvh!important;min-height:100dvh!important;max-height:100dvh!important;}';
      doc.head.appendChild(styleEl);
    }
    let metaEl = doc.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    const previousMetaContent = metaEl?.getAttribute('content') ?? null;
    if (!metaEl) {
      metaEl = doc.createElement('meta');
      metaEl.setAttribute('name', 'viewport');
      doc.head.appendChild(metaEl);
    }
    const desiredMeta =
      'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';
    if (previousMetaContent !== desiredMeta) {
      metaEl.setAttribute('content', desiredMeta);
    }
    return () => {
      styleEl?.remove();
      if (metaEl && previousMetaContent != null && previousMetaContent !== desiredMeta) {
        metaEl.setAttribute('content', previousMetaContent);
      }
    };
  }, [active]);

  // Web: cuanto del viewport queda tapado por el teclado virtual (visualViewport)
  // y respaldo global focusin -> scrollIntoView (por si el onFocus del componente no llega).
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof globalThis.window === 'undefined') {
      webKeyboardOverlapRef.current = 0;
      setWebKeyboardOverlap(0);
      focusedWebElRef.current = null;
      return undefined;
    }
    const w = globalThis.window;
    const doc = globalThis.document;
    const vv = w.visualViewport;
    const sync = () => {
      if (!vv) return;
      const overlap = Math.max(0, w.innerHeight - vv.height - vv.offsetTop);
      const rounded = Math.round(overlap);
      webKeyboardOverlapRef.current = rounded;
      setWebKeyboardOverlap(rounded);
      // Si hay un input enfocado y el visualViewport cambia (el IME apareció/cambió de
      // tamaño), reposiciona el campo encima del teclado: scrollIntoView inicial puede
      // haberse disparado antes de que el teclado terminase de animar.
      if (focusedWebElRef.current) {
        ensureWebFocusedInputVisible();
      }
    };
    const isEditable = (el: HTMLElement | null): el is HTMLElement => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
    };
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target as HTMLElement | null;
      if (!isEditable(el)) return;
      focusedWebElRef.current = el;
      // Reintentos para cubrir la animación del IME (el visualViewport tarda en estabilizarse).
      WEB_FOCUS_SCROLL_DELAYS_MS.forEach((delay) =>
        w.setTimeout(() => {
          if (doc?.activeElement === el) {
            ensureWebFocusedInputVisible();
          }
        }, delay),
      );
    };
    const onFocusOut = (event: FocusEvent) => {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (focusedWebElRef.current === el) {
        focusedWebElRef.current = null;
      }
      try {
        el.style.scrollMarginBottom = '';
      } catch {
        /* nada */
      }
    };
    if (vv) {
      vv.addEventListener('resize', sync);
      vv.addEventListener('scroll', sync);
      sync();
    }
    doc?.addEventListener('focusin', onFocusIn);
    doc?.addEventListener('focusout', onFocusOut);
    return () => {
      if (vv) {
        vv.removeEventListener('resize', sync);
        vv.removeEventListener('scroll', sync);
      }
      doc?.removeEventListener('focusin', onFocusIn);
      doc?.removeEventListener('focusout', onFocusOut);
      webKeyboardOverlapRef.current = 0;
      setWebKeyboardOverlap(0);
      focusedWebElRef.current = null;
    };
  }, [active, ensureWebFocusedInputVisible]);

  useEffect(() => {
    if (!active) {
      keyboardMetricsRef.current = { height: 0 };
      setKeyboardMetrics({ height: 0 });
      focusedTargetRef.current = null;
      return undefined;
    }
    if (Platform.OS === 'web') {
      return undefined;
    }

    const winH = () => Dimensions.get('window').height;
    const showName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const hideDelay = Platform.OS === 'android' ? ANDROID_HIDE_DELAY_MS : 0;

    const onShow = (event: KeyboardEvent) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      const ec = event.endCoordinates;
      const h = ec?.height ?? 0;
      const w = winH();
      // screenY: borde superior del teclado (iOS/Android en RN)
      const topY = ec != null && typeof ec.screenY === 'number' ? ec.screenY : w - h;
      const next = { height: h, screenY: topY };
      keyboardMetricsRef.current = next;
      setKeyboardMetrics(next);
      scheduleScrollFocusedInputIntoView();
    };

    const onHide = () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        keyboardMetricsRef.current = { height: 0 };
        setKeyboardMetrics({ height: 0 });
        focusedTargetRef.current = null;
        hideTimerRef.current = null;
      }, hideDelay);
    };

    const show = Keyboard.addListener(showName, onShow);
    const hide = Keyboard.addListener(hideName, onHide);

    return () => {
      show.remove();
      hide.remove();
      clearScrollTimers();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [active, clearScrollTimers, scheduleScrollFocusedInputIntoView]);

  const paddingKeyboardHeight =
    !active
      ? 0
      : Platform.OS === 'web'
        ? webKeyboardOverlap
        : Platform.OS === 'android'
          ? keyboardMetrics.height
          : 0;

  return {
    /** Insets bajo el ScrollView: Android (IME) y web (visualViewport). iOS: 0 (usa KAV). */
    keyboardHeight: paddingKeyboardHeight,
    onScroll: handleScroll,
    onTextInputFocus: handleTextInputFocus,
    scrollEventThrottle: 16,
    scrollViewRef,
  };
}
