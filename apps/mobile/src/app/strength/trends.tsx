import type { MuscleGroup } from '@openhoop/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { formatWeekday } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { planInputFor } from '@/data/planInput';
import { MUSCLE_GROUPS, finishedSessions, formatVolume, percentChange, weeklyStats, type MuscleLoad } from '@/data/strength';
import { RANGE_WEEKS, TREND_RANGES, parseTrendRange, periodTotals, strengthGoal, strengthMinuteBars, type MinuteBar, type TrendRange } from '@/data/strengthTrends';
import { isoWeek } from '@/data/weeklyPlan';
import { useT } from '@/i18n/useT';
import { weightIn } from '@/lib/units';
import { ProgressBar } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card } from '@/ui/Card';
import { Button, Segmented } from '@/ui/controls';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { GridTile, StatGrid } from '@/ui/StatGrid';
import { MuscleLoadRows, StrengthPage, todayIso, useStrengthLabels } from '@/ui/strength/parts';
import { ValueBars } from '@/ui/ValueBars';
import { spacing, useTheme } from '@/ui/theme';

function monthLabel(day: string, language: 'en' | 'nl'): string {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short', timeZone: 'UTC' });
}

export default function StrengthTrendsScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { strength, activities, days, userData } = useAppData();
  const labels = useStrengthLabels();
  const [range, setRange] = useState<TrendRange>('1m');
  const weeks = RANGE_WEEKS[range];
  const today = todayIso();
  const now = new Date(Date.now());
  const input = planInputFor(days, strength.sessions, activities, [], today, now);
  const stats = weeklyStats(strength.sessions, today, weeks);
  const hasData = finishedSessions(strength.sessions).length > 0 && stats.some((week) => week.sessions > 0);
  const bars = strengthMinuteBars(range, input);
  const goal = strengthGoal(userData.weeklyPlan, input);
  const period = periodTotals(range, strength.sessions, today);
  const volume = formatVolume(period.volumeKg, labels.units, language);
  const change = percentChange(period.volumeKg, period.previousVolumeKg);

  const totalVolume = stats.reduce((sum, week) => sum + week.volumeKg, 0);
  const muscleTotals: MuscleLoad[] = MUSCLE_GROUPS.map((muscle: MuscleGroup) => {
    const rows = stats.flatMap((week) => week.byMuscle.filter((row) => row.muscle === muscle));
    return { muscle, sets: rows.reduce((sum, row) => sum + row.sets, 0), volumeKg: rows.reduce((sum, row) => sum + row.volumeKg, 0), share: null };
  })
    .filter((row) => row.sets > 0)
    .sort((a, b) => b.volumeKg - a.volumeKg || b.sets - a.sets)
    .map((row) => ({ ...row, share: totalVolume > 0 ? row.volumeKg / totalVolume : null }));

  const first = stats[0];
  const last = stats[stats.length - 1];
  const startLabel = first === undefined ? undefined : labels.day(first.weekStart);
  const endLabel = last === undefined ? undefined : labels.day(last.weekStart);

  const barLabel = (bar: MinuteBar): string =>
    bar.kind === 'day' ? formatWeekday(bar.start, language) : bar.kind === 'week' ? t('strength.trends.weekLabel', { week: isoWeek(bar.start) }) : monthLabel(bar.start, language);
  const highlight = bars.findIndex((bar) => bar.current);
  const unitTitle = bars[0]?.kind ?? 'week';

  return (
    <StrengthPage
      title={t('strength.trends.title')}
      testID="strength-trends"
      hero={
        <Segmented
          testID="trends-range"
          value={range}
          onChange={(value) => setRange(parseTrendRange(value))}
          options={TREND_RANGES.map((value) => ({ value, label: t(`strength.trends.range.${value}`), testID: `trends-range-${value}` }))}
        />
      }>
      <Card testID="trends-minutes-card">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="capSmall" muted style={{ flexShrink: 1 }}>
            {t(`strength.trends.minutes.${unitTitle}`)}
          </AppText>
          <AppText variant="label" muted>
            {t('strength.trends.minUnit')}
          </AppText>
        </View>
        <ValueBars
          testID="trends-minutes"
          height={110}
          highlight={highlight < 0 ? undefined : highlight}
          bars={bars.map((bar) => ({
            key: bar.key,
            color: colors.metric.loadBright,
            value: bar.minutes,
            label: barLabel(bar),
            display: bar.minutes === null ? undefined : `${bar.minutes}`,
            a11yLabel: `${barLabel(bar)}, ${t(bar.minutes === null ? 'strength.trends.future' : 'strength.trends.minutesA11y')}`,
          }))}
        />
        <AppText variant="caption" muted>
          {t('strength.trends.minutesNote')}
        </AppText>
      </Card>

      <Card testID="trends-goal">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <AppText variant="capSmall" muted>
            {t('strength.trends.goal')}
          </AppText>
          {goal.kind === 'goal' ? (
            <Num size={22} unit={t('strength.trends.minUnit')} unitSize={11} unitColor={colors.textMuted} testID="trends-goal-value">
              {t('strength.trends.goalValue', { done: goal.done, target: goal.target })}
            </Num>
          ) : null}
        </View>
        {goal.kind === 'goal' ? (
          <>
            <ProgressBar fraction={goal.target > 0 ? goal.done / goal.target : 0} color={colors.metric.loadBright} label={t('strength.trends.goal')} />
            <AppText variant="label" muted testID="trends-goal-text">
              {goal.left === 0
                ? t('strength.trends.goalMet')
                : goal.sessionsNeeded === null
                  ? t('strength.trends.goalLeft', { left: goal.left })
                  : `${t('strength.trends.goalLeft', { left: goal.left })} ${t('strength.trends.goalSessions', { count: goal.sessionsNeeded })}`}
            </AppText>
            <Button label={t('strength.trends.goalPlan')} variant="tertiary" onPress={() => router.push('/plan')} testID="trends-goal-plan" />
          </>
        ) : (
          <>
            <AppText variant="label" muted testID="trends-goal-none">
              {t(goal.kind === 'noPlan' ? 'strength.trends.noPlan' : 'strength.trends.noGoal')}
            </AppText>
            <Button
              label={t(goal.kind === 'noPlan' ? 'strength.trends.setUpPlan' : 'strength.trends.addGoal')}
              variant="secondary"
              onPress={() => router.push('/plan/setup')}
              testID="trends-goal-setup"
            />
          </>
        )}
      </Card>

      {!hasData ? (
        <Card>
          <AppText variant="body" muted testID="trends-empty">
            {t('strength.trends.empty')}
          </AppText>
        </Card>
      ) : (
        <>
          <StatGrid testID="trends-tiles">
            <GridTile
              label={t('strength.trends.total')}
              value={`${period.sessions}`}
              chip={{ label: t(`strength.trends.period.${range}`), tone: 'neutral' }}
              caption={t('strength.trends.perWeek', { value: labels.num(period.sessions / Math.max(1, period.elapsedDays / 7), 1) })}
              testID="trends-total"
            />
            <GridTile
              label={t('strength.trends.volumeTile')}
              value={volume.value}
              unit={volume.unit}
              chip={
                change === null
                  ? null
                  : { label: t(change > 0 ? 'strength.trends.changeUp' : change < 0 ? 'strength.trends.changeDown' : 'strength.trends.changeSame', { percent: Math.abs(change) }), tone: change > 0 ? 'positive' : 'neutral' }
              }
              caption={change === null ? t('strength.trends.changeNone') : t('strength.trends.changeNote')}
              testID="trends-volume-tile"
            />
          </StatGrid>
          <Section title={t('strength.trends.sessions')}>
            <Card>
              <BarChart
                testID="trends-sessions-chart"
                data={stats.map((week) => week.sessions)}
                formatTick={(value) => labels.num(value)}
                startLabel={startLabel}
                endLabel={endLabel}
              />
            </Card>
          </Section>
          <Section title={t('strength.trends.volume', { unit: labels.unit })}>
            <Card>
              <BarChart
                testID="trends-volume-chart"
                data={stats.map((week) => weightIn(week.volumeKg, labels.units))}
                formatTick={(value) => labels.num(value)}
                startLabel={startLabel}
                endLabel={endLabel}
              />
              <AppText variant="label" muted numeric testID="trends-volume-total">
                {t('strength.trends.volumeTotal')}: {labels.volumeText(totalVolume)}
              </AppText>
            </Card>
          </Section>
          <Section title={t('strength.trends.muscles')}>
            <Card testID="trends-muscles">
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                <ParityBadge level="C" />
                <AppText variant="caption" muted style={{ flex: 1 }}>
                  {t('strength.trends.musclesBody')}
                </AppText>
              </View>
              <MuscleLoadRows rows={muscleTotals} testID="trends-muscle-rows" />
            </Card>
          </Section>
        </>
      )}
    </StrengthPage>
  );
}
