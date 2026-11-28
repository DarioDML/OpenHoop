import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { traceColumns, type TraceRange } from '@/data/ecg';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Props {
  samples: readonly number[];
  height?: number;
  range?: TraceRange | null;
  fraction?: number;
  grid?: boolean;
  testID?: string;
}

const PAD = 4;
const GRID_STEP = 12;

export function EcgTrace({ samples, height = 96, range = null, fraction = 1, grid = false, testID }: Props) {
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
          {grid
            ? [
                ...Array.from({ length: Math.floor(width / GRID_STEP) + 1 }, (_, i) => (
                  <Line key={`v${i}`} x1={i * GRID_STEP} x2={i * GRID_STEP} y1={0} y2={height} stroke={colors.ecg} strokeOpacity={i % 5 === 0 ? 0.22 : 0.1} strokeWidth={1} />
                )),
                ...Array.from({ length: Math.floor(height / GRID_STEP) + 1 }, (_, i) => (
                  <Line key={`h${i}`} x1={0} x2={width} y1={i * GRID_STEP} y2={i * GRID_STEP} stroke={colors.ecg} strokeOpacity={i % 5 === 0 ? 0.22 : 0.1} strokeWidth={1} />
                )),
              ]
            : <Line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke={colors.grid} strokeWidth={1} />}
          <Path d={path} stroke={colors.ecg} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}

interface PanelProps {
  children: ReactNode;
  testID?: string;
}

export function EcgPanel({ children, testID }: PanelProps) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ backgroundColor: colors.ecgPaper, borderRadius: radius.md, padding: spacing.sm, gap: spacing.md }}>
      {children}
    </View>
  );
}
