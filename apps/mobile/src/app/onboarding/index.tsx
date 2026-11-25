import { router } from 'expo-router';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { useTheme } from '@/ui/theme';

interface RingSpec {
  r: number;
  color: string;
  fraction: number;
}

export default function WelcomeScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { updateSettings, updateUserData } = useAppData();

  const useDemo = async (): Promise<void> => {
    await updateSettings({ dataSource: 'demo' });
    await updateUserData({ onboardingDone: true });
    router.replace('/');
  };

  const rings: RingSpec[] = [
    { r: 96, color: colors.metric.load, fraction: 0.63 },
    { r: 72, color: colors.metric.readinessMid, fraction: 0.62 },
    { r: 48, color: colors.metric.sleep, fraction: 0.95 },
  ];

  return (
    <OnboardingPage
      step={1}
      hideBack
      testID="onboarding-welcome"
      title={t('onboarding.welcome.title')}
      subtitle={t('onboarding.welcome.subtitle')}
      primary={{ label: t('onboarding.welcome.start'), onPress: () => router.push('/onboarding/profile'), testID: 'welcome-start' }}
      secondary={{ label: t('onboarding.welcome.haveData'), onPress: () => router.push('/settings/import') }}
      tertiary={{ label: t('onboarding.welcome.demo'), onPress: () => void useDemo(), testID: 'welcome-demo' }}>
      <View style={{ flex: 1, gap: 16 }}>
        <AppText variant="title" style={{ fontWeight: '700' }}>
          Open<AppText variant="title" style={{ fontWeight: '500' }}>Hoop</AppText>
        </AppText>
        <View style={{ alignItems: 'center', paddingVertical: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={220} height={220} viewBox="0 0 220 220">
            {rings.map((ring) => {
              const c = 2 * Math.PI * ring.r;
              return [
                <Circle key={`t${ring.r}`} cx={110} cy={110} r={ring.r} fill="none" stroke={colors.ringTrack} strokeWidth={12} />,
                <Circle
                  key={`f${ring.r}`}
                  cx={110}
                  cy={110}
                  r={ring.r}
                  fill="none"
                  stroke={ring.color}
                  strokeWidth={12}
                  strokeLinecap="round"
                  strokeDasharray={`${c * ring.fraction} ${c}`}
                  transform="rotate(-90 110 110)"
                />,
              ];
            })}
          </Svg>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Chip label={t('onboarding.welcome.chipBands')} />
          <Chip label={t('onboarding.welcome.chipOpen')} />
        </View>
      </View>
    </OnboardingPage>
  );
}
