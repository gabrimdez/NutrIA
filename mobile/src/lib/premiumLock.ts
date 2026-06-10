import { useSyncExternalStore } from 'react';

export type PremiumLockOptions = {
  featureName?: string;
  title?: string;
  message?: string;
  perks?: string[];
  ctaLabel?: string;
  dismissLabel?: string;
  /** Acción al cerrar (sin pulsar el CTA). */
  onDismiss?: () => void;
  /** Acción al pulsar "Desbloquear"; si no se pasa, navega a /(tabs)/premium. */
  onUpgrade?: () => void;
};

export type PremiumLockState = {
  visible: boolean;
  options: PremiumLockOptions;
};

const INITIAL_STATE: PremiumLockState = { visible: false, options: {} };

let state: PremiumLockState = INITIAL_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

/** Abre el modal global de Premium con las opciones indicadas. */
export function showPremiumLock(options: PremiumLockOptions = {}) {
  state = { visible: true, options };
  emit();
}

/** Cierra el modal global. */
export function hidePremiumLock() {
  if (!state.visible) return;
  state = { visible: false, options: state.options };
  emit();
}

export function usePremiumLockState(): PremiumLockState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
