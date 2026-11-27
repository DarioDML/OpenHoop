import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { readinessBandCounts, sliceEndingAt, TREND_RANGES, type TrendRange } from '@/data/dailyDerived';
import { baselineAt, visibleReadiness } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { NoDataPage, Page } from '@/ui/daily/bits';
import { RangeSwitch, TrendCard } from '@/ui/daily/charts';
import { PARITY } from '@/ui/parity';
import { spacing, useTheme } from '@/ui/theme';

export default function RecoveryTrendsScreen() {
  const { days } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [range, setRange] = useState<TrendRange>('1M');
  if (days.length === 0) return <NoDataPage title={t('readinessx.trends')} body={t('empty.body')} />;

  const index = days.length - 1;
  const count = TREND_RANGES[range];
  const slice = sliceEndingAt(days, count);
  const counts = readinessBandCounts(slice.map((d) => visibleReadiness(d).value));
  const hrvBand = baselineAt(days, index, 'hrv');

  return (
    <Page title={t('readinessx.trends')} tint="recovery" testID="recovery-trends">
      <RangeSwitch value={range} onChange={setRange} />
      {slice.length < count ? (
        <AppText variant="label" muted>
          {t('trends.fewDays', { count: slice.length })}
        </AppText>
      ) : null}
      <TrendCard testID="readiness" title={t('score.readiness')} slice={slice} pick={(d) => visibleReadiness(d).value} decimals={0} minSpan={10} level={PARITY.readiness} unit="%" />
      <Card style={{ gap: spacing.sm }} testID="card-band-counts">
        <AppText variant="bodyStrong">{t('readinessx.bandCounts', { days: slice.length })}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Chip tone="positive" label={`${t('readiness.high')} ${counts.high}`} testID="count-high" />
          <Chip tone="warning" label={`${t('readiness.medium')} ${counts.medium}`} testID="count-medium" />
          <Chip tone="negative" label={`${t('readiness.low')} ${counts.low}`} testID="count-low" />
        </View>
      </Card>
      <TrendCard testID="hrv" title={t('metric.hrv')} slice={slice} pick={(d) => d.hrv.value} decimals={0} minSpan={10} level={PARITY.hrv} color={colors.accent} band={hrvBand} unit={t('unit.ms')} />
      <TrendCard testID="rhr" title={t('metric.restingHr')} slice={slice} pick={(d) => d.restingHr.value} decimals={0} minSpan={6} level={PARITY.restingHr} unit={t('unit.bpm')} />
      <TrendCard testID="load" title={t('score.load')} slice={slice} pick={(d) => d.load.value} decimals={1} minSpan={4} level={PARITY.load} color={colors.metric.loadBright} />
      <TrendCard testID="sleep" title={t('score.sleep')} slice={slice} pick={(d) => d.sleep.score.value} decimals={0} minSpan={10} level={PARITY.sleepScore} color={colors.metric.sleep} unit="%" />
      {hrvBand ? (
        <AppText variant="caption" muted>
          {t('readinessx.bandNote')}
        </AppText>
      ) : null}
    </Page>
  );
}
