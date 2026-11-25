import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import type { HeartRatePoint } from '@/data/types';
import { formatClock } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { useTheme } from '@/ui/theme';

export interface ChartBand {
  from: number;
  to: number;
  kind: 'sleep' | 'workout';
}

interface Props {
  points: readonly HeartRatePoint[];
  startS: number;
  endS: number;
  tzOffsetS: number;
  bands: readonly ChartBand[];
  bucketS: number;
  height?: number;
  emptyLabel: string;
  testID?: string;
}

const PAD_Y = 10;
const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

export function HeartRateChart({ points, startS, endS, tzOffsetS, bands, bucketS, height = 180, emptyLabel, testID }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);

  if (points.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }} testID={testID}>
        <AppText variant="label" muted>
          {emptyLabel}
        </AppText>
      </View>
    );
  }

  const values = points.map((p) => p.hr);
  const lo = Math.floor(Math.min(...values) / 10) * 10 - 10;
  const hi = Math.ceil(Math.max(...values) / 10) * 10 + 10;
  const span = Math.max(1, endS - startS);
  const plotH = height - PAD_Y * 2;
  const x = (t: number): number => ((t - startS) / span) * width;
  const y = (hr: number): number => PAD_Y + plotH - ((hr - lo) / (hi - lo)) * plotH;

  let path = '';
  let previous: number | null = null;
  for (const point of points) {
    const connected = previous !== null && point.t - previous <= bucketS * 3;
    path += `${connected ? 'L' : 'M'}${x(point.t).toFixed(1)} ${y(point.hr).toFixed(1)}`;
    previous = point.t;
  }

  return (
    <View testID={testID} style={{ gap: 6 }}>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {bands.map((band, index) => {
              const left = Math.max(0, x(band.from));
              const right = Math.min(width, x(band.to));
              if (right <= left) return null;
              return (
                <Rect
                  key={`${band.kind}-${index}`}
                  x={left}
                  y={0}
                  width={right - left}
                  height={height}
                  fill={band.kind === 'sleep' ? colors.stage.light : colors.metric.load}
                  opacity={0.18}
                />
              );
            })}
            {TICKS.map((fraction) => (
              <Line key={fraction} x1={fraction * width} x2={fraction * width} y1={0} y2={height} stroke={colors.grid} strokeWidth={1} />
            ))}
            <Path d={path} fill="none" stroke={colors.negative} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {TICKS.map((fraction) => (
          <AppText key={fraction} variant="caption" muted numeric>
            {formatClock(Math.round(startS + fraction * span), tzOffsetS)}
          </AppText>
        ))}
      </View>
    </View>
  );
}
