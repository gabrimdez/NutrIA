import { Alert, Platform } from 'react-native';

/**
 * Confirmación Cancelar + acción destructiva.
 * En web, `Alert.alert` con botones suele no mostrarse; usamos `window.confirm`.
 */
export function confirmTwoAction(
  title: string,
  message: string,
  destructiveText: string,
  onConfirm: () => void,
): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    const ok = window.confirm(`${title}\n\n${message}`);
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: destructiveText, style: 'destructive', onPress: onConfirm },
  ]);
}
