import React, { type PropsWithChildren } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { Surface } from './ui/Surface';
import { spacing } from '../theme';

type CardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  padding?: keyof typeof spacing;
}>;

/**
 * Agrupación visual suave. Preferir `Surface` o listas sin contenedor en pantallas nuevas.
 */
export function Card({ children, style, padding = 'md' }: CardProps) {
  return (
    <Surface variant="subtle" padding={padding} style={style}>
      {children}
    </Surface>
  );
}
