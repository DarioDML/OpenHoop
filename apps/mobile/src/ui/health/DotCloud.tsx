import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/ui/theme';

export interface CloudDot {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

export const CLOUD_CLEAR = 0.6;

export function cloudClearWidth(size: number): number {
  return Math.round(size * CLOUD_CLEAR * 0.75);
}

export function cloudDots(count: number, seed = 7): CloudDot[] {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const angle = next() * Math.PI * 2;
    const radius = CLOUD_CLEAR + (1 - CLOUD_CLEAR) * Math.sqrt(next());
    return { x: 0.5 + 0.5 * radius * Math.cos(angle), y: 0.5 + 0.5 * radius * Math.sin(angle), r: 1 + next() * 2.2, opacity: 0.25 + next() * 0.65 };
  });
}

const DOTS = cloudDots(170);

interface Props {
  size: number;
  color?: string;
  children?: ReactNode;
  testID?: string;
}

export function DotCloud({ size, color, children, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const fill = color ?? colors.positive;
  return (
    <View testID={testID} style={{ width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', width: size, height: size }}>
        <Svg width={size} height={size}>
          {DOTS.map((dot, i) => (
            <Circle key={i} cx={dot.x * size} cy={dot.y * size} r={dot.r} fill={fill} opacity={dot.opacity} />
          ))}
        </Svg>
      </View>
      {children}
    </View>
  );
}
