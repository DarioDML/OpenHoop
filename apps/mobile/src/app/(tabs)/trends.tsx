import { useState } from 'react';
import { View } from 'react-native';

import type { DayRecord } from '@stoop/core';

import { useAppData } from '@/data/context';
import type { ParityLevel } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Segmented } from '@/ui/controls';
import { EmptyState } from '@/ui/EmptyState';
import { LineChart } from '@/ui/LineChart';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { spacing } from '@/ui/theme';

type Range = '7' | '30' | '180';

interface Series {
  key: string;
  title: TranslationKey;
  level: ParityLevel;
  decimals: number;
  minSpan: number;
  pick: (day: DayRecord) => number | null;
}

const SERIES: ReadonlyArray<Series> = [
  { key: 'readiness', title: 'score.readiness', level: PARITY.readiness, decimals: 0, minSpan: 10, pick: (d) => d.readiness.value },
  { key: 'load', title: 'score.load', level: PARITY.load, decimals: 1, minSpan: 4, pick: (d) => d.load.value },
  { key: 'sleep', title: 'score.sleep', level: PARITY.sleepScore, decimals: 0, minSpan: 10, pick: (d) => d.sleep.score.value },
  { key: 'hrv', title: 'metric.hrv', level: PARITY.hrv, decimals: 0, minSpan: 10, pick: (d) => d.hrv.value },
  { key: 'rhr', title: 'metric.restingHr', level: PARITY.restingHr, decimals: 0, minSpan: 6, pick: (d) => d.restingHr.value },
];

export default function TrendsScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const [range, setRange] = useState<Range>('30');

  if (days.length === 0) {
    return (
      <Screen>
        <EmptyState />
      </Screen>
    );
  }

  const count = Number(range);
  const slice = days.slice(-count);
  const first = slice[0];
  const last = slice[slice.length - 1];

  return (
    <Screen>
      <Segmented
        value={range}
        onChange={setRange}
        options={[
          { value: '7', label: t('trends.range7') },
          { value: '30', label: t('trends.range30') },
          { value: '180', label: t('trends.range180') },
        ]}
      />
      {slice.length < count ? (
        <AppText variant="label" muted>
          {t('trends.fewDays', { count: slice.length })}
        </AppText>
      ) : null}
      {SERIES.map((series) => {
        const values = slice.map(series.pick);
        const present = values.filter((v): v is number => v !== null);
        const average = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : null;
        return (
          <Card key={series.key} style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AppText variant="bodyStrong">{t(series.title)}</AppText>
                <ParityBadge level={series.level} />
              </View>
              {average !== null ? (
                <AppText variant="label" muted numeric>
                  {t('trends.average', { value: formatNumber(average, series.decimals, language) })}
                </AppText>
              ) : null}
            </View>
            <LineChart
              testID={`chart-${series.key}`}
              data={values}
              minSpan={series.minSpan}
              formatTick={(v) => formatNumber(v, series.decimals, language)}
              emptyLabel={t('trends.noValues')}
              startLabel={first ? formatShortDay(first.day, language) : undefined}
              endLabel={last ? formatShortDay(last.day, language) : undefined}
            />
          </Card>
        );
      })}
    </Screen>
  );
}
