import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { AppText } from './AppText';
import { useTheme } from './theme';

interface Props {
  data: ReadonlyArray<number | null>;
  height?: number;
  formatTick: (value: number) => string;
  emptyLabel: string;
  startLabel?: string;
  endLabel?: string;
  minSpan?: number;
  color?: string;
  band?: { low: number; high: number } | null;
  domain?: { min: number; max: number } | null;
  guide?: number | null;
  testID?: string;
}

const AXIS_WIDTH = 40;
const PAD_Y = 8;
const PAD_X = 6;

export function LineChart({ data, height = 120, formatTick, emptyLabel, startLabel, endLabel, minSpan = 1, color, band = null, domain = null, guide = null, testID }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const values = data.filter((v): v is number => v !== null);

  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);

  if (values.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }} testID={testID}>
        <AppText variant="label" muted>
          {emptyLabel}
        </AppText>
      </View>
    );
  }

  const lineColor = color ?? colors.accent;
  const lo = Math.min(...values, ...(band ? [band.low] : []));
  const hi = Math.max(...values, ...(band ? [band.high] : []));
  const pad = Math.max((hi - lo) * 0.15, (minSpan - (hi - lo)) / 2, 0);
  const min = domain ? Math.min(domain.min, lo) : lo - pad;
  const max = domain ? Math.max(domain.max, hi) : hi + pad;
  const span = max - min || 1;
  const plotH = height - PAD_Y * 2;
  const x = (i: number): number => (data.length <= 1 ? width / 2 : PAD_X + (i / (data.length - 1)) * (width - PAD_X * 2));
  const y = (v: number): number => PAD_Y + plotH - ((v - min) / span) * plotH;

  const segments: string[] = [];
  let current = '';
  data.forEach((v, i) => {
    if (v === null) {
      if (current) segments.push(current);
      current = '';
    } else {
      current += `${current ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    }
  });
  if (current) segments.push(current);

  const lastIndex = data.length - 1 - [...data].reverse().findIndex((v) => v !== null);
  const lastValue = data[lastIndex] ?? null;

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
              {[0, 0.5, 1].map((f) => (
                <Line key={f} x1={0} x2={width} y1={PAD_Y + plotH * f} y2={PAD_Y + plotH * f} stroke={colors.grid} strokeWidth={1} />
              ))}
              {band ? (
                <Rect x={0} y={y(band.high)} width={width} height={Math.max(2, y(band.low) - y(band.high))} fill={lineColor} opacity={0.14} />
              ) : null}
              {guide !== null ? (
                <Line testID={testID ? `${testID}-guide` : undefined} x1={0} x2={width} y1={y(guide)} y2={y(guide)} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="3 4" />
              ) : null}
              {segments.map((d) => (
                <Path key={d} d={d} stroke={lineColor} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {data.length <= 40
                ? data.map((v, i) =>
                    v === null ? null : <Circle key={i} cx={x(i)} cy={y(v)} r={i === lastIndex ? 4.5 : 2} fill={lineColor} />,
                  )
                : lastValue !== null && <Circle cx={x(lastIndex)} cy={y(lastValue)} r={4.5} fill={lineColor} />}
            </Svg>
          ) : null}
        </View>
      </View>
      {startLabel || endLabel ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: AXIS_WIDTH }}>
          <AppText variant="caption" muted>
            {startLabel}
          </AppText>
          <AppText variant="caption" muted>
            {endLabel}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
