import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { GOALS, type Goal } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { CheckPill } from '@/ui/manage/CheckPill';
import { NoteBox } from '@/ui/manage/NoteBox';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { spacing } from '@/ui/theme';

export default function GoalsScreen() {
  const { t } = useT();
  const { userData, updateUserData } = useAppData();
  const [selected, setSelected] = useState<Goal[]>(userData.goals);

  const toggle = (goal: Goal): void => {
    setSelected((current) => (current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal]));
  };

  const next = async (): Promise<void> => {
    await updateUserData({ goals: selected });
    router.push('/onboarding/permissions');
  };

  return (
    <OnboardingPage
      screen="goals"
      title={t('onboarding.goals.title')}
      subtitle={t('onboarding.goals.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => void next() }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {GOALS.map((goal) => (
          <CheckPill key={goal} label={t(`onboarding.goal.${goal}`)} selected={selected.includes(goal)} onPress={() => toggle(goal)} testID={`goal-${goal}`} />
        ))}
      </View>
      <NoteBox icon="eye" title={t('onboarding.goals.controlTitle')} body={t('onboarding.goals.controlBody')} testID="goals-control" />
    </OnboardingPage>
  );
}
