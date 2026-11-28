import { useState, type ReactElement } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from './theme';

interface Props {
  data: ReadonlyArray<number | null>;
  color?: string;
  height?: number;
  width?: number;
  baseline?: boolean;
  endDot?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

const PAD = 3;

export function sparkPath(data: ReadonlyArray<number | null>, width: number, height: number): string[] {
  const values = data.filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length === 0 || width <= 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number): number => (data.length <= 1 ? width / 2 : PAD + (i / (data.length - 1)) * (width - PAD * 2));
  const y = (v: number): number => (hi === lo ? height / 2 : height - PAD - ((v - lo) / span) * (height - PAD * 2));
  const segments: string[] = [];
  let current = '';
  data.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (current) segments.push(current);
      current = '';
    } else {
      current += `${current ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    }
  });
  if (current) segments.push(current);
  return segments;
}

export function Sparkline({ data, color, height = 32, width: fixedWidth, baseline = false, endDot = false, accessibilityLabel, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const [measured, setMeasured] = useState(0);
  const width = fixedWidth ?? measured;
  const onLayout = (event: LayoutChangeEvent): void => setMeasured(event.nativeEvent.layout.width);
  const stroke = color ?? colors.accent;
  const segments = sparkPath(data, width, height);
  const lastIndex = data.length - 1 - [...data].reverse().findIndex((v) => v !== null);
  const values = data.filter((v): v is number => v !== null);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const last = data[lastIndex] ?? null;
  const lastX = data.length <= 1 ? width / 2 : PAD + (lastIndex / (data.length - 1)) * (width - PAD * 2);
  const lastY = last === null ? 0 : hi === lo ? height / 2 : height - PAD - ((last - lo) / (hi - lo)) * (height - PAD * 2);
  return (
    <View
      testID={testID}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      onLayout={fixedWidth === undefined ? onLayout : undefined}
      style={{ height, width: fixedWidth }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {baseline ? <Line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke={colors.grid} strokeWidth={1} /> : null}
          {segments.map((d) => (
            <Path key={d} d={d} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {endDot && last !== null ? <Circle cx={lastX} cy={lastY} r={3.5} fill={colors.background} stroke={stroke} strokeWidth={2} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}
