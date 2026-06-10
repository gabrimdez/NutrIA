import { TextStyle } from 'react-native';

export const typography: Record<string, TextStyle> = {
  screenTitle: { fontSize: 30, fontWeight: '700', lineHeight: 36, letterSpacing: -0.5 },
  sectionTitle: { fontSize: 17, fontWeight: '600', lineHeight: 22, letterSpacing: -0.2 },
  h1: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  h2: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  h3: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 16, letterSpacing: 0.5 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  captionBold: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  small: { fontSize: 11, fontWeight: '400', lineHeight: 14 },
  micro: { fontSize: 10, fontWeight: '500', lineHeight: 13 },
  metricXl: { fontSize: 40, fontWeight: '700', lineHeight: 46, letterSpacing: -1 },
  metricLg: { fontSize: 32, fontWeight: '700', lineHeight: 38, letterSpacing: -0.8 },
  metricMd: { fontSize: 22, fontWeight: '700', lineHeight: 28, letterSpacing: -0.4 },
  metricSm: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  number: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  numberSmall: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
};
