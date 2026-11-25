import { View } from 'react-native';

import { LOAD_DAY_MIN, weekProgress } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { NoDataScreen, ProgressBar } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';
import { router } from 'expo-router';

type GoalState = 'met' | 'onTrack' | 'behind';

function goalState(done: number, target: number, remaining: number): GoalState {
  if (done >= target) return 'met';
  return target - done <= remaining ? 'onTrack' : 'behind';
}

const STATE_KEY: Record<GoalState, TranslationKey> = {
  met: 'plan.state.met',
  onTrack: 'plan.state.onTrack',
  behind: 'plan.state.behind',
};

export default function PlanScreen() {
  const { days, userData } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const latest = days[days.length - 1];
  if (!latest) return <NoDataScreen title={t('plan.title')} />;

  const plan = userData.weeklyPlan;
  const progress = weekProgress(days, latest.day);

  const goal = (id: string, title: string, done: number, target: number, detail: string) => {
    const state = goalState(done, target, progress.remaining);
    return (
      <Card key={id} testID={`plan-goal-${id}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="cardTitle">{title}</AppText>
          <Chip tone={state === 'met' ? 'positive' : state === 'onTrack' ? 'info' : 'warning'} label={t(STATE_KEY[state])} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Num size={40}>{String(done)}</Num>
          <AppText variant="body" muted>
            {t('plan.of', { target })}
          </AppText>
        </View>
        <ProgressBar fraction={target === 0 ? 1 : done / target} label={title} color={state === 'met' ? colors.positive : colors.accent} />
        <AppText variant="label" muted>
          {detail}
        </AppText>
      </Card>
    );
  };

  return (
    <Screen
      tint="load"
      testID="plan-screen"
      header={
        <>
          <TopBar title={t('plan.title')} right={plan ? <IconButton icon="edit" label={t('plan.edit')} onPress={() => router.push('/plan/setup')} /> : undefined} />
          <AppText variant="lead" soft>
            {t('plan.week', { elapsed: progress.elapsed, remaining: progress.remaining })}
          </AppText>
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
      ) : (
        <>
          {goal('load', t('plan.goal.load'), progress.loadDays, plan.loadDays, t('plan.goal.loadDetail', { threshold: LOAD_DAY_MIN }))}
          {goal('sleep', t('plan.goal.sleep'), progress.sleepNightsMet, plan.sleepNights, t('plan.goal.sleepDetail', { measured: progress.sleepNightsMeasured }))}
        </>
      )}
      <ListGroup>
        <ListRow title={t('plan.link.weekly')} href="/plan/weekly-report" icon={{ icon: 'report', color: colors.accent, background: colors.accentSoft }} />
        <ListRow title={t('plan.link.monthly')} href="/plan/monthly-report" icon={{ icon: 'report', color: colors.accent, background: colors.accentSoft }} />
        <ListRow title={t('plan.link.week')} href="/load/week" icon={{ icon: 'calendar', color: colors.accent, background: colors.accentSoft }} />
      </ListGroup>
    </Screen>
  );
}
