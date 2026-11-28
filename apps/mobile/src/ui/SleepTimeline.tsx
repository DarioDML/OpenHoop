import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';

import type { SleepPeriodRecord } from '@openhoop/core';

import { formatClock, formatDuration } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { radius, spacing, useTheme } from './theme';

interface Props {
  periods: ReadonlyArray<SleepPeriodRecord>;
  tzOffsetS: number;
}

const ROW_H = 26;
const HOUR = 3600;

const TICK_W = 28;

export function SleepTimeline({ periods, tzOffsetS }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);

  if (periods.length === 0) return null;

  const first = Math.min(...periods.map((p) => p.onset));
  const last = Math.max(...periods.map((p) => p.offset));
  const from = Math.floor((first + tzOffsetS) / HOUR) * HOUR - tzOffsetS;
  const to = Math.ceil((last + tzOffsetS) / HOUR) * HOUR - tzOffsetS;
  const span = to - from;
  const stepHours = span / HOUR > 14 ? 4 : span / HOUR > 8 ? 2 : 1;
  const ticks: number[] = [];
  for (let tick = from; tick <= to; tick += HOUR) {
    const localHour = Math.round((tick + tzOffsetS) / HOUR) % 24;
    if (localHour % stepHours === 0) ticks.push(tick);
  }
  const px = (time: number): number => ((time - from) / span) * width;
  const height = periods.length * ROW_H + (periods.length - 1) * 6;

  return (
    <View style={{ gap: spacing.md }}>
      <View testID="sleep-timeline" onLayout={onLayout} style={{ gap: 6 }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {periods.map((p, i) => {
              const y = i * (ROW_H + 6);
              const x = px(p.onset);
              const w = Math.max(4, px(p.offset) - x);
              const drawnS = p.offset - p.onset + 1;
              const ratio = drawnS > 0 ? Math.min(1, p.asleepS / drawnS) : 0;
              const innerW = w * ratio;
              const base = p.nap ? colors.zones[1] : colors.accent;
              return (
                <G key={p.onset}>
                  <Rect testID={`sleep-timeline-bed-${i}`} x={x} y={y} width={w} height={ROW_H} rx={radius.sm} fill={base} opacity={0.28} />
                  <Rect testID={`sleep-timeline-asleep-${i}`} x={x + (w - innerW) / 2} y={y + 5} width={innerW} height={ROW_H - 10} rx={radius.sm - 3} fill={base} />
                </G>
              );
            })}
          </Svg>
        ) : null}
        <View style={{ height: 18 }}>
          {width > 0
            ? ticks.map((tick) => {
                const label = formatClock(tick, tzOffsetS).slice(0, 2);
                const left = Math.min(Math.max(px(tick) - TICK_W / 2, 0), width - TICK_W);
                return (
                  <AppText
                    key={tick}
                    variant="caption"
                    muted
                    numeric
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    style={{ position: 'absolute', left, width: TICK_W, textAlign: 'center' }}>
                    {label}
                  </AppText>
                );
              })
            : null}
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        {periods.map((p) => (
          <View key={p.onset} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, rowGap: 2 }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: p.nap ? colors.zones[1] : colors.accent }} />
            <AppText variant="body" style={{ flexGrow: 1, flexShrink: 1, minWidth: 96 }}>
              {p.nap ? t('sleep.nap') : t('sleep.main')}
            </AppText>
            <AppText variant="bodyStrong" numeric>
              {formatClock(p.onset, tzOffsetS)}–{formatClock(p.offset, tzOffsetS)}
            </AppText>
            <AppText variant="label" muted numeric>
              {formatDuration(t, p.asleepS)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
