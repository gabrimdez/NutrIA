import React, { useMemo } from 'react';
import {
  Image,
  ImageBackground,
  Platform,
  StyleSheet,
  useWindowDimensions,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

const AUTH_BG = require('../../assets/images/auth-bg.jpg');

type Props = {
  animatedStyle?: AnimatedStyle<ViewStyle>;
};

function resolveAuthBgDimensions(): { width: number; height: number } | null {
  if (typeof Image.resolveAssetSource !== 'function') {
    return null;
  }
  const asset = Image.resolveAssetSource(AUTH_BG);
  if (!asset?.width || !asset?.height) {
    return null;
  }
  return { width: asset.width, height: asset.height };
}

/** Motivo a la izquierda, copy space oscuro a la derecha (calabazas / encuadre tipo flat lay). */
const ANCHOR_PAN_X = -0.055;
const ANCHOR_PAN_Y = 0.03;

/**
 * Fondo tipo "cover" con recorte ligeramente desplazado respecto al centro geométrico
 * para alinear mejor el motivo (misma idea que object-fit: cover + object-position).
 * En web se usa `ImageBackground` + object-position.
 */
export function AuthBackgroundImage({ animatedStyle }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const intrinsic = useMemo(() => resolveAuthBgDimensions(), []);

  const nativeImageStyle = useMemo(() => {
    if (isWeb || !intrinsic || !W || !H) {
      return StyleSheet.absoluteFillObject;
    }
    const { width: iw, height: ih } = intrinsic;
    const scale = Math.max(W / iw, H / ih);
    const imgW = iw * scale;
    const imgH = ih * scale;
    const overflowX = imgW - W;
    const overflowY = imgH - H;
    const panX = overflowX > 0 ? overflowX * ANCHOR_PAN_X : 0;
    const panY = overflowY > 0 ? overflowY * ANCHOR_PAN_Y : 0;
    return {
      position: 'absolute' as const,
      width: imgW,
      height: imgH,
      left: (W - imgW) / 2 + panX,
      top: (H - imgH) / 2 + panY,
    };
  }, [isWeb, intrinsic, W, H]);

  const shellStyle = [
    StyleSheet.absoluteFill,
    styles.clip,
    isWeb && styles.transformOriginCenter,
    animatedStyle,
  ];

  if (isWeb) {
    return (
      <Animated.View style={shellStyle}>
        <ImageBackground
          source={AUTH_BG}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          imageStyle={styles.webInnerImage}
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={shellStyle}>
      <Image source={AUTH_BG} style={nativeImageStyle} resizeMode="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  transformOriginCenter: { transformOrigin: '50% 50%' } as ViewStyle,
  /** Estilos del bitmap interno en react-native-web (object-fit / object-position) */
  webInnerImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: '38% 50%',
  } as ImageStyle,
});
