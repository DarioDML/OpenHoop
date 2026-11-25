import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import type { TimelineDay } from '@/data/cycle';
import { AppText } from '@/ui/AppText';
import { useTheme } from '@/ui/theme';

interface Props {
  days: readonly TimelineDay[];
  height?: number;
  formatTick: (value: number) => string;
  emptyLabel: string;
  startLabel: string;
  endLabel: string;
  testID?: string;
}

const AXIS_WIDTH = 44;
const PAD_Y = 10;
const FLOW_OPACITY = { 1: 0.22, 2: 0.4, 3: 0.6 } as const;

export function CycleTimeline({ days, height = 140, formatTick, emptyLabel, startLabel, endLabel, testID }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const values = days.map((day) => day.deviationC).filter((value): value is number => value !== null);
  const hasPeriods = days.some((day) => day.flow !== null);

  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);

  if (values.length === 0 && !hasPeriods) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }} testID={testID}>
        <AppText variant="label" muted>
          {emptyLabel}
        </AppText>
      </View>
    );
  }

  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const pad = Math.max((hi - lo) * 0.15, (0.6 - (hi - lo)) / 2);
  const min = lo - pad;
  const max = hi + pad;
  const span = max - min || 1;
  const plotH = height - PAD_Y * 2;
  const step = width / Math.max(days.length, 1);
  const x = (i: number): number => (i + 0.5) * step;
  const y = (value: number): number => PAD_Y + plotH - ((value - min) / span) * plotH;

  const segments: string[] = [];
  let current = '';
  days.forEach((day, i) => {
    if (day.deviationC === null) {
      if (current) segments.push(current);
      current = '';
    } else {
      current += `${current ? 'L' : 'M'}${x(i).toFixed(1)} ${y(day.deviationC).toFixed(1)}`;
    }
  });
  if (current) segments.push(current);

  return (
    <View testID={testID} style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', height }}>
        <View style={{ width: AXIS_WIDTH, justifyContent: 'space-between', paddingVertical: 2 }}>
          <AppText variant="caption" muted numeric>
            {formatTick(max)}
          </AppText>
          <AppText variant="caption" muted numeric>
            {formatTick(min)}
          </AppText>
        </View>
        <View style={{ flex: 1 }} onLayout={onLayout}>
          {width > 0 ? (
            <Svg width={width} height={height}>
              {days.map((day, i) =>
                day.flow === null ? null : (
                  <Rect key={day.day} x={i * step} y={0} width={Math.max(step, 2)} height={height} fill={colors.negative} opacity={FLOW_OPACITY[day.flow]} />
                ),
              )}
              <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={colors.grid} strokeWidth={1} />
              {segments.map((d) => (
                <Path key={d} d={d} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {days.length <= 40
                ? days.map((day, i) => (day.deviationC === null ? null : <Circle key={day.day} cx={x(i)} cy={y(day.deviationC)} r={2} fill={colors.accent} />))
                : null}
            </Svg>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: AXIS_WIDTH }}>
        <AppText variant="caption" muted>
          {startLabel}
        </AppText>
        <AppText variant="caption" muted>
          {endLabel}
        </AppText>
      </View>
    </View>
  );
}
