import { useState } from 'react';
import { View } from 'react-native';

import { formatWeekday } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { readinessBandCounts, sliceEndingAt, TREND_RANGES, type TrendRange } from '@/data/dailyDerived';
import { baselineAt, mean, visibleReadiness } from '@/data/derived';
import { lowestReadinessDay, readinessBars, READINESS_HIGH, type ReadinessBar } from '@/data/readinessDerived';
import type { Language } from '@/data/types';
import { useT, type TFunction } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { CoachAsk } from '@/ui/CoachAsk';
import { NoDataPage, Page } from '@/ui/daily/bits';
import { RangeSwitch, TrendCard } from '@/ui/daily/charts';
import { PARITY } from '@/ui/parity';
import { BandSplit } from '@/ui/readiness/BandSplit';
import { monthShort, weekdayShort } from '@/ui/readiness/format';
import { readinessColor, spacing, useTheme } from '@/ui/theme';
import { ValueBars } from '@/ui/ValueBars';

function barLabel(bar: ReadinessBar, language: Language): string {
  if (bar.kind === 'day') return weekdayShort(bar.start, language);
  if (bar.kind === 'week') return formatShortDay(bar.start, language);
  return monthShort(bar.start, language);
}

function coachQuestion(t: TFunction, language: Language, range: TrendRange, lowest: ReturnType<typeof lowestReadinessDay>): string {
  if (lowest === null) return t('readinessTrends.ask.none');
  if (lowest.value >= READINESS_HIGH) return t('readinessTrends.ask.high');
  const weekday = formatWeekday(lowest.day, language, 'long');
  const day = range === '1W' ? weekday : `${weekday} ${formatShortDay(lowest.day, language)}`;
  return t('readinessTrends.ask.low', { day });
}

export default function RecoveryTrendsScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const [range, setRange] = useState<TrendRange>('1W');
  if (days.length === 0) return <NoDataPage title={t('readinessx.trends')} body={t('empty.body')} />;

  const index = days.length - 1;
  const count = TREND_RANGES[range];
  const slice = sliceEndingAt(days, count);
  const values = slice.map((d) => visibleReadiness(d).value);
  const counts = readinessBandCounts(values);
  const average = mean(values);
  const bars = readinessBars(slice, range);
  const hrvBand = baselineAt(days, index, 'hrv');
  const question = coachQuestion(t, language, range, lowestReadinessDay(slice));

  return (
    <Page title={t('readinessx.trends')} tint="recovery" testID="recovery-trends" hero={<RangeSwitch value={range} onChange={setRange} />}>
      {slice.length < count ? (
        <AppText variant="label" muted>
          {t('trends.fewDays', { count: slice.length })}
        </AppText>
      ) : null}

      <Card testID="card-readiness-bars" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="cap" muted accessibilityRole="header">
            {t('score.readiness')}
          </AppText>
          {average === null ? null : (
            <AppText variant="label" muted testID="avg-readiness">
              {t('readinessTrends.avg', { value: formatNumber(average, 0, language) })}
            </AppText>
          )}
        </View>
        <ValueBars
          testID="chart-readiness"
          max={100}
          height={96}
          barWidth={bars.length > 7 ? 14 : 22}
          highlight={bars.length - 1}
          bars={bars.map((bar) => ({
            key: bar.key,
            value: bar.value,
            display: bar.value === null ? undefined : formatNumber(bar.value, 0, language),
            label: barLabel(bar, language),
            color: readinessColor(colors, bar.value),
          }))}
        />
        {range === '1W' ? null : (
          <AppText variant="caption" muted>
            {t(range === '1M' ? 'readinessTrends.per.week' : 'readinessTrends.per.month')}
          </AppText>
        )}
      </Card>

      <Card testID="card-band-counts" style={{ gap: spacing.md }}>
        <AppText variant="cap" muted accessibilityRole="header">
          {t('readinessTrends.lastDays', { days: slice.length })}
        </AppText>
        <BandSplit high={counts.high} medium={counts.medium} low={counts.low} testID="band-split" />
      </Card>

      <TrendCard
        testID="hrv"
        title={t('readinessTrends.hrvTitle')}
        slice={slice}
        pick={(d) => d.hrv.value}
        decimals={0}
        minSpan={10}
        level={PARITY.hrv}
        color={colors.text}
        band={hrvBand}
        unit={t('unit.ms')}
      />
      <TrendCard testID="rhr" title={t('metric.restingHr')} slice={slice} pick={(d) => d.restingHr.value} decimals={0} minSpan={6} level={PARITY.restingHr} unit={t('unit.bpm')} />
      <TrendCard testID="load" title={t('score.load')} slice={slice} pick={(d) => d.load.value} decimals={1} minSpan={4} level={PARITY.load} color={colors.metric.loadBright} />
      <TrendCard testID="sleep" title={t('score.sleep')} slice={slice} pick={(d) => d.sleep.score.value} decimals={0} minSpan={10} level={PARITY.sleepScore} color={colors.metric.sleep} unit="%" />
      {hrvBand ? (
        <AppText variant="caption" muted>
          {t('readinessx.bandNote')}
        </AppText>
      ) : null}

      <CoachAsk question={question} testID="trends-coach" />
    </Page>
  );
}
