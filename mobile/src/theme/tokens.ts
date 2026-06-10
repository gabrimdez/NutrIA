import { Platform, StyleSheet, type ViewStyle } from 'react-native';

export const screenPaddingX = 20;

export const iconSize = {
  sm: 20,
  md: 22,
  lg: 24,
} as const;

export const hairlineWidth = StyleSheet.hairlineWidth;

export const DOCK_H = 62;
export const DOCK_MARGIN_BOTTOM = 8;

/** Misma altura que el dock (`DOCK_H`); pill flotante alineada con `MainTabBarClone`. */
export const SEARCH_ACTION_BAR_H = DOCK_H;

export const timing = {
  fast: 200,
  normal: 300,
  slow: 500,
} as const;

export const pressedOpacity = 0.85;

/** Feedback táctil alineado con el FAB del diario (Tide + escala). */
export const primaryCtaPressed = {
  opacity: 0.85,
  transform: [{ scale: 0.95 }],
} as const;

/** RN Web depreca shadow* en style; usar boxShadow en web. */
export function platformBoxShadow(
  webCss: string,
  ios: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
  },
  androidElevation: number,
): ViewStyle {
  if (Platform.OS === 'web') {
    return { boxShadow: webCss };
  }
  if (Platform.OS === 'android') {
    return { elevation: androidElevation };
  }
  return ios as ViewStyle;
}

export const elevation = {
  fab: platformBoxShadow(
    '0 4px 16px rgba(0,0,0,0.35)',
    {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.30,
      shadowRadius: 10,
    },
    8,
  ),
  floating: platformBoxShadow(
    '0 6px 24px rgba(0,0,0,0.4)',
    {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
    },
    10,
  ),
  surface: platformBoxShadow(
    '0 2px 8px rgba(0,0,0,0.18)',
    {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.10,
      shadowRadius: 6,
    },
    2,
  ),
  soft: platformBoxShadow(
    '0 2px 6px rgba(0,0,0,0.15)',
    {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
    },
    2,
  ),
  card: platformBoxShadow(
    '0 1px 4px rgba(0,0,0,0.1)',
    {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    1,
  ),
} as const;

/** Degradado sobre foto (login / chat): ligeramente más claro para que se vea mejor el asset. */
export const authFotoGradientColors = [
  'transparent',
  'rgba(15,17,23,0.42)',
  'rgba(15,17,23,0.58)',
  '#151922',
] as const;

export const authFotoGradientLocations = [0, 0.25, 0.5, 0.7] as const;

/** Registro usa overlay un poco más fuerte que login, pero también aclarado respecto al anterior. */
export const authRegisterFotoGradientColors = [
  'transparent',
  'rgba(15,17,23,0.58)',
  'rgba(15,17,23,0.78)',
  '#151922',
] as const;
