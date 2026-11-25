import { useAppData } from '@/data/context';
import { enoughForReport, periodStats, periodWindows, trendOf, weekProgress, type PeriodStats, type Trend } from '@/data/activityDerived';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { NoDataScreen, StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { TopBar } from '@/ui/TopBar';
import { View } from 'react-native';
import { spacing } from '@/ui/theme';

interface Props {
  length: 7 | 30;
  testID: string;
}

interface Row {
  id: 'readiness' | 'load' | 'sleep' | 'hrv' | 'restingHr';
  label: TranslationKey;
  current: number | null;
  previous: number | null;
  decimals: number;
}

function rowsFor(current: PeriodStats, previous: PeriodStats): Row[] {
  return [
    { id: 'readiness', label: 'score.readiness', current: current.readiness, previous: previous.readiness, decimals: 0 },
    { id: 'load', label: 'score.load', current: current.load, previous: previous.load, decimals: 1 },
    { id: 'sleep', label: 'plan.report.sleepAvg', current: current.sleepH, previous: previous.sleepH, decimals: 1 },
    { id: 'hrv', label: 'metric.hrv', current: current.hrv, previous: previous.hrv, decimals: 0 },
    { id: 'restingHr', label: 'metric.restingHr', current: current.restingHr, previous: previous.restingHr, decimals: 0 },
  ];
}

const TREND_KEY: Record<Trend, TranslationKey> = {
  up: 'plan.report.trend.up',
  down: 'plan.report.trend.down',
  stable: 'plan.report.trend.stable',
};

export function PeriodReport({ length, testID }: Props) {
  const { days, userData } = useAppData();
  const { t, language } = useT();
  const titleKey: TranslationKey = length === 7 ? 'plan.weekly.title' : 'plan.monthly.title';
  if (days.length === 0) return <NoDataScreen title={t(titleKey)} />;

  const { current, previous } = periodWindows(days, length);
  const cur = periodStats(current);
  const prev = periodStats(previous);
  const enough = enoughForReport(current);
  const comparable = enoughForReport(previous);
  const last = days[days.length - 1];
  const progress = last && length === 7 && userData.weeklyPlan ? weekProgress(days, last.day) : null;
  const fmt = (v: number, d: number): string => formatNumber(v, d, language);

  return (
    <Screen
      tint="load"
      testID={testID}
      header={
        <>
          <TopBar title={t(titleKey)} />
          <AppText variant="lead" soft>
            {t(length === 7 ? 'plan.weekly.intro' : 'plan.monthly.intro', { count: current.length })}
          </AppText>
        </>
      }>
      {!enough ? (
        <Card testID="report-few">
          <AppText variant="body" muted>
            {t('plan.report.tooFew', { count: current.length, needed: 3 })}
          </AppText>
        </Card>
      ) : (
        <>
          <StatRow>
            <StatTile label={t('score.readiness')} value={cur.readiness === null ? t('loadx.noValue') : fmt(cur.readiness, 0)} testID="report-readiness" />
            <StatTile label={t('score.load')} value={cur.load === null ? t('loadx.noValue') : fmt(cur.load, 1)} testID="report-load" />
            <StatTile label={t('plan.report.sleepAvg')} value={cur.sleepH === null ? t('loadx.noValue') : fmt(cur.sleepH, 1)} unit={t('plan.report.hoursUnit')} testID="report-sleep" />
          </StatRow>
          <Section title={t('plan.report.changes')} hint={comparable ? t('plan.report.vsPrevious', { count: previous.length }) : t('plan.report.noPrevious')}>
            <View style={{ gap: spacing.sm }}>
              {rowsFor(cur, prev).map((row) => {
                if (row.current === null) return null;
                const trend = row.previous !== null && comparable ? trendOf(row.current, row.previous) : null;
                const label = t(row.label);
                return (
                  <Card key={row.id} testID={`report-row-${row.id}`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong">{label}</AppText>
                        <AppText variant="label" muted>
                          {trend !== null && row.previous !== null
                            ? t('plan.report.sentence', { label, current: fmt(row.current, row.decimals), previous: fmt(row.previous, row.decimals), trend: t(TREND_KEY[trend]) })
                            : t('plan.report.sentenceNoPrev', { label, current: fmt(row.current, row.decimals) })}
                        </AppText>
                      </View>
                      {trend !== null ? <Chip tone="neutral" label={t(TREND_KEY[trend])} /> : null}
                    </View>
                  </Card>
                );
              })}
            </View>
          </Section>
          <Card>
            <AppText variant="cardTitle">{t('plan.report.loadDays')}</AppText>
            <AppText variant="body" muted testID="report-loaddays">
              {t('plan.report.loadDaysSentence', { count: cur.loadDays, total: current.length })}
            </AppText>
            {cur.peakLoad ? (
              <AppText variant="label" muted>
                {t('plan.report.peak', { value: fmt(cur.peakLoad.value, 1), day: cur.peakLoad.day })}
              </AppText>
            ) : null}
          </Card>
          {progress && userData.weeklyPlan ? (
            <Card testID="report-plan">
              <AppText variant="cardTitle">{t('plan.report.planTitle')}</AppText>
              <AppText variant="body" muted>
                {t('plan.report.planSentence', {
                  loadDone: progress.loadDays,
                  loadTarget: userData.weeklyPlan.loadDays,
                  sleepDone: progress.sleepNightsMet,
                  sleepTarget: userData.weeklyPlan.sleepNights,
                })}
              </AppText>
            </Card>
          ) : null}
        </>
      )}
      <AppText variant="caption" muted>
        {t('plan.report.note')}
      </AppText>
    </Screen>
  );
}
