import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { fitArt, useLayout } from '@/ui/layout';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { fonts, spacing, useTheme } from '@/ui/theme';

const RING_MIN = 96;
const RING_MAX = 220;

interface RingSpec {
  r: number;
  color: string;
  fraction: number;
}

export default function WelcomeScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { updateSettings, updateUserData } = useAppData();
  const { height } = useLayout();
  const [ringArea, setRingArea] = useState<number | null>(null);
  const ringSize = fitArt(ringArea, height * 0.22, RING_MIN, RING_MAX);

  const startDemo = async (): Promise<void> => {
    try {
      await updateSettings({ dataSource: 'demo' });
      if (!(await updateUserData({ onboardingDone: true }))) return;
    } catch {
      return;
    }
    router.replace('/');
  };

  const rings: RingSpec[] = [
    { r: 96, color: colors.metric.load, fraction: 0.63 },
    { r: 72, color: colors.metric.readinessMid, fraction: 0.62 },
    { r: 48, color: colors.metric.sleep, fraction: 0.95 },
  ];

  return (
    <OnboardingPage
      screen="welcome"
      hideBack
      testID="onboarding-welcome"
      title={t('onboarding.welcome.title')}
      subtitle={t('onboarding.welcome.subtitle')}
      primary={{ label: t('onboarding.welcome.start'), onPress: () => router.push('/onboarding/profile'), testID: 'welcome-start' }}
      secondary={{ label: t('onboarding.welcome.haveData'), onPress: () => router.push('/settings/integrations'), testID: 'welcome-have-data' }}
      tertiary={{ label: t('onboarding.welcome.demo'), onPress: () => void startDemo(), testID: 'welcome-demo' }}>
      <View style={{ flex: 1, gap: spacing.lg }}>
        <AppText variant="title" style={{ fontFamily: fonts.bold, letterSpacing: -0.2 }} testID="welcome-wordmark">
          Open<AppText variant="title" style={{ fontFamily: fonts.medium }}>Hoop</AppText>
        </AppText>
        <View
          style={{ flex: 1, minHeight: RING_MIN, alignItems: 'center', justifyContent: 'center' }}
          onLayout={(event) => {
            const next = Math.floor(event.nativeEvent.layout.height);
            if (next > 0 && next !== ringArea) setRingArea(next);
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="welcome-ring">
          <Svg width={ringSize} height={ringSize} viewBox="0 0 220 220">
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm }}>
          <Chip label={t('onboarding.welcome.chipBands')} testID="welcome-chip-bands" />
          <Chip label={t('onboarding.welcome.chipOpen')} testID="welcome-chip-open" />
        </View>
      </View>
    </OnboardingPage>
  );
}
