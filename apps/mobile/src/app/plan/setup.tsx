import { router } from 'expo-router';
import { useState } from 'react';

import { LOAD_DAY_MIN } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { Stepper } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';

const DEFAULT_PLAN = { loadDays: 3, sleepNights: 5 };

export default function PlanSetupScreen() {
  const { userData, updateUserData } = useAppData();
  const { t } = useT();
  const initial = userData.weeklyPlan ?? DEFAULT_PLAN;
  const [loadDays, setLoadDays] = useState(initial.loadDays);
  const [sleepNights, setSleepNights] = useState(initial.sleepNights);

  const save = async (): Promise<void> => {
    await updateUserData({ weeklyPlan: { loadDays, sleepNights } });
    router.replace('/plan');
  };

  const remove = async (): Promise<void> => {
    await updateUserData({ weeklyPlan: null });
    router.replace('/plan');
  };

  return (
    <Screen
      tint="load"
      testID="plan-setup"
      header={
        <>
          <TopBar title={t('plan.setup.title')} />
          <AppText variant="lead" soft>
            {t('plan.setup.intro')}
          </AppText>
        </>
      }
      footer={<Button label={t('plan.setup.save')} onPress={() => void save()} testID="plan-save" />}>
      <Stepper label={t('plan.setup.loadDays')} hint={t('plan.setup.loadDaysHint', { value: LOAD_DAY_MIN })} value={loadDays} min={0} max={7} onChange={setLoadDays} testID="plan-load-days" />
      <Stepper label={t('plan.setup.sleepNights')} hint={t('plan.setup.sleepNightsHint')} value={sleepNights} min={0} max={7} onChange={setSleepNights} testID="plan-sleep-nights" />
      <Card tone="outline">
        <AppText variant="label" muted>
          {t('plan.setup.note')}
        </AppText>
      </Card>
      {userData.weeklyPlan ? <Button label={t('plan.setup.remove')} variant="tertiary" onPress={() => void remove()} testID="plan-remove" /> : null}
    </Screen>
  );
}
