import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import type { SleepStage } from '@openhoop/analytics';
import type { DayRecord } from '@openhoop/core';

import { formatDuration, formatShortDay } from '@/lib/format';
import { countKey } from '@/i18n';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Card } from './Card';
import { ParityBadge } from './ParityBadge';
import { PARITY } from './parity';
import { stageColor, stageTotalS } from './StageSplit';
import { spacing, useTheme } from './theme';

interface Props {
  slice: ReadonlyArray<DayRecord>;
  height?: number;
}

const STACK: readonly SleepStage[] = ['deep', 'light', 'rem', 'wake'];
const LEGEND: readonly SleepStage[] = ['wake', 'rem', 'light', 'deep'];
const GAP = 2;

export function StageTrend({ slice, height = 120 }: Props) {
  const { colors } = useTheme();
  const { t, language } = useT();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);
  const nights = slice.map((d) => d.sleep.stages?.totals ?? null);
  const staged = nights.filter((n) => n !== null);
  const top = Math.max(1, ...staged.map(stageTotalS));
  const barW = slice.length > 0 ? Math.max(1, (width - GAP * (slice.length - 1)) / slice.length) : 0;
  const first = slice[0];
  const last = slice[slice.length - 1];
  const average = (stage: SleepStage): number => staged.reduce((sum, n) => sum + n[stage], 0) / Math.max(1, staged.length);

  return (
    <Card style={{ gap: spacing.md }} testID="card-stages-trend">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <AppText variant="bodyStrong">{t('stage.trendTitle')}</AppText>
          <ParityBadge level={PARITY.stages} />
        </View>
        {staged.length > 0 ? (
          <AppText variant="label" muted numeric>
            {t(countKey(staged.length, 'stage.trendNightsOne', 'stage.trendNights'), { count: staged.length })}
          </AppText>
        ) : null}
      </View>
      {staged.length === 0 ? (
        <AppText variant="body" muted testID="stages-trend-empty">
          {t('trends.noValues')}
        </AppText>
      ) : (
        <>
          <View onLayout={onLayout} style={{ height }} testID="chart-stages">
            {width > 0 ? (
              <Svg width={width} height={height}>
                {nights.map((night, i) => {
                  if (night === null) return null;
                  let y = height;
                  return STACK.map((stage) => {
                    const h = (night[stage] / top) * height;
                    y -= h;
                    return h > 0 ? <Rect key={`${i}-${stage}`} x={i * (barW + GAP)} y={y} width={barW} height={h} fill={stageColor(colors, stage)} /> : null;
                  });
                })}
              </Svg>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" muted>
              {first ? formatShortDay(first.day, language) : ''}
            </AppText>
            <AppText variant="caption" muted>
              {last ? formatShortDay(last.day, language) : ''}
            </AppText>
          </View>
          <View style={{ gap: spacing.sm }}>
            {LEGEND.map((stage) => (
              <View key={stage} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: stageColor(colors, stage) }} />
                <AppText variant="body" style={{ flex: 1 }}>
                  {t(`stage.${stage}`)}
                </AppText>
                <AppText variant="label" muted numeric testID={`stages-avg-${stage}`}>
                  {t('trends.average', { value: formatDuration(t, Math.round(average(stage) / 60) * 60) })}
                </AppText>
              </View>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}
