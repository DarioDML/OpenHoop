import { router } from 'expo-router';
import { View } from 'react-native';

import { LOAD_DAY_MIN, mergeSteps } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { defaultPlan, planAdvice, planWeek, type GoalProgress, type GoalState, type WeeklyPlan } from '@/data/weeklyPlan';
import type { TranslationKey } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { NoDataScreen } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { CoachAsk } from '@/ui/CoachAsk';
import { Button } from '@/ui/controls';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { GoalDots } from '@/ui/plan/GoalDots';
import { formatDayRange, weekProgressText } from '@/ui/plan/goals';
import { Screen } from '@/ui/Screen';
import { StateCard } from '@/ui/StateCard';
import { spacing, useTheme, type ColorTokens } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';

const STATE_KEY: Record<GoalState, TranslationKey> = {
  met: 'plan.state.met',
  onTrack: 'plan.state.onTrack',
  behind: 'plan.state.behind',
};

const STATE_TONE = { met: 'positive', onTrack: 'info', behind: 'warning' } as const;

function goalColor(colors: ColorTokens, g: GoalProgress): string {
  return g.goal === 'sleepScore' ? colors.purple : colors.metric.loadBright;
}

function stepsPerDay(g: GoalProgress, remaining: number): number {
  return Math.ceil(g.left / (remaining + 1) / 100) * 100;
}

function countText(t: TFunction, g: GoalProgress, plan: WeeklyPlan, fmt: (v: number) => string): string {
  if (g.goal === 'loadDays') return t('plan.count.days', { done: g.done, target: g.target });
  if (g.goal === 'sleepScore') return t('plan.count.nights', { done: g.done, target: g.target });
  if (g.goal === 'strength') return t('plan.count.minutes', { done: g.done, target: g.target });
  return t('plan.count.steps', { done: fmt(g.measured === 0 ? 0 : g.done / g.measured), target: fmt(plan.steps) });
}

function leftText(t: TFunction, g: GoalProgress, remaining: number, fmt: (v: number) => string): string {
  if (g.state === 'met') return t('plan.done');
  if (g.state === 'behind') return t('plan.state.behind');
  if (g.goal === 'loadDays') return g.left === 1 ? t('plan.short.days.one') : t('plan.short.days.other', { count: g.left });
  if (g.goal === 'sleepScore') return g.left === 1 ? t('plan.short.nights.one') : t('plan.short.nights.other', { count: g.left });
  if (g.goal === 'strength') return t('plan.short.minutes', { minutes: g.left });
  return t('plan.short.steps', { steps: fmt(stepsPerDay(g, remaining)) });
}

function detailText(t: TFunction, g: GoalProgress, plan: WeeklyPlan): string {
  if (g.goal === 'loadDays') return t('plan.goal.loadDetail', { threshold: LOAD_DAY_MIN });
  if (g.goal === 'sleepScore') return t('plan.detail.sleepScore', { min: plan.sleepScoreMin, measured: g.measured });
  if (g.goal === 'strength') return t('plan.detail.strength');
  return t('plan.detail.steps');
}

export default function PlanScreen() {
  const { days, userData, strength, activities, healthConnect, updateUserData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const latest = days[days.length - 1];
  if (!latest) return <NoDataScreen title={t('plan.thisWeek')} tint="home" />;

  const plan = userData.weeklyPlan;
  const now = new Date();
  const week = planWeek(plan ?? { ...defaultPlan(userData.stepsGoal), goals: [] }, {
    days,
    sessions: strength.sessions,
    activities,
    steps: mergeSteps(days, healthConnect.state.steps),
    today: latest.day,
    nowS: Math.floor(now.getTime() / 1000),
    tzOffsetS: deviceTzOffsetS(now),
  });
  const fmt = (value: number): string => formatNumber(value, 0, language);
  const advice = plan === null ? [] : planAdvice(plan, week, latest);
  const hasGoals = plan !== null && plan.goals.length > 0;

  return (
    <Screen
      tint="home"
      testID="plan-screen"
      header={
        <>
          <TopBar title={t('plan.thisWeek')} right={plan ? <IconButton icon="edit" label={t('plan.edit')} onPress={() => router.push('/plan/setup')} testID="plan-edit" /> : undefined} />
          <View style={{ gap: spacing.sm }}>
            <AppText variant="cap" soft testID="plan-week-range">
              {t('plan.weekRange', { week: week.isoWeek, range: formatDayRange(week.start, week.end, language) })}
            </AppText>
            {hasGoals ? (
              <>
                <Num size={64} testID="plan-summary">
                  {t('plan.summary', { count: week.onTrack, total: week.goals.length })}
                </Num>
                <AppText variant="label" soft>
                  {t('plan.summaryLabel')}
                </AppText>
              </>
            ) : null}
            <AppText variant="label" soft testID="plan-days">
              {weekProgressText(t, week.elapsed, week.remaining)}
            </AppText>
          </View>
        </>
      }>
      {plan === null ? (
        <Card testID="plan-empty">
          <AppText variant="cardTitle">{t('plan.none.title')}</AppText>
          <AppText variant="body" muted>
            {t('plan.none.body')}
          </AppText>
          <Button label={t('plan.none.cta')} onPress={() => router.push('/plan/setup')} testID="plan-cta" />
        </Card>
      ) : !hasGoals ? (
        <Card testID="plan-no-goals">
          <AppText variant="cardTitle">{t('plan.noGoals.title')}</AppText>
          <AppText variant="body" muted>
            {t('plan.noGoals.body')}
          </AppText>
          <Button label={t('plan.edit')} onPress={() => router.push('/plan/setup')} testID="plan-cta" />
        </Card>
      ) : (
        <>
          {plan.sleepScoreNotice && plan.goals.includes('sleepScore') ? (
            <StateCard
              icon="info"
              tone="info"
              title={t('plan.notice.sleepTitle')}
              body={plan.sleepNights === 1 ? t('plan.notice.sleepBodyOne', { min: plan.sleepScoreMin }) : t('plan.notice.sleepBody', { min: plan.sleepScoreMin, count: plan.sleepNights })}
              actionLabel={t('plan.notice.dismiss')}
              onAction={() => void updateUserData({ weeklyPlan: { ...plan, sleepScoreNotice: false } })}
              testID="plan-sleep-notice"
            />
          ) : null}
          <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
            {week.goals.map((g, index) => {
              const color = goalColor(colors, g);
              const count = countText(t, g, plan, fmt);
              return (
                <View
                  key={g.goal}
                  testID={`plan-goal-${g.goal}`}
                  style={[{ gap: 10, paddingVertical: 14 }, index < week.goals.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
                      <AppText variant="capLarge">{t(`plan.cap.${g.goal}`)}</AppText>
                      <Chip small tone={STATE_TONE[g.state]} label={t(STATE_KEY[g.state])} testID={`plan-state-${g.goal}`} />
                    </View>
                    <AppText variant="label" muted numeric testID={`plan-count-${g.goal}`}>
                      {count}
                    </AppText>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                    <GoalDots dots={g.dots} color={color} label={`${t(`plan.goal.${g.goal}.title`)}: ${count}`} testID={`plan-dots-${g.goal}`} />
                    <AppText variant="label" color={colors.textSoft} style={{ flexShrink: 1, textAlign: 'right' }} testID={`plan-left-${g.goal}`}>
                      {leftText(t, g, week.remaining, fmt)}
                    </AppText>
                  </View>
                  <AppText variant="caption" muted>
                    {detailText(t, g, plan)}
                  </AppText>
                </View>
              );
            })}
          </Card>
          <Card testID="plan-left">
            <CardHeader title={t('plan.whatsLeft')} />
            {advice.map((line, i) => (
              <AppText key={`${line.key}-${i}`} variant="body" color={colors.textSoft}>
                {t(line.key, line.params)}
              </AppText>
            ))}
          </Card>
          <CoachAsk question={t('plan.coach.rearrange')} testID="plan-coach" />
        </>
      )}
      <ListGroup>
        <ListRow title={t('plan.link.weekly')} href="/plan/weekly-report" icon={{ icon: 'report', color: colors.accent, background: colors.accentSoft }} testID="plan-link-weekly" />
        <ListRow title={t('plan.link.monthly')} href="/plan/monthly-report" icon={{ icon: 'report', color: colors.accent, background: colors.accentSoft }} testID="plan-link-monthly" />
        <ListRow title={t('plan.link.week')} href="/load/week" icon={{ icon: 'calendar', color: colors.accent, background: colors.accentSoft }} testID="plan-link-week" />
      </ListGroup>
    </Screen>
  );
}
