import { Platform } from 'react-native';

export function blurActiveElementOnWeb(): void {
  if (Platform.OS !== 'web') return;
  const active = globalThis.document?.activeElement as { blur?: () => void } | null | undefined;
  active?.blur?.();
}

/** En web: evita saltos en escritorio; en móvil con teclado, acerca el campo al área visible. */
export function scrollFocusedInputIntoViewOnWeb(delayMs = 120): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  globalThis.setTimeout(() => {
    const el = globalThis.document?.activeElement as HTMLElement | null | undefined;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const vv = window.visualViewport;
    const keyboardLikelyOpen =
      vv != null && vv.height < window.innerHeight * 0.88;
    if (keyboardLikelyOpen) {
      el.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'smooth' });
    } else {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, delayMs);
}
