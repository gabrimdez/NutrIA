import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// ---------------------------------------------------------------------------
// Frame assets – pre-required so Metro resolves them at build time.
// Grid: 3 cols × 4 rows = 12 frames, left-to-right, top-to-bottom.
// ---------------------------------------------------------------------------

const FRAMES: ImageSourcePropType[] = [
  require('../../assets/images/streak/nutria-frame-00.png'),
  require('../../assets/images/streak/nutria-frame-01.png'),
  require('../../assets/images/streak/nutria-frame-02.png'),
  require('../../assets/images/streak/nutria-frame-03.png'),
  require('../../assets/images/streak/nutria-frame-04.png'),
  require('../../assets/images/streak/nutria-frame-05.png'),
  require('../../assets/images/streak/nutria-frame-06.png'),
  require('../../assets/images/streak/nutria-frame-07.png'),
  require('../../assets/images/streak/nutria-frame-08.png'),
  require('../../assets/images/streak/nutria-frame-09.png'),
  require('../../assets/images/streak/nutria-frame-10.png'),
  require('../../assets/images/streak/nutria-frame-11.png'),
];

// ---------------------------------------------------------------------------
// Frame semantics (reference — not enforced at runtime)
//
//  0  eyes-open  look-left      1  eyes-half  centre       2  eyes-half  look-right
//  3  eyes-shut  look-left      4  eyes-shut  centre       5  eyes-shut  look-right
//  6  eyes-wide  look-left      7  eyes-wide  centre       8  eyes-wide  look-right
//  9  eyes-wide  alt-left      10  eyes-wide  alt-centre  11  wink       centre
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Idle timeline — hand-authored sequence that loops seamlessly.
// Each entry is [frameIndex, holdMs].
//
// The rhythm:  breathe (subtle scale), look around, blink, breathe, wink…
// Total cycle ≈ 6.4 s → loops smoothly without a visible seam.
// ---------------------------------------------------------------------------

const IDLE_TIMELINE: [frame: number, holdMs: number][] = [
  // Breathe in – eyes-open centre
  [7,  600],
  [1,  500],  // half-close (inhale peak)
  [7,  500],  // open back

  // Look left
  [6,  350],
  [0,  400],
  [6,  300],

  // Back to centre
  [7,  500],

  // Blink (shut → open)
  [4,  100],
  [3,  80],
  [4,  100],
  [7,  600],

  // Breathe out
  [1,  450],
  [7,  500],

  // Look right
  [8,  350],
  [2,  400],
  [8,  300],

  // Centre
  [7,  500],

  // Wink
  [11, 220],
  [10, 150],
  [7,  600],

  // Slow blink
  [1,  120],
  [4,  140],
  [1,  120],
  [7,  400],
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type NutriaIdleSpriteProps = {
  /** Display size (width = height). Default 200. */
  size?: number;
  /** Playback speed multiplier. 1 = normal, 0.5 = half-speed, 2 = double. */
  speed?: number;
  /** Whether the idle loop auto-plays. Default true. */
  autoplay?: boolean;
  /** If true, tapping the nutria triggers a playful reaction. Default true. */
  tappable?: boolean;
  /** Called when the user taps the sprite. */
  onTap?: () => void;
  /** Container style overrides. */
  style?: StyleProp<ViewStyle>;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NutriaIdleSprite({
  size = 200,
  speed = 1,
  autoplay = true,
  tappable = true,
  onTap,
  style,
}: NutriaIdleSpriteProps) {
  const [frame, setFrame] = useState(7); // default: eyes-wide centre
  const [isTapAnim, setIsTapAnim] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRef = useRef(0);
  const mountedRef = useRef(true);

  // Continuous subtle breathing via Animated scale
  const breathAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(1)).current;
  // Subtle sway via translateX
  const swayAnim = useRef(new Animated.Value(0)).current;

  // --- Breathing loop (scale 1 → 1.025 → 1, 3 s cycle) ---
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnim, {
          toValue: 1.025,
          duration: 1500 / speed,
          useNativeDriver: true,
        }),
        Animated.timing(breathAnim, {
          toValue: 1,
          duration: 1500 / speed,
          useNativeDriver: true,
        }),
      ]),
    );
    if (autoplay) loop.start();
    return () => loop.stop();
  }, [breathAnim, speed, autoplay]);

  // --- Sway loop (translateX -1.5 → 1.5 → -1.5, 4 s cycle) ---
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, {
          toValue: 1.5,
          duration: 2000 / speed,
          useNativeDriver: true,
        }),
        Animated.timing(swayAnim, {
          toValue: -1.5,
          duration: 2000 / speed,
          useNativeDriver: true,
        }),
      ]),
    );
    if (autoplay) loop.start();
    return () => loop.stop();
  }, [swayAnim, speed, autoplay]);

  // --- Idle frame timeline loop ---
  const scheduleNext = useCallback(() => {
    if (!mountedRef.current || isTapAnim) return;

    const idx = stepRef.current % IDLE_TIMELINE.length;
    const [f, ms] = IDLE_TIMELINE[idx];
    setFrame(f);
    stepRef.current = idx + 1;

    timerRef.current = setTimeout(() => {
      scheduleNext();
    }, ms / speed);
  }, [speed, isTapAnim]);

  useEffect(() => {
    mountedRef.current = true;
    if (autoplay && !isTapAnim) {
      scheduleNext();
    }
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoplay, scheduleNext, isTapAnim]);

  // --- Tap reaction ---
  const TAP_SEQUENCE: [number, number][] = [
    [6, 80], [0, 80], [7, 80], [8, 80], [2, 80],
    [7, 80], [11, 200], [10, 120], [7, 80],
    [4, 70], [3, 70], [4, 70], [7, 100],
  ];

  const handleTap = useCallback(() => {
    if (isTapAnim) return;
    onTap?.();
    setIsTapAnim(true);

    if (timerRef.current) clearTimeout(timerRef.current);

    Animated.sequence([
      Animated.timing(bounceAnim, {
        toValue: 0.88,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(bounceAnim, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();

    let step = 0;
    const tickTap = () => {
      if (!mountedRef.current) return;
      if (step < TAP_SEQUENCE.length) {
        const [f, ms] = TAP_SEQUENCE[step];
        setFrame(f);
        step++;
        timerRef.current = setTimeout(tickTap, ms / speed);
      } else {
        setIsTapAnim(false);
      }
    };
    tickTap();
  }, [isTapAnim, onTap, bounceAnim, speed]);

  // --- Render ---
  const imageNode = (
    <Animated.Image
      source={FRAMES[frame]}
      style={[
        { width: size, height: size },
        {
          transform: [
            { scale: Animated.multiply(breathAnim, bounceAnim) },
            { translateX: swayAnim },
          ],
        },
      ]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessibilityRole="image"
      accessibilityLabel="Nutria mascota animada"
    />
  );

  return (
    <View style={[styles.container, style]}>
      {tappable ? (
        <Pressable onPress={handleTap} accessibilityRole="button" accessibilityLabel="Tocar mascota">
          {imageNode}
        </Pressable>
      ) : (
        imageNode
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
