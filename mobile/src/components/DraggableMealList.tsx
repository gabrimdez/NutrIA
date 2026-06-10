import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { colors, spacing } from '../theme';

const SPRING = { damping: 20, stiffness: 200, mass: 0.8 };
const DRAG_SCALE = 1.03;
const DRAG_ELEVATION = 12;
const ACTIVATE_MS = 350;

type Props = {
  meals: { key: string; node: React.ReactNode }[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  enabled: boolean;
};

function triggerHaptic() {
  if (Platform.OS !== 'web') {
    try { const { Vibration } = require('react-native'); Vibration.vibrate(25); } catch {}
  }
}

function DraggableItem({
  index,
  node,
  enabled,
  heights: heightsRef,
  onDragStart,
  onDragMove,
  onDragEnd,
  isDragging,
  dragIndex,
  hoverIndex,
  totalItems,
}: {
  index: number;
  node: React.ReactNode;
  enabled: boolean;
  heights: React.MutableRefObject<number[]>;
  onDragStart: (idx: number) => void;
  onDragMove: (translationY: number, startIdx: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  dragIndex: number;
  hoverIndex: number;
  totalItems: number;
}) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIdx = useSharedValue(0);
  const opacity = useSharedValue(1);
  const isActive = useSharedValue(false);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      heightsRef.current[index] = e.nativeEvent.layout.height;
    },
    [index, heightsRef],
  );

  const longPress = Gesture.LongPress()
    .minDuration(ACTIVATE_MS)
    .enabled(enabled && totalItems > 1)
    .onStart(() => {
      isActive.value = true;
      scale.value = withSpring(DRAG_SCALE, SPRING);
      zIdx.value = 100;
      opacity.value = 0.92;
      runOnJS(triggerHaptic)();
      runOnJS(onDragStart)(index);
    });

  const pan = Gesture.Pan()
    .enabled(enabled && totalItems > 1)
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (isActive.value) state.activate();
      else state.fail();
    })
    .onUpdate((e) => {
      if (!isActive.value) return;
      translateY.value = e.translationY;
      runOnJS(onDragMove)(e.translationY, index);
    })
    .onEnd(() => {
      if (!isActive.value) return;
      isActive.value = false;
      translateY.value = withSpring(0, SPRING);
      scale.value = withSpring(1, SPRING);
      zIdx.value = 0;
      opacity.value = withTiming(1, { duration: 150 });
      runOnJS(onDragEnd)();
    })
    .onFinalize(() => {
      // Reset visual state if gesture cancelled without onEnd firing
      translateY.value = withSpring(0, SPRING);
      scale.value = withSpring(1, SPRING);
      zIdx.value = 0;
      opacity.value = withTiming(1, { duration: 150 });
      if (isActive.value) {
        isActive.value = false;
        runOnJS(onDragEnd)();
      }
    });

  const composed = Gesture.Simultaneous(longPress, pan);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIdx.value,
    opacity: opacity.value,
  }));

  const isBeingDisplaced = isDragging && index !== dragIndex;
  const displacement = (() => {
    if (!isBeingDisplaced) return 0;
    if (dragIndex < index && hoverIndex >= index) {
      return -(heightsRef.current[dragIndex] || 0) - spacing.md;
    }
    if (dragIndex > index && hoverIndex <= index) {
      return (heightsRef.current[dragIndex] || 0) + spacing.md;
    }
    return 0;
  })();

  const displacedStyle = useAnimatedStyle(() => {
    if (index === dragIndex && isDragging) return {};
    return {
      transform: [{ translateY: withSpring(displacement, SPRING) }],
    };
  }, [displacement, isDragging, dragIndex, index]);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        onLayout={onLayout}
        style={[
          s.itemWrap,
          animStyle,
          isBeingDisplaced ? displacedStyle : undefined,
          isDragging && index === dragIndex && s.draggingItem,
        ]}
      >
        {node}
      </Animated.View>
    </GestureDetector>
  );
}

export function DraggableMealList({ meals, onReorder, enabled }: Props) {
  const heights = useRef<number[]>([]);
  const [dragIndex, setDragIndex] = useState(-1);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const isDragging = dragIndex >= 0;

  const handleDragStart = useCallback((idx: number) => {
    setDragIndex(idx);
    setHoverIndex(idx);
  }, []);

  const handleDragMove = useCallback(
    (translationY: number, startIdx: number) => {
      const h = heights.current;
      let accumulated = 0;
      let target = startIdx;

      if (translationY > 0) {
        for (let i = startIdx + 1; i < meals.length; i++) {
          accumulated += (h[i] || 80) + spacing.md;
          if (translationY > accumulated - (h[i] || 80) / 2) target = i;
          else break;
        }
      } else {
        for (let i = startIdx - 1; i >= 0; i--) {
          accumulated -= (h[i] || 80) + spacing.md;
          if (translationY < accumulated + (h[i] || 80) / 2) target = i;
          else break;
        }
      }

      setHoverIndex(target);
    },
    [meals.length],
  );

  const handleDragEnd = useCallback(() => {
    const from = dragIndex;
    const to = hoverIndex;
    setDragIndex(-1);
    setHoverIndex(-1);
    if (from >= 0 && to >= 0 && from !== to) {
      onReorder(from, to);
    }
  }, [dragIndex, hoverIndex, onReorder]);

  return (
    <View style={s.container}>
      {meals.map((item, i) => (
        <DraggableItem
          key={item.key}
          index={i}
          node={item.node}
          enabled={enabled}
          heights={heights}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          isDragging={isDragging}
          dragIndex={dragIndex}
          hoverIndex={hoverIndex}
          totalItems={meals.length}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: {},
  itemWrap: {},
  draggingItem: {
    ...(Platform.OS === 'web'
      ? { boxShadow: `0 ${DRAG_ELEVATION}px ${DRAG_ELEVATION}px rgba(56, 236, 180, 0.25)` }
      : {
          shadowColor: colors.primaryLight,
          shadowOffset: { width: 0, height: DRAG_ELEVATION },
          shadowOpacity: 0.25,
          shadowRadius: DRAG_ELEVATION,
          elevation: DRAG_ELEVATION,
        }),
  } as any,
});
