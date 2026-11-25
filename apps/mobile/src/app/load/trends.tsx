import { useState } from 'react';

import { formatWeekday, isLoadDay, periodStats } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { series } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { NoDataScreen, StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card } from '@/ui/Card';
import { Segmented } from '@/ui/controls';
import { LineChart } from '@/ui/LineChart';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { TopBar } from '@/ui/TopBar';

type Range = '7' | '30' | '180';

export default function LoadTrendsScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const [range, setRange] = useState<Range>('7');
  if (days.length === 0) return <NoDataScreen title={t('loadx.trends.title')} />;

  const length = Number(range);
  const shown = days.slice(-length);
  const stats = periodStats(shown);
  const fmt = (v: number, d = 1): string => formatNumber(v, d, language);
  const total = shown.reduce((sum, d) => sum + (d.load.value ?? 0), 0);
  const first = shown[0]?.day ?? '';
  const last = shown[shown.length - 1]?.day ?? '';

  return (
    <Screen
      tint="load"
      header={
        <>
          <TopBar title={t('loadx.trends.title')} />
          <Segmented
            testID="load-range"
            value={range}
            onChange={setRange}
            options={[
              { value: '7', label: t('loadx.range.1w') },
              { value: '30', label: t('loadx.range.1m') },
              { value: '180', label: t('loadx.range.6m') },
            ]}
          />
        </>
      }>
      {shown.length < length ? (
        <AppText variant="label" muted testID="trends-few">
          {t('trends.fewDays', { count: shown.length })}
        </AppText>
      ) : null}
      <Section title={t('score.load')} hint={stats.load === null ? t('trends.noValues') : t('trends.average', { value: fmt(stats.load) })}>
        <Card>
          <BarChart data={series(shown, 'load')} max={21} formatTick={(v) => fmt(v, 0)} startLabel={formatShortDay(first, language)} endLabel={formatShortDay(last, language)} />
        </Card>
      </Section>
      <Section title={t('score.readiness')} hint={stats.readiness === null ? t('trends.noValues') : t('trends.average', { value: fmt(stats.readiness, 0) })}>
        <Card>
          <LineChart
            data={series(shown, 'readiness')}
            formatTick={(v) => fmt(v, 0)}
            emptyLabel={t('trends.noValues')}
            startLabel={formatShortDay(first, language)}
            endLabel={formatShortDay(last, language)}
          />
        </Card>
      </Section>
      <StatRow>
        <StatTile label={t('loadx.trends.avg')} value={stats.load === null ? t('loadx.noValue') : fmt(stats.load)} testID="trend-avg" />
        <StatTile label={t('loadx.trends.highest')} value={stats.peakLoad === null ? t('loadx.noValue') : fmt(stats.peakLoad.value)} testID="trend-peak" />
      </StatRow>
      <StatRow>
        <StatTile label={t('loadx.trends.loadDays')} value={`${shown.filter((d) => isLoadDay(d)).length}/${shown.length}`} testID="trend-loaddays" />
        <StatTile label={t('loadx.trends.total')} value={fmt(total)} testID="trend-total" />
      </StatRow>
      {stats.peakLoad ? (
        <AppText variant="label" muted>
          {t('loadx.trends.peakDay', { day: formatWeekday(stats.peakLoad.day, language, 'long'), date: formatShortDay(stats.peakLoad.day, language) })}
        </AppText>
      ) : null}
      <AppText variant="caption" muted>
        {t('loadx.trends.loadDayNote')}
      </AppText>
    </Screen>
  );
}
