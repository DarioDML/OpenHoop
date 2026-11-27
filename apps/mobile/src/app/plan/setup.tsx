import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { LOAD_DAY_MIN } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import {
  defaultPlan,
  goalTargetKeys,
  isFineTuned,
  MAX_PLAN_GOALS,
  PLAN_GOALS,
  setTarget,
  TARGET_LIMITS,
  toggleGoal,
  withLevel,
  type PlanLevel,
  type TargetKey,
  type WeeklyPlan,
} from '@/data/weeklyPlan';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { Stepper } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Toggle } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { CapHeader } from '@/ui/ListGroup';
import { Screen } from '@/ui/Screen';
import { StepSlider } from '@/ui/StepSlider';
import { GOAL_ICON, goalColors, goalTarget } from '@/ui/plan/goals';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

export default function PlanSetupScreen() {
  const { userData, updateUserData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const stepsGoal = userData.stepsGoal;
  const [plan, setPlan] = useState<WeeklyPlan>(userData.weeklyPlan ?? defaultPlan(stepsGoal));
  const fmt = (value: number): string => formatNumber(value, 0, language);
  const full = plan.goals.length >= MAX_PLAN_GOALS;

  const save = async (): Promise<void> => {
    const stored = await updateUserData({ weeklyPlan: plan });
    if (stored) router.replace('/plan');
  };

  const remove = async (): Promise<void> => {
    const stored = await updateUserData({ weeklyPlan: null });
    if (stored) router.replace('/plan');
  };

  const stepper = (key: TargetKey) => {
    const limits = TARGET_LIMITS[key];
    const common = { value: plan[key], min: limits.min, max: limits.max, step: limits.step, onChange: (value: number) => setPlan((p) => setTarget(p, key, value)) };
    if (key === 'loadDays') return <Stepper key={key} {...common} label={t('plan.setup.loadDays')} hint={t('plan.setup.loadDaysHint', { value: LOAD_DAY_MIN })} testID="plan-load-days" />;
    if (key === 'sleepNights') return <Stepper key={key} {...common} label={t('plan.setup.nights')} hint={t('plan.setup.nightsHint', { min: plan.sleepScoreMin })} testID="plan-sleep-nights" />;
    if (key === 'sleepScoreMin') return <Stepper key={key} {...common} label={t('plan.setup.scoreMin')} hint={t('plan.setup.scoreMinHint')} format={(v) => `${v}%`} testID="plan-sleep-score" />;
    if (key === 'strengthMinutes') return <Stepper key={key} {...common} label={t('plan.setup.strength')} hint={t('plan.setup.strengthHint')} format={(v) => t('plan.minutes', { minutes: v })} testID="plan-strength" />;
    return <Stepper key={key} {...common} label={t('plan.setup.steps')} hint={t('plan.setup.stepsHint')} format={fmt} testID="plan-steps" />;
  };

  return (
    <Screen tint="home" testID="plan-setup" header={<TopBar title={t('plan.title')} />}>
      <AppText variant="body" muted>
        {t('plan.setup.pick')}
      </AppText>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 4, paddingHorizontal: spacing.lg }}>
        {PLAN_GOALS.map((goal, index) => {
          const on = plan.goals.includes(goal);
          const tone = goalColors(colors, goal);
          const title = t(`plan.goal.${goal}.title`);
          return (
            <View
              key={goal}
              testID={`plan-goal-row-${goal}`}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, paddingVertical: spacing.sm }, index < PLAN_GOALS.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null]}>
              <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={GOAL_ICON[goal]} color={tone.fg} size={20} />
              </View>
              <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                <AppText variant="body" style={{ fontWeight: '500' }}>
                  {title}
                </AppText>
                <AppText variant="label" muted>
                  {goalTarget(t, plan, goal, fmt)}
                </AppText>
              </View>
              <Toggle value={on} onChange={(next) => setPlan((p) => toggleGoal(p, goal, next))} disabled={!on && full} label={title} testID={`plan-goal-toggle-${goal}`} />
            </View>
          );
        })}
      </View>
      {full ? (
        <AppText variant="caption" muted testID="plan-goals-full">
          {t('plan.setup.full', { max: MAX_PLAN_GOALS })}
        </AppText>
      ) : null}

      <Card>
        <AppText variant="capSmall" muted>
          {t('plan.setup.difficulty')}
        </AppText>
        <StepSlider<PlanLevel>
          testID="plan-level"
          label={t('plan.setup.difficulty')}
          value={plan.level}
          onChange={(level) => setPlan((p) => withLevel(p, level, stepsGoal))}
          options={[
            { value: 'easy', label: t('plan.level.easy') },
            { value: 'balanced', label: t('plan.level.balanced') },
            { value: 'hard', label: t('plan.level.hard') },
          ]}
        />
        <AppText variant="caption" muted testID="plan-level-note">
          {isFineTuned(plan, stepsGoal) ? t('plan.setup.fineTuned') : t('plan.setup.levelNote')}
        </AppText>
      </Card>

      {plan.goals.length > 0 ? (
        <>
          <CapHeader title={t('plan.setup.targets')} />
          {plan.goals.flatMap(goalTargetKeys).map(stepper)}
        </>
      ) : (
        <AppText variant="body" muted testID="plan-no-goals">
          {t('plan.setup.noGoals')}
        </AppText>
      )}

      <Button label={t('plan.setup.save')} onPress={() => void save()} disabled={plan.goals.length === 0} testID="plan-save" />
      <Card tone="outline">
        <AppText variant="label" muted>
          {t('plan.setup.note')}
        </AppText>
      </Card>
      {userData.weeklyPlan ? <Button label={t('plan.setup.remove')} variant="tertiary" onPress={() => void remove()} testID="plan-remove" /> : null}
    </Screen>
  );
}
