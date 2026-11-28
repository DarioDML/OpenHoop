import { useState, type ReactElement } from 'react';
import { View } from 'react-native';

import { enoughForReport, formatWeekday, loadTargetBand, mergeSteps, periodStats, periodWindows } from '@/data/activityDerived';
import { loadTargetsHidden } from '@/data/pregnancyPrefs';
import { useAppData } from '@/data/context';
import { formatHm, formatMinutes } from '@/data/dailyDerived';
import { balancePoints, balanceShade, bedtimePoints, bedtimeSpread, averageConsistency, clockFromNoon, LOAD_MAX, weekVerdict, type WeekVerdict } from '@/data/periodReport';
import { planWeek } from '@/data/weeklyPlan';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import type { Language } from '@/data/types';
import { deviceTzOffsetS } from '@/lib/dates';
import { formatDuration, formatNumber } from '@/lib/format';
import { NoDataScreen } from '@/ui/activity/parts';

import { AppText } from '../AppText';
import { Card } from '../Card';
import { Screen } from '../Screen';
import { GridTile, StatGrid } from '../StatGrid';
import { readinessColor, spacing, useTheme } from '../theme';
import { IconButton, TopBar } from '../TopBar';
import { formatDayRange } from './goals';
import { ChangeRows, LoadDaysCard, tooFewText } from './reportParts';
import { ReportShareSheet } from './ReportShareSheet';
import { ScatterChart } from './ScatterChart';

export function verdictText(t: TFunction, verdict: WeekVerdict, language: Language): string {
  if (verdict.kind === 'oneOver') return t('plan.verdict.oneOver', { day: formatWeekday(verdict.day, language, 'long') });
  if (verdict.kind === 'manyOver') return t('plan.verdict.manyOver', { count: verdict.count });
  return t(`plan.verdict.${verdict.kind}`);
}

export function WeeklyReport({ testID }: { testID: string }): ReactElement {
  const { days, userData, strength, activities, healthConnect, cycle } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const [sharing, setSharing] = useState(false);
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return <NoDataScreen title={t('plan.weekly.title')} tint="home" />;

  const { current, previous } = periodWindows(days, 7);
  const cur = periodStats(current);
  const prev = periodStats(previous);
  const enough = enoughForReport(current);
  const comparable = enoughForReport(previous);
  const band = loadTargetsHidden(userData.pregnancyPrefs, cycle) ? null : loadTargetBand(days);
  const points = balancePoints(current, band);
  const verdict = verdictText(t, weekVerdict(points, cur, comparable ? prev : null, band), language);
  const range = formatDayRange(current[0]?.day ?? first.day, last.day, language);
  const fmt = (v: number, d: number): string => formatNumber(v, d, language);

  const beds = bedtimePoints(current);
  const bedValues = beds.map((b) => b.minutesFromNoon);
  const bedMin = bedValues.length > 0 ? Math.min(...bedValues) - 30 : 0;
  const bedMax = bedValues.length > 0 ? Math.max(...bedValues) + 30 : 1;
  const spread = bedtimeSpread(beds);
  const consistency = averageConsistency(current);
  const position = new Map(current.map((d, i) => [d.day, i]));

  const plan = userData.weeklyPlan;
  const now = new Date();
  const week =
    plan !== null && plan.goals.length > 0
      ? planWeek(plan, { days, sessions: strength.sessions, activities, steps: mergeSteps(days, healthConnect.state.steps), today: last.day, nowS: Math.floor(now.getTime() / 1000), tzOffsetS: deviceTzOffsetS(now) })
      : null;

  const readiness = cur.readiness === null ? null : fmt(cur.readiness, 0);
  const load = cur.load === null ? null : fmt(cur.load, 1);
  const sleep = cur.sleepH === null ? null : formatHm(cur.sleepH * 3600);
  const missing = t('plan.report.notMeasured');

  return (
    <Screen
      tint="home"
      testID={testID}
      header={
        <>
          <TopBar title={t('plan.weekly.title')} right={enough ? <IconButton icon="share" label={t('plan.share.title')} onPress={() => setSharing(true)} testID="report-share" /> : undefined} />
          {enough ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="cap" soft>
                {t('plan.report.verdictCap', { range })}
              </AppText>
              <AppText variant="h2" accessibilityRole="header" testID="report-verdict">
                {verdict}
              </AppText>
            </View>
          ) : (
            <AppText variant="lead" soft>
              {t('plan.weekly.intro', { count: current.length })}
            </AppText>
          )}
        </>
      }>
      {!enough ? (
        <Card testID="report-few">
          <AppText variant="body" muted>
            {tooFewText(t, current.length)}
          </AppText>
        </Card>
      ) : (
        <>
          <Card testID="report-balance">
            <AppText variant="capSmall" muted>
              {t('plan.chart.balance')}
            </AppText>
            <ScatterChart
              points={points.map((p) => ({ x: p.load, y: p.readiness, color: readinessColor(colors, p.readiness) }))}
              xDomain={{ min: 0, max: LOAD_MAX }}
              yDomain={{ min: 0, max: 100 }}
              shade={band === null ? null : balanceShade(band)}
              shadeLabel={t('plan.chart.inBalance')}
              xLabel={t('plan.chart.loadAxis')}
              yLabel={t('plan.chart.readinessAxis')}
              emptyLabel={t('plan.chart.noBalance')}
              accessibilityLabel={verdict}
            />
            <AppText variant="caption" muted>
              {band === null ? t('plan.chart.balanceNoBand') : t('plan.chart.balanceNote')}
            </AppText>
          </Card>
          <Card testID="report-bedtimes">
            <AppText variant="capSmall" muted>
              {t('plan.chart.consistency')}
            </AppText>
            <ScatterChart
              points={beds.map((b) => ({ x: position.get(b.day) ?? 0, y: b.minutesFromNoon, color: colors.purple }))}
              xDomain={{ min: -0.5, max: Math.max(1, current.length) - 0.5 }}
              yDomain={{ min: bedMin, max: bedMax }}
              invertY
              yTicks={bedValues.length > 0 ? { top: formatMinutes(clockFromNoon(bedMin + 30)), bottom: formatMinutes(clockFromNoon(bedMax - 30)) } : null}
              xLabel={t('plan.chart.dayAxis')}
              yLabel={t('plan.chart.bedtimeAxis')}
              emptyLabel={t('plan.chart.noSleep')}
              accessibilityLabel={spread === null ? t('plan.chart.noSleep') : t('plan.chart.spread', { time: formatDuration(t, spread * 60) })}
            />
            {spread !== null ? (
              <AppText variant="caption" muted testID="report-spread">
                {t('plan.chart.spread', { time: formatDuration(t, spread * 60) })}
                {consistency !== null ? ` ${t('plan.chart.consistencyValue', { value: Math.round(consistency) })}` : ''}
              </AppText>
            ) : null}
          </Card>
          <StatGrid>
            <GridTile label={t('plan.report.avgReadiness')} value={readiness} unit="%" missing={missing} testID="report-readiness" />
            <GridTile label={t('plan.report.avgLoad')} value={load} missing={missing} testID="report-load" />
            <GridTile label={t('plan.report.sleepAvg')} value={sleep} missing={missing} testID="report-sleep" />
            {week !== null ? (
              <GridTile
                label={t('plan.report.planTile')}
                value={`${week.met}/${week.goals.length}`}
                chip={{ label: t('plan.report.goalsHit'), tone: 'neutral' }}
                caption={t('plan.report.weekSoFar')}
                href="/plan"
                testID="report-plan"
              />
            ) : (
              <GridTile label={t('plan.report.planTile')} value={null} missing={t('plan.report.noPlan')} caption={t('plan.report.weekSoFar')} href={plan === null ? '/plan/setup' : '/plan'} testID="report-plan" />
            )}
          </StatGrid>
          <ChangeRows current={cur} previous={prev} comparable={comparable} previousCount={previous.length} />
          <LoadDaysCard stats={cur} total={current.length} />
        </>
      )}
      <AppText variant="caption" muted>
        {t('plan.report.note')}
      </AppText>
      {enough ? (
        <ReportShareSheet
          visible={sharing}
          onClose={() => setSharing(false)}
          title={t('plan.weekly.title')}
          range={range}
          headline={verdict}
          fileName="openhoop-week.png"
          testID="report-share-sheet"
          stats={[
            { label: t('plan.report.avgReadiness'), value: readiness ?? missing, unit: readiness === null ? undefined : '%' },
            { label: t('plan.report.avgLoad'), value: load ?? missing },
            { label: t('plan.report.sleepAvg'), value: sleep ?? missing },
            ...(week !== null ? [{ label: `${t('plan.report.planTile')} · ${t('plan.report.weekSoFar')}`, value: `${week.met}/${week.goals.length}` }] : []),
          ]}
        />
      ) : null}
    </Screen>
  );
}
