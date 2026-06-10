import { useSyncExternalStore } from 'react';

export type EmailVerificationRequiredState = {
  visible: boolean;
  message: string;
};

const DEFAULT_MESSAGE = 'Verifica tu email antes de continuar.';
const INITIAL_STATE: EmailVerificationRequiredState = { visible: false, message: DEFAULT_MESSAGE };

let state: EmailVerificationRequiredState = INITIAL_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
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

export function showEmailVerificationRequired(message: string = DEFAULT_MESSAGE) {
  state = { visible: true, message };
  emit();
}

export function hideEmailVerificationRequired() {
  if (!state.visible) return;
  state = { ...state, visible: false };
  emit();
}

export function useEmailVerificationRequiredState(): EmailVerificationRequiredState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
