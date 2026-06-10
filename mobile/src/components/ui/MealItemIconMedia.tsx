import React from 'react';
import { View, Text, Image, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import type { MealItemVisualIcon } from '../../lib/mealDisplay';

type MealItemIconMediaProps = {
  visual: MealItemVisualIcon;
  emojiStyle: StyleProp<TextStyle>;
  /** Lado del bitmap cuando `visual` es imagen */
  imageSize: number;
  /** Ancho mínimo de la casilla (alinea con columnas tipo `foodEmoji`) */
  minSlotWidth?: number;
};

/** Emoji en `Text` o PNG en `Image`, misma casilla que una fila de alimento. */
export function MealItemIconMedia({ visual, emojiStyle, imageSize, minSlotWidth }: MealItemIconMediaProps) {
  if (visual.kind === 'image') {
    const w = minSlotWidth ?? Math.max(imageSize + 10, 38);
    return (
      <View style={[styles.imageSlot, { width: w, minHeight: imageSize + 4 }]} accessibilityIgnoresInvertColors>
        <Image source={visual.source} style={{ width: imageSize, height: imageSize }} resizeMode="contain" />
      </View>
    );
  }
  return (
    <Text style={emojiStyle} allowFontScaling={false}>
      {visual.emoji}
    </Text>
  );
}

const styles = StyleSheet.create({
  imageSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
