import { useState, type ReactElement } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { useTheme } from '@/ui/theme';

export interface TraceSeries {
  values: readonly number[];
  color: string;
}

interface Props {
  series: readonly TraceSeries[];
  height?: number;
  label: string;
  testID?: string;
}

const PAD = 4;

export function tracePath(values: readonly number[], width: number, height: number, low: number, high: number): string {
  const columns = Math.max(1, Math.min(Math.round(width), values.length));
  const span = high > low ? high - low : 1;
  const y = (v: number): string => (PAD + (1 - (v - low) / span) * (height - 2 * PAD)).toFixed(1);
  const step = columns > 1 ? width / (columns - 1) : 0;
  const parts: string[] = [];
  let drawing = false;
  for (let c = 0; c < columns; c++) {
    const from = Math.floor((c * values.length) / columns);
    const to = Math.max(from + 1, Math.floor(((c + 1) * values.length) / columns));
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = from; i < to; i++) {
      const v = values[i];
      if (v === undefined || !Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min)) {
      drawing = false;
      continue;
    }
    const x = (c * step).toFixed(1);
    parts.push(`${drawing ? 'L' : 'M'}${x} ${y(max)} L${x} ${y(min)}`);
    drawing = true;
  }
  return parts.join(' ');
}

function bounds(series: readonly TraceSeries[]): { low: number; high: number } {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    for (const v of s.values) {
      if (!Number.isFinite(v)) continue;
      if (v < low) low = v;
      if (v > high) high = v;
    }
  }
  if (!Number.isFinite(low)) return { low: -1, high: 1 };
  return high > low ? { low, high } : { low: low - 1, high: high + 1 };
}

export function SignalTrace({ series, height = 56, label, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(Math.round(event.nativeEvent.layout.width));
  const { low, high } = bounds(series);
  const paths = series.map((s) => ({ d: tracePath(s.values, Math.max(1, width), height, low, high), color: s.color }));
  return (
    <View testID={testID} onLayout={onLayout} style={{ height }} accessible accessibilityRole="image" accessibilityLabel={label}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke={colors.grid} strokeWidth={1} />
          {paths.map((p, i) => (
            <Path key={i} d={p.d} stroke={p.color} strokeWidth={1.4} fill="none" strokeLinejoin="round" />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
