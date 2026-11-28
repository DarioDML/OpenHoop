import { useState, type ReactElement } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { traceColumns } from '@/data/ecg';
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
  const y = (value: number): number => PAD + (1 - (value - low) / (high - low)) * (height - 2 * PAD);
  const paths = series.map((s) => {
    const columns = traceColumns(s.values, Math.max(1, width));
    const step = columns.length > 1 ? width / (columns.length - 1) : 0;
    const d = columns.map((c, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${y(c.max).toFixed(1)} L${(i * step).toFixed(1)} ${y(c.min).toFixed(1)}`).join(' ');
    return { d, color: s.color };
  });
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
