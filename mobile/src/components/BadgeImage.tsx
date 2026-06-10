import React from 'react';
import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

type Props = {
  uri: string;
  style?: StyleProp<ImageStyle>;
};

/** PNG remotos con alpha: RN `Image` en Android suele pintar rectángulo negro; expo-image no. */
export function BadgeImage({ uri, style }: Props) {
  return (
    <Image
      source={{ uri }}
      style={[{ backgroundColor: 'transparent' }, style]}
      contentFit="contain"
      cachePolicy="disk"
      recyclingKey={uri}
    />
  );
}
