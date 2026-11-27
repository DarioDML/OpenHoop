import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatHm, formatLongDay, formatMinutes, mainNightSpan, sliceEndingAt } from '@/data/dailyDerived';
import {
  SLEEP_STRESS_BUCKET_S,
  effectiveGoal,
  needBreakdown,
  planScoreOf,
  sleepContributors,
  sleepStress,
  tonightPlan,
  weakestContributor,
  type Contributor,
  type ContributorId,
} from '@/data/sleepDerived';
import type { TermId } from '@/data/terms';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber, formatShortDay } from '@/lib/format';
import { formatTemperature, formatTemperatureDelta, temperatureUnit, useUnits } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card, CardHeader } from '@/ui/Card';
import { CoachAsk } from '@/ui/CoachAsk';
import { Button } from '@/ui/controls';
import { Divider, NoDataPage, Page, StatRow } from '@/ui/daily/bits';
import { useExplain } from '@/ui/explain/ExplainProvider';
import { FlagNotice } from '@/ui/FlagNotice';
import type { IconName } from '@/ui/Icon';
import { LevelNote } from '@/ui/LevelNote';
import { MetricTile } from '@/ui/MetricTile';
import { Num } from '@/ui/Num';
import { PARITY } from '@/ui/parity';
import { ScoreRing } from '@/ui/ScoreRing';
import { ContributorRow } from '@/ui/sleep/ContributorRow';
import { NeedBar, NeedLegend } from '@/ui/sleep/NeedBar';
import { useNightHeartRate } from '@/ui/sleep/useNightHeartRate';
import { SleepTimeline } from '@/ui/SleepTimeline';
import { StageCard } from '@/ui/StageCard';
import { IconButton } from '@/ui/TopBar';
import { radius, spacing, useTheme } from '@/ui/theme';

const CONTRIBUTOR_UI: Readonly<Record<ContributorId, { icon: IconName; label: TranslationKey; term: TermId; testID: string }>> = {
  hoursVsNeed: { icon: 'clock', label: 'sleepx.hoursVsNeed', term: 'hoursVsNeed', testID: 'contrib-hours' },
  consistency: { icon: 'calendar', label: 'metric.consistency', term: 'consistency', testID: 'contrib-consistency' },
  efficiency: { icon: 'trends', label: 'sleepx.efficiency', term: 'efficiency', testID: 'contrib-efficiency' },
  sleepStress: { icon: 'pulse', label: 'term.sleepStress.name', term: 'sleepStress', testID: 'contrib-stress' },
};

function HeroPill({ label, value, testID }: { label: string; value: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <AppText variant="label" muted>
        {label}
      </AppText>
      <Num size={20} testID={testID}>
        {value}
      </Num>
    </View>
  );
}

export default function SleepScreen() {
  const { days, userData } = useAppData();
  const { t, language, reason } = useT();
  const { colors } = useTheme();
  const explain = useExplain();
  const units = useUnits();
  const index = days.length - 1;
  const day = days[index];
  const night = day ? mainNightSpan(day) : null;
  const heart = useNightHeartRate(night, SLEEP_STRESS_BUCKET_S);
  if (!day) return <NoDataPage title={t('score.sleep')} body={t('empty.body')} />;

  const { sleep } = day;
  const need = sleep.need.value;
  const stress = night === null ? null : sleepStress(heart.points);
  const stressReason = night === null ? 'no-sleep' : 'low-coverage';
  const contributors = sleepContributors(day, stress?.pct ?? null, stressReason);
  const weakest = weakestContributor(contributors);
  const breakdown = needBreakdown(days, index);
  const planScore = planScoreOf(userData.weeklyPlan);
  const goal = effectiveGoal(userData.sleepGoal, planScore);
  const plan = tonightPlan(days, index, goal, planScore);
  const bed = plan?.bed ?? null;
  const week = sliceEndingAt(days, 7, index);
  const tile = { style: { flexBasis: '47%', flexGrow: 1 } } as const;
  const duration = (seconds: number): string => formatDuration(t, seconds);
  const noSleepReason = (value: number | null): string | null => (value === null ? 'no-sleep' : null);
  const coverage = (value: number | null): string | undefined => (value === null ? undefined : t('sleep.coverage', { pct: Math.round(value * 100) }));
  const shownPct = (c: Contributor) => ({ value: c.value === null ? null : String(c.value), unit: t('unit.percent'), reason: c.reason });

  const question = (): string => {
    if (weakest === null || weakest.status === null) return t('sleepHome.ask.none');
    if (weakest.status === 'optimal') return t('sleepHome.ask.allGood');
    return t(`sleepHome.ask.${weakest.id}`, { status: t(`sleepHome.statusLower.${weakest.status}`) });
  };

  return (
    <Page
      title={t('score.sleep')}
      tint="sleep"
      testID="sleep"
      right={
        <IconButton
          icon="info"
          label={t('sleepHome.about')}
          testID="sleep-about"
          onPress={() => explain.about({ term: 'sleepScore', index, shown: { value: sleep.score.value === null ? null : formatNumber(sleep.score.value, 0, language), unit: t('unit.percent'), reason: sleep.score.reason } })}
        />
      }
      hero={
        <View style={{ alignItems: 'center', gap: 20 }}>
          <AppText variant="label" color={colors.levelC} numeric>
            {formatLongDay(day.day, language)}
            {night ? ` · ${formatClock(night.onset, day.tzOffsetS)} – ${formatClock(night.offset, day.tzOffsetS)}` : ''}
          </AppText>
          <ScoreRing
            testID="ring-sleep-score"
            label={t('metric.sleepScore')}
            value={sleep.score.value}
            max={100}
            level={PARITY.sleepScore}
            reason={sleep.score.reason}
            color={colors.metric.sleep}
            size={200}
            strokeWidth={10}
            numberSize={88}
            unitSize={40}
            sublabelSize={12}
            unit="%"
            sublabel={t('metric.sleepScore')}
            showLabel={false}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
            <HeroPill label={t('sleepx.slept')} value={sleep.asleepS === null ? reason('no-sleep') : formatHm(sleep.asleepS)} testID="slept" />
            <HeroPill label={t('sleepx.needed')} value={need === null ? reason(sleep.need.reason) : formatHm(need)} testID="needed" />
          </View>
        </View>
      }>
      <FlagNotice flags={day.flags} />

      <AppText variant="capLarge" muted accessibilityRole="header">
        {t('sleepx.contributors')}
      </AppText>
      <Card testID="card-contributors" style={{ gap: 0, paddingVertical: spacing.xs }}>
        {contributors.map((c, i) => {
          const ui = CONTRIBUTOR_UI[c.id];
          return (
            <ContributorRow
              key={c.id}
              icon={ui.icon}
              label={t(ui.label)}
              target={{ term: ui.term, index, shown: shownPct(c) }}
              value={c.value}
              status={c.status}
              pending={c.id === 'sleepStress' && night !== null && !heart.loaded}
              last={i === contributors.length - 1}
              testID={ui.testID}
            />
          );
        })}
      </Card>

      <Card href={`/sleep/last-night?day=${day.day}`} testID="link-last-night" accessibilityLabel={t('sleepx.lastNight')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="cardTitle">{t('sleepx.lastNight')}</AppText>
            <AppText variant="label" muted>
              {t('sleepHome.lastNightHint')}
            </AppText>
          </View>
          <AppText variant="title" muted>
            ›
          </AppText>
        </View>
      </Card>

      <Card href="/sleep/need" testID="link-need" accessibilityLabel={t('metric.need')} style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md }}>
          <AppText variant="cardTitle">{t('metric.need')}</AppText>
          {need === null ? (
            <AppText variant="label" muted>
              {reason(sleep.need.reason)}
            </AppText>
          ) : (
            <Num size={28} testID="need-total">
              {formatHm(need)}
            </Num>
          )}
        </View>
        {breakdown !== null ? (
          <>
            <NeedBar breakdown={breakdown} testID="need-bar" />
            <NeedLegend breakdown={breakdown} testID="need-legend" />
          </>
        ) : null}
      </Card>

      <Card testID="card-planner" style={{ gap: 14 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('sleepx.planner')} onPress={() => router.push('/sleep/planner')} testID="planner-open" style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="cardTitle">{t('sleepx.planner')}</AppText>
            <AppText variant="capSmall" color={colors.purple} testID="planner-goal" style={{ flexShrink: 1, textAlign: 'right' }}>
              {t(`planner.goal.${goal}`)}
            </AppText>
          </View>
          {bed ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View style={{ gap: 6 }}>
                <AppText variant="capSmall" muted>
                  {t('sleepx.bedBy')}
                </AppText>
                <Num size={40} testID="planner-bed">
                  {formatMinutes(bed.bedMinutes)}
                </Num>
              </View>
              <View style={{ gap: 6, alignItems: 'flex-end' }}>
                <AppText variant="capSmall" muted>
                  {t('sleepx.wake')}
                </AppText>
                <Num size={40} testID="planner-wake">
                  {formatMinutes(bed.wakeMinutes)}
                </Num>
              </View>
            </View>
          ) : (
            <AppText variant="body" muted testID="planner-none">
              {t('sleepx.plannerNone')}
            </AppText>
          )}
        </Pressable>
        {bed ? <Button label={t('alarm.save')} testID="planner-set-alarm" onPress={() => router.push(`/sleep/alarm?minutes=${Math.round(bed.wakeMinutes) % 1440}`)} /> : null}
      </Card>

      <CoachAsk question={question()} testID="sleep-coach" />

      <Card testID="card-timeline" style={{ gap: spacing.md }}>
        <CardHeader title={t('sleep.timeline')} />
        {sleep.periods.length > 0 ? (
          <SleepTimeline periods={sleep.periods} tzOffsetS={day.tzOffsetS} />
        ) : (
          <AppText variant="body" muted>
            {t('sleep.noPeriods')}
          </AppText>
        )}
      </Card>

      <StageCard stages={sleep.stages} edited={sleep.periods.some((p) => !p.nap && p.source === 'edited')} />

      <Card style={{ gap: spacing.md }}>
        <CardHeader title={t('sleepx.sevenDays')} />
        <BarChart
          testID="chart-week-asleep"
          data={week.map((d) => (d.sleep.asleepS === null ? null : d.sleep.asleepS / 3600))}
          formatTick={(v) => `${formatNumber(v, 0, language)} h`}
          startLabel={week[0] ? formatShortDay(week[0].day, language) : undefined}
          endLabel={formatShortDay(day.day, language)}
        />
      </Card>

      <Card style={{ gap: 0 }} testID="card-links">
        <CardHeader title={t('sleepHome.links')} />
        <StatRow label={t('sleepx.trends')} value="" href="/sleep/trends" testID="link-trends" />
        <Divider />
        <StatRow label={t('sleepx.alarm')} value="" href="/sleep/alarm" testID="link-alarm" />
        <Divider />
        <StatRow label={t('sleepx.jetLag')} value="" href="/sleep/jet-lag" testID="link-jet-lag" />
      </Card>

      <AppText variant="capLarge" muted>
        {t('sleep.summary')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <MetricTile {...tile} testID="tile-asleep" explain={{ term: 'asleep', index }} label={t('metric.asleep')} value={sleep.asleepS} reason={noSleepReason(sleep.asleepS)} format={duration} level={PARITY.sleep} />
        <MetricTile {...tile} testID="tile-inbed" explain={{ term: 'inBed', index }} label={t('metric.inBed')} value={sleep.inBedS} reason={noSleepReason(sleep.inBedS)} format={duration} level={PARITY.sleep} />
        <MetricTile {...tile} testID="tile-need" explain={{ term: 'sleepNeed', index }} label={t('metric.need')} value={sleep.need.value} reason={sleep.need.reason} format={duration} level={PARITY.sleepNeed} href="/sleep/need" />
        <MetricTile {...tile} testID="tile-debt" explain={{ term: 'sleepDebt', index }} label={t('metric.debt')} value={sleep.debt.value} reason={sleep.debt.reason} format={duration} level={PARITY.sleepNeed} href="/sleep/need" />
        <MetricTile {...tile} testID="tile-consistency" explain={{ term: 'consistency', index }} label={t('metric.consistency')} value={sleep.consistency.value} reason={sleep.consistency.reason} unit={t('unit.percent')} level={PARITY.consistency} />
      </View>

      <AppText variant="capLarge" muted>
        {t('sleep.signals')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <MetricTile {...tile} explain={{ term: 'hrv', index }} label={t('metric.hrv')} value={day.hrv.value} reason={day.hrv.reason} unit={t('unit.ms')} level={PARITY.hrv} caption={coverage(day.hrv.coverage)} href="/recovery/metric/hrv" />
        <MetricTile {...tile} explain={{ term: 'restingHr', index }} label={t('metric.restingHr')} value={day.restingHr.value} reason={day.restingHr.reason} unit={t('unit.bpm')} level={PARITY.restingHr} caption={coverage(day.restingHr.coverage)} href="/recovery/metric/rhr" />
        <MetricTile {...tile} explain={{ term: 'respiratoryRate', index }} label={t('metric.respiratoryRate')} value={day.respiratoryRate.value} reason={day.respiratoryRate.reason} unit={t('unit.perMin')} level={PARITY.respiratoryRate} decimals={1} caption={coverage(day.respiratoryRate.coverage)} href="/recovery/metric/resp" />
        <MetricTile {...tile} explain={{ term: 'spo2', index }} label={t('metric.spo2')} value={day.spo2.value} reason={day.spo2.reason} unit={t('unit.percent')} level={PARITY.spo2} decimals={1} caption={coverage(day.spo2.coverage)} href="/recovery/metric/spo2" />
        <MetricTile {...tile} explain={{ term: 'skinTemp', index }} label={t('metric.skinTemp')} value={day.skinTempC.value} reason={day.skinTempC.reason} unit={temperatureUnit(units)} format={(v) => formatTemperature(v, units, language).value} level={PARITY.skinTemp} caption={coverage(day.skinTempC.coverage)} href="/recovery/metric/temp" />
        <MetricTile {...tile} explain={{ term: 'skinTempChange', index }} label={t('metric.skinTempDeviation')} value={day.skinTempDeviationC.value} reason={day.skinTempDeviationC.reason} unit={temperatureUnit(units)} format={(v) => formatTemperatureDelta(v, units, language, 2).value} level={PARITY.skinTemp} caption={coverage(day.skinTempDeviationC.coverage)} />
      </View>

      <LevelNote level={PARITY.sleepScore} text={t('sleepHome.level')} testID="sleep-level" />
    </Page>
  );
}
