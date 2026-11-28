import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { LabTally } from '@/data/labs';
import { AppText } from '@/ui/AppText';
import { spacing, useTheme } from '@/ui/theme';

interface Props {
  tally: LabTally;
  width: number;
  labels: { mid: string; edge: string; out: string };
  emptyLabel: string;
  testID?: string;
}

const STROKE = 16;
const GAP = 0.012;

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const point = (f: number): string => {
    const angle = Math.PI + f * Math.PI;
    return `${(cx + r * Math.cos(angle)).toFixed(1)} ${(cy + r * Math.sin(angle)).toFixed(1)}`;
  };
  return `M${point(from)} A${r} ${r} 0 0 1 ${point(to)}`;
}

export function LabsGauge({ tally, width, labels, emptyLabel, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const r = width / 2 - STROKE;
  const height = r + STROKE * 1.5;
  const cx = width / 2;
  const cy = r + STROKE / 2;
  const ranged = tally.mid + tally.edge + tally.out;
  const parts = [
    { key: 'out', count: tally.out, color: colors.negative },
    { key: 'edge', count: tally.edge, color: colors.textMuted },
    { key: 'mid', count: tally.mid, color: colors.positive },
  ].filter((part) => part.count > 0);
  let at = 0;
  const arcs = parts.map((part) => {
    const from = at;
    at += part.count / Math.max(1, ranged);
    return { ...part, from, to: at };
  });
  return (
    <View testID={testID} style={{ alignItems: 'center', gap: spacing.sm }}>
      <Svg width={width} height={height}>
        <Path d={arcPath(cx, cy, r, 0, 1)} stroke={colors.surface3} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
        {arcs.map((arc) => (
          <Path
            key={arc.key}
            d={arcPath(cx, cy, r, arc.from + (arc.from > 0 ? GAP : 0), arc.to - (arc.to < 1 ? GAP : 0))}
            stroke={arc.color}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="butt"
          />
        ))}
      </Svg>
      {ranged === 0 ? (
        <AppText variant="label" muted testID={testID ? `${testID}-empty` : undefined}>
          {emptyLabel}
        </AppText>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: spacing.lg, rowGap: 4 }}>
          <AppText variant="body" color={colors.positive} testID={testID ? `${testID}-mid` : undefined}>
            {labels.mid}
          </AppText>
          <AppText variant="body" muted testID={testID ? `${testID}-edge` : undefined}>
            {labels.edge}
          </AppText>
          <AppText variant="body" color={colors.negative} testID={testID ? `${testID}-out` : undefined}>
            {labels.out}
          </AppText>
        </View>
      )}
    </View>
  );
}
