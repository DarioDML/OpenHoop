import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { traceColumns, type TraceRange } from '@/data/ecg';
import { useTheme } from '@/ui/theme';

interface Props {
  samples: readonly number[];
  height?: number;
  range?: TraceRange | null;
  fraction?: number;
  testID?: string;
}

const PAD = 4;

export function EcgTrace({ samples, height = 96, range = null, fraction = 1, testID }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(Math.round(event.nativeEvent.layout.width));
  const drawn = Math.max(1, Math.round(width * Math.min(1, Math.max(0, fraction))));
  const columns = traceColumns(samples, drawn);
  let low = range?.low ?? Number.POSITIVE_INFINITY;
  let high = range?.high ?? Number.NEGATIVE_INFINITY;
  if (range === null) {
    for (const column of columns) {
      low = Math.min(low, column.min);
      high = Math.max(high, column.max);
    }
  }
  const span = high > low ? high - low : 1;
  const clamp = (value: number): number => Math.min(high, Math.max(low, value));
  const y = (value: number): number => PAD + (1 - (clamp(value) - low) / span) * (height - 2 * PAD);
  const step = columns.length > 1 ? drawn / (columns.length - 1) : 0;
  const path = columns
    .map((column, i) => {
      const x = (i * step).toFixed(1);
      return `${i === 0 ? 'M' : 'L'}${x} ${y(column.max).toFixed(1)} L${x} ${y(column.min).toFixed(1)}`;
    })
    .join(' ');
  return (
    <View testID={testID} onLayout={onLayout} style={{ height }} accessible accessibilityRole="image">
      {width > 0 && columns.length > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke={colors.grid} strokeWidth={1} />
          <Path d={path} stroke={colors.pink} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}
