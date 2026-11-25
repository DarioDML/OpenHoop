import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { MIN_BASELINE_NIGHTS } from '@/data/derived';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { radius, spacing, useTheme } from '@/ui/theme';

const MILESTONES: ReadonlyArray<{ night: number; key: TranslationKey }> = [
  { night: 1, key: 'onboarding.calibration.night1' },
  { night: 3, key: 'onboarding.calibration.night3' },
  { night: 4, key: 'onboarding.calibration.night4' },
];

export default function CalibrationScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { days, updateUserData } = useAppData();

  const nights = days.filter((day) => day.sleep.asleepS !== null).length;
  const done = Math.min(MIN_BASELINE_NIGHTS, nights);
  const left = MIN_BASELINE_NIGHTS - done;

  const finish = async (): Promise<void> => {
    await updateUserData({ onboardingDone: true });
    router.replace('/');
  };

  return (
    <OnboardingPage
      step={11}
      title={t('onboarding.calibration.title', { count: MIN_BASELINE_NIGHTS })}
      subtitle={t('onboarding.calibration.subtitle')}
      primary={{ label: t('onboarding.calibration.home'), onPress: () => void finish(), testID: 'calibration-finish' }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {Array.from({ length: MIN_BASELINE_NIGHTS }, (_, index) => (
          <View key={index} style={{ flex: 1, gap: 6, alignItems: 'center' }}>
            <View style={{ height: 8, alignSelf: 'stretch', borderRadius: radius.pill, backgroundColor: index < done ? colors.positive : colors.surface3 }} />
            <AppText variant="caption" muted>
              {t('onboarding.calibration.night', { n: index + 1 })}
            </AppText>
          </View>
        ))}
      </View>
      <AppText variant="bodyStrong" testID="calibration-status">
        {left === 0 ? t('onboarding.calibration.ready') : t('onboarding.calibration.left', { count: left })}
      </AppText>
      <Card style={{ gap: spacing.lg }}>
        {MILESTONES.map((milestone) => (
          <View key={milestone.night} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Icon name={done >= milestone.night ? 'check' : 'moon'} color={done >= milestone.night ? colors.positive : colors.textMuted} size={20} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{t('onboarding.calibration.night', { n: milestone.night })}</AppText>
              <AppText variant="label" muted>
                {t(milestone.key)}
              </AppText>
            </View>
          </View>
        ))}
      </Card>
    </OnboardingPage>
  );
}
