import { useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { formatElapsed } from '@/data/activityDerived';
import { nearestPoint } from '@/data/heartRateView';
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
  axis?: 'clock' | 'elapsed';
  area?: boolean;
  scrubLabel?: (point: HeartRatePoint) => string;
  testID?: string;
}

const PAD_Y = 10;
const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;
const TICK_STEPS_S: readonly number[] = [60, 120, 300, 600, 900, 1_200, 1_800, 3_600, 7_200, 10_800, 21_600];
const LONGEST_STEP_S = 43_200;
const MAX_INNER_TICKS = 4;
const END_GAP = 0.1;
const LABEL_WIDTH = 60;

export function elapsedTicks(spanS: number): number[] {
  if (!(spanS > 0)) return [0];
  const step: number = TICK_STEPS_S.find((s) => Math.ceil(spanS / s) - 1 <= MAX_INNER_TICKS) ?? LONGEST_STEP_S;
  const inner: number[] = [];
  for (let t = step; t < spanS; t += step) if (spanS - t >= END_GAP * spanS) inner.push(t);
  return [0, ...inner, spanS];
}

export function HeartRateChart({ points, startS, endS, tzOffsetS, bands, bucketS, height = 180, emptyLabel, axis = 'clock', area = false, scrubLabel, testID }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<HeartRatePoint | null>(null);
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
  let fill = '';
  let runStart: number | null = null;
  let previous: number | null = null;
  const closeRun = (): void => {
    if (runStart !== null && previous !== null) fill += `L${x(previous).toFixed(1)} ${height}L${x(runStart).toFixed(1)} ${height}Z`;
  };
  for (const point of points) {
    const connected = previous !== null && point.t - previous <= bucketS * 3;
    const px = `${x(point.t).toFixed(1)} ${y(point.hr).toFixed(1)}`;
    path += `${connected ? 'L' : 'M'}${px}`;
    if (!connected) {
      closeRun();
      runStart = point.t;
      fill += `M${px}`;
    } else {
      fill += `L${px}`;
    }
    previous = point.t;
  }
  closeRun();
  const ticks = axis === 'elapsed' ? elapsedTicks(span) : null;
  const scrubbing = scrubLabel !== undefined;
  const pick = (event: GestureResponderEvent): void => {
    if (width <= 0) return;
    setActive(nearestPoint(points, startS + (event.nativeEvent.locationX / width) * span));
  };

  return (
    <View testID={testID} style={{ gap: 6 }}>
      {scrubbing ? (
        <AppText variant="label" numeric muted={active === null} testID={testID ? `${testID}-scrub` : undefined} style={{ minHeight: 18 }}>
          {active === null ? ' ' : scrubLabel(active)}
        </AppText>
      ) : null}
      <View
        onLayout={onLayout}
        style={{ height }}
        testID={testID ? `${testID}-touch` : undefined}
        {...(scrubbing
          ? {
              onStartShouldSetResponder: () => true,
              onResponderGrant: pick,
              onResponderMove: pick,
              onResponderRelease: () => setActive(null),
              onResponderTerminate: () => setActive(null),
              onResponderTerminationRequest: () => true,
            }
          : {})}>
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
            {ticks === null
              ? TICKS.map((fraction) => (
                  <Line key={fraction} x1={fraction * width} x2={fraction * width} y1={0} y2={height} stroke={colors.grid} strokeWidth={1} />
                ))
              : [0.5].map((fraction) => (
                  <Line key={fraction} x1={0} x2={width} y1={PAD_Y + plotH * fraction} y2={PAD_Y + plotH * fraction} stroke={colors.grid} strokeWidth={1} />
                ))}
            {area ? <Path d={fill} fill={colors.negative} opacity={0.2} /> : null}
            <Path d={path} fill="none" stroke={colors.negative} strokeWidth={area ? 2.25 : 1.75} strokeLinejoin="round" strokeLinecap="round" />
            {active === null ? null : (
              <>
                <Line x1={x(active.t)} x2={x(active.t)} y1={0} y2={height} stroke={colors.textMuted} strokeWidth={1} />
                <Circle cx={x(active.t)} cy={y(active.hr)} r={4.5} fill={colors.negative} stroke={colors.background} strokeWidth={2} />
              </>
            )}
          </Svg>
        ) : null}
      </View>
      {ticks === null ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {TICKS.map((fraction) => (
            <AppText key={fraction} variant="caption" muted numeric>
              {formatClock(Math.round(startS + fraction * span), tzOffsetS)}
            </AppText>
          ))}
        </View>
      ) : (
        <View style={{ height: 18 }} testID={testID ? `${testID}-axis` : undefined}>
          {width > 0
            ? ticks.map((tick, index) => {
                const first = index === 0;
                const last = index === ticks.length - 1;
                const left = Math.min(width - LABEL_WIDTH, Math.max(0, x(startS + tick) - LABEL_WIDTH / 2));
                return (
                  <AppText
                    key={tick}
                    variant="caption"
                    muted
                    numeric
                    style={[{ position: 'absolute', width: LABEL_WIDTH }, first ? { left: 0 } : last ? { right: 0, textAlign: 'right' } : { left, textAlign: 'center' }]}>
                    {formatElapsed(tick)}
                  </AppText>
                );
              })
            : null}
        </View>
      )}
    </View>
  );
}
