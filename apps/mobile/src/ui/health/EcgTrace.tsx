import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { traceColumns } from '@/data/ecg';
import { useTheme } from '@/ui/theme';

interface Props {
  samples: readonly number[];
  height?: number;
  testID?: string;
}

const PAD = 4;

export function EcgTrace({ samples, height = 96, testID }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(Math.round(event.nativeEvent.layout.width));
  const columns = traceColumns(samples, Math.max(1, width));
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const column of columns) {
    low = Math.min(low, column.min);
    high = Math.max(high, column.max);
  }
  const span = high > low ? high - low : 1;
  const y = (value: number): number => PAD + (1 - (value - low) / span) * (height - 2 * PAD);
  const step = columns.length > 1 ? width / (columns.length - 1) : 0;
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
