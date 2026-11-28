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

export function rangeScale(low: number | null, high: number | null, value: number): { max: number; ticks: number[] } {
  const top = Math.max(high ?? (low ?? value) * 2, value, low ?? 0);
  const extra = low !== null && high !== null ? high - low : top * 0.4;
  const max = top + Math.max(extra, top * 0.15);
  const ticks = [0, ...(low === null ? [] : [low]), ...(high === null ? [] : [high]), max];
  return { max, ticks };
}

export function RangeBar({ low, high, value, format, accessibilityLabel, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const { max, ticks } = rangeScale(low, high, value);
  const x = (v: number): number => (Math.min(max, Math.max(0, v)) / max) * width;
  const insideFrom = low ?? 0;
  const insideTo = high ?? max;
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ gap: 10 }}>
      <View onLayout={onLayout} style={{ height: MARKER, justifyContent: 'center' }}>
        {width > 0 ? (
          <>
            <View style={{ flexDirection: 'row', height: BAR, borderRadius: radius.pill, overflow: 'hidden', gap: 3 }}>
              {insideFrom > 0 ? <View style={{ width: x(insideFrom) - 2, backgroundColor: colors.negative, opacity: 0.85 }} /> : null}
              <View style={{ width: x(insideTo) - x(insideFrom) - (insideFrom > 0 ? 3 : 0), backgroundColor: colors.positive }} />
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
        {width > 0
          ? ticks.map((tick, i) => (
              <AppText
                key={`${tick}-${i}`}
                variant="label"
                muted
                numeric
                style={{ position: 'absolute', left: i === 0 ? 0 : undefined, right: i === ticks.length - 1 ? 0 : undefined, ...(i > 0 && i < ticks.length - 1 ? { left: Math.max(0, x(tick) - 14) } : null) }}>
                {format(tick)}
              </AppText>
            ))
          : null}
      </View>
    </View>
  );
}
