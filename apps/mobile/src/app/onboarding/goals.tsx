import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { GOALS, type Goal } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon, type IconName } from '@/ui/Icon';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { radius, spacing, useTheme } from '@/ui/theme';

const GOAL_ICONS: Readonly<Record<Goal, IconName>> = {
  sleep: 'moon',
  recovery: 'heart',
  fitness: 'load',
  stress: 'wind',
  health: 'health',
  performance: 'trophy',
};

export default function GoalsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
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
      step={4}
      title={t('onboarding.goals.title')}
      subtitle={t('onboarding.goals.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => void next() }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {GOALS.map((goal) => {
          const on = selected.includes(goal);
          return (
            <Pressable
              key={goal}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t(`onboarding.goal.${goal}`)}
              onPress={() => toggle(goal)}
              testID={`goal-${goal}`}
              style={{
                width: '47.5%',
                minHeight: 88,
                borderRadius: radius.md,
                borderWidth: 2,
                borderColor: on ? colors.text : 'transparent',
                backgroundColor: colors.surface,
                padding: spacing.lg,
                gap: spacing.sm,
                justifyContent: 'center',
              }}>
              <Icon name={GOAL_ICONS[goal]} color={on ? colors.text : colors.textMuted} size={22} />
              <AppText variant="bodyStrong">{t(`onboarding.goal.${goal}`)}</AppText>
            </Pressable>
          );
        })}
      </View>
      <Card style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('onboarding.goals.controlTitle')}</AppText>
        <AppText variant="label" muted>
          {t('onboarding.goals.controlBody')}
        </AppText>
      </Card>
    </OnboardingPage>
  );
}
