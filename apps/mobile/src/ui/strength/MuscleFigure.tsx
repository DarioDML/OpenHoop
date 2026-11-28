import type { MuscleGroup } from '@openhoop/core';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { spacing, useTheme } from '@/ui/theme';

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  muscle: MuscleGroup | null;
}

const FRONT_X = 90;
const BACK_X = 228;

function side(center: number, back: boolean): Region[] {
  const dx = center - FRONT_X;
  const at = (x: number, y: number, width: number, height: number, rx: number, muscle: MuscleGroup | null): Region => ({ x: x + dx, y, width, height, rx, muscle });
  return back
    ? [
        at(70, 34, 40, 22, 8, 'back'),
        at(70, 58, 40, 34, 8, 'back'),
        at(52, 36, 16, 16, 7, 'shoulders'),
        at(112, 36, 16, 16, 7, 'shoulders'),
        at(48, 54, 14, 36, 7, 'triceps'),
        at(118, 54, 14, 36, 7, 'triceps'),
        at(70, 96, 18, 52, 8, 'hamstrings'),
        at(92, 96, 18, 52, 8, 'hamstrings'),
        at(71, 92, 38, 12, 6, 'glutes'),
        at(72, 152, 14, 34, 7, 'calves'),
        at(94, 152, 14, 34, 7, 'calves'),
      ]
    : [
        at(70, 34, 40, 22, 8, 'chest'),
        at(70, 58, 40, 34, 8, 'core'),
        at(52, 36, 16, 16, 7, 'shoulders'),
        at(112, 36, 16, 16, 7, 'shoulders'),
        at(48, 54, 14, 36, 7, 'biceps'),
        at(118, 54, 14, 36, 7, 'biceps'),
        at(70, 96, 18, 52, 8, 'quads'),
        at(92, 96, 18, 52, 8, 'quads'),
        at(72, 152, 14, 34, 7, null),
        at(94, 152, 14, 34, 7, null),
      ];
}

const MIN_OPACITY = 0.24;

interface Props {
  intensity: Partial<Record<MuscleGroup, number>>;
  summary: string;
  testID?: string;
}

export function MuscleFigure({ intensity, summary, testID }: Props): ReactElement {
  const { t } = useT();
  const { colors } = useTheme();
  const fill = (region: Region): { fill: string; opacity: number } => {
    const level = region.muscle === null ? undefined : intensity[region.muscle];
    return level === undefined ? { fill: colors.surfaceAlt, opacity: 1 } : { fill: colors.metric.load, opacity: MIN_OPACITY + (1 - MIN_OPACITY) * level };
  };
  const figure = (center: number, back: boolean, label: string): ReactElement[] => [
    <Circle key={`${label}-head`} cx={center} cy={18} r={12} fill={colors.surface3} />,
    ...side(center, back).map((region, index) => {
      const shade = fill(region);
      return (
        <Rect
          key={`${label}-${index}`}
          x={region.x}
          y={region.y}
          width={region.width}
          height={region.height}
          rx={region.rx}
          fill={shade.fill}
          fillOpacity={shade.opacity}
          testID={testID === undefined || region.muscle === null ? undefined : `${testID}-${back ? 'back' : 'front'}-${region.muscle}-${index}`}
        />
      );
    }),
    <SvgText key={`${label}-label`} x={center} y={194} textAnchor="middle" fill={colors.textMuted} fontSize={10} letterSpacing={1.2}>
      {label.toUpperCase()}
    </SvgText>,
  ];
  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ alignItems: 'center' }}>
        <Svg width="100%" height={196} viewBox="0 0 318 196" style={{ maxWidth: 360 }}>
          {figure(FRONT_X, false, t('strength.summary.front'))}
          {figure(BACK_X, true, t('strength.summary.back'))}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm }}>
        <Legend color={colors.metric.load} opacity={MIN_OPACITY} label={t('strength.summary.low')} />
        <Legend color={colors.metric.load} opacity={1} label={t('strength.summary.high')} />
        <Legend color={colors.surfaceAlt} opacity={1} label={t('strength.summary.untrained')} />
      </View>
    </View>
  );
}

function Legend({ color, opacity, label }: { color: string; opacity: number; label: string }): ReactElement {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, opacity }} />
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </View>
  );
}
