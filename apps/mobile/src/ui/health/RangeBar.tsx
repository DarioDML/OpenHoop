import { useState, type ReactElement } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { AppText } from '@/ui/AppText';
import { radius, useTheme } from '@/ui/theme';

interface Props {
  low: number | null;
  high: number | null;
  value: number;
  format: (value: number) => string;
  accessibilityLabel: string;
  testID?: string;
}

const BAR = 12;
const MARKER = 18;
const GAP = 3;
const TICK_GAP = 40;

export function rangeScale(low: number | null, high: number | null, value: number): { max: number; ticks: number[] } {
  const top = Math.max(high ?? (low ?? value) * 2, value, low ?? 0, 0);
  const extra = low !== null && high !== null ? high - low : top * 0.4;
  const max = Math.max(top + Math.max(extra, top * 0.15), 1);
  const inner = [low, high].filter((tick): tick is number => tick !== null && tick > 0 && tick < max);
  return { max, ticks: [0, ...inner, max] };
}

export function visibleTicks(ticks: readonly number[], max: number, width: number, minGap = TICK_GAP): number[] {
  if (width <= 0 || max <= 0) return [];
  const at = (tick: number): number => (tick / max) * width;
  const last = ticks[ticks.length - 1];
  const kept: number[] = [];
  for (const tick of ticks.slice(0, -1)) {
    const previous = kept[kept.length - 1];
    const farFromPrevious = previous === undefined || at(tick) - at(previous) >= minGap;
    const farFromEnd = last === undefined || at(last) - at(tick) >= minGap;
    if (kept.length === 0 || (farFromPrevious && farFromEnd)) kept.push(tick);
  }
  if (last !== undefined) kept.push(last);
  return kept;
}

export function RangeBar({ low, high, value, format, accessibilityLabel, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const { max, ticks } = rangeScale(low, high, value);
  const x = (v: number): number => (Math.min(max, Math.max(0, v)) / max) * width;
  const insideFrom = Math.max(0, low ?? 0);
  const insideTo = Math.min(max, high ?? max);
  const below = insideFrom > 0 ? Math.max(0, x(insideFrom) - GAP) : 0;
  const inside = Math.max(0, x(insideTo) - x(insideFrom) - (below > 0 ? GAP : 0));
  const shown = visibleTicks(ticks, max, width);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ gap: 10 }}>
      <View onLayout={onLayout} style={{ height: MARKER, justifyContent: 'center' }}>
        {width > 0 ? (
          <>
            <View style={{ flexDirection: 'row', height: BAR, borderRadius: radius.pill, overflow: 'hidden', gap: GAP }}>
              {below > 0 ? <View style={{ width: below, backgroundColor: colors.negative, opacity: 0.85 }} /> : null}
              {inside > 0 ? <View style={{ width: inside, backgroundColor: colors.positive }} /> : null}
              {insideTo < max ? <View style={{ flex: 1, backgroundColor: colors.negative, opacity: 0.45 }} /> : null}
            </View>
            <View
              testID={testID ? `${testID}-marker` : undefined}
              style={{
                position: 'absolute',
                left: Math.min(width - MARKER, Math.max(0, x(value) - MARKER / 2)),
                width: MARKER,
                height: MARKER,
                borderRadius: radius.pill,
                backgroundColor: colors.text,
                borderWidth: 3,
                borderColor: colors.surface,
              }}
            />
          </>
        ) : null}
      </View>
      <View style={{ height: 18 }}>
        {shown.map((tick, i) => {
          const first = i === 0;
          const last = i === shown.length - 1;
          return (
            <AppText
              key={`${tick}-${i}`}
              variant="label"
              muted
              numeric
              testID={testID ? `${testID}-tick-${i}` : undefined}
              style={{ position: 'absolute', ...(first ? { left: 0 } : last ? { right: 0 } : { left: Math.max(0, Math.min(width - TICK_GAP, x(tick) - TICK_GAP / 2)), width: TICK_GAP, textAlign: 'center' }) }}>
              {format(tick)}
            </AppText>
          );
        })}
      </View>
    </View>
  );
}
