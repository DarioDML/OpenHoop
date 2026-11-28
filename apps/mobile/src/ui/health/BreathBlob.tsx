import { useEffect, useRef, type ReactElement } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/ui/theme';
import { useReduceMotion } from '@/ui/useReduceMotion';

const POINTS = 72;
const LOBES = 4;

export function blobPath(size: number, depth: number, phase = 0): string {
  const c = size / 2;
  const radius = (size / 2) * (1 - depth);
  let d = '';
  for (let i = 0; i <= POINTS; i++) {
    const angle = (i / POINTS) * Math.PI * 2;
    const r = radius * (1 + depth * Math.cos(LOBES * angle + phase));
    const x = c + r * Math.cos(angle);
    const y = c + r * Math.sin(angle);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

interface Props {
  size: number;
  target: number;
  durationMs: number;
  testID?: string;
}

export const BLOB_MIN = 0.6;

export function BreathBlob({ size, target, durationMs, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(target)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scale.stopAnimation();
    if (reduce || durationMs <= 0) {
      scale.setValue(target);
      return;
    }
    Animated.timing(scale, { toValue: target, duration: durationMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start();
  }, [target, durationMs, reduce, scale]);

  useEffect(() => {
    if (reduce) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 24_000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduce, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  const inner = scale.interpolate({ inputRange: [BLOB_MIN, 1], outputRange: [0.5, 0.68] });

  return (
    <View testID={testID} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', width: size, height: size, transform: [{ scale }, { rotate }] }}>
        <Svg width={size} height={size}>
          <Path d={blobPath(size, 0.09)} fill={colors.accentSoft} stroke={colors.info} strokeWidth={3} />
        </Svg>
      </Animated.View>
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', width: size, height: size, transform: [{ scale: inner }, { rotate }] }}>
        <Svg width={size} height={size}>
          <Path d={blobPath(size, 0.07, Math.PI / 4)} fill={colors.info} opacity={0.45} />
        </Svg>
      </Animated.View>
    </View>
  );
}
