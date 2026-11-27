import { useState, type ReactElement } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { AppText } from './AppText';
import { radius, spacing, useTheme } from './theme';

export interface DualSeries {
  data: ReadonlyArray<number | null>;
  max: number;
  color: string;
  dots?: boolean;
}

interface Props {
  primary: DualSeries;
  secondary: DualSeries;
  labels: readonly string[];
  height?: number;
  accessibilityLabel: string;
  testID?: string;
}

const PAD = 5;
const MAX_DOTS = 14;

function paths(data: ReadonlyArray<number | null>, x: (i: number) => number, y: (v: number) => number): string[] {
  const out: string[] = [];
  let current = '';
  data.forEach((v, i) => {
    if (v === null) {
      if (current) out.push(current);
      current = '';
      return;
    }
    current += `${current ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
  });
  if (current) out.push(current);
  return out;
}

export function DualLineChart({ primary, secondary, labels, height = 120, accessibilityLabel, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const count = Math.max(primary.data.length, secondary.data.length);
  const x = (i: number): number => (count <= 1 ? width / 2 : PAD + (i / (count - 1)) * (width - PAD * 2));
  const yFor =
    (max: number) =>
    (v: number): number =>
      PAD + (height - PAD * 2) * (1 - Math.min(1, Math.max(0, v / (max || 1))));
  const series = [secondary, primary];
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);
  const showAll = labels.length <= 7;

  return (
    <View testID={testID} style={{ gap: spacing.sm }}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ height }} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {[0.5, height / 2, height - 0.5].map((gy) => (
              <Line key={gy} x1={0} y1={gy} x2={width} y2={gy} stroke={colors.grid} strokeWidth={1} />
            ))}
            {series.map((s, si) => {
              const y = yFor(s.max);
              return paths(s.data, x, y).map((d, pi) => (
                <Path key={`${si}-${pi}`} d={d} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              ));
            })}
            {series.map((s, si) => {
              if (s.dots !== true || count > MAX_DOTS) return null;
              const y = yFor(s.max);
              return s.data.map((v, i) =>
                v === null ? null : <Circle key={`${si}-dot-${i}`} cx={x(i)} cy={y(v)} r={4} fill={colors.surface} stroke={s.color} strokeWidth={2} />,
              );
            })}
          </Svg>
        ) : null}
      </View>
      {showAll ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {labels.map((label, i) => (
            <AppText key={`${label}-${i}`} variant="caption" muted>
              {label}
            </AppText>
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" muted>
            {labels[0] ?? ''}
          </AppText>
          <AppText variant="caption" muted>
            {labels[labels.length - 1] ?? ''}
          </AppText>
        </View>
      )}
    </View>
  );
}

interface LegendItem {
  label: string;
  color: string;
}

export function ChartLegend({ items, testID }: { items: readonly LegendItem[]; testID?: string }): ReactElement {
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: radius.sm / 3, backgroundColor: item.color }} />
          <AppText variant="caption" muted>
            {item.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}
