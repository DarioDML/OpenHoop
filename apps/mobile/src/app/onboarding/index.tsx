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

const RING_MIN = 64;
const RING_MAX = 220;
const SPACER_MIN = spacing.md;

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
  const [ringSize, setRingSize] = useState(() => fitArt(null, height * 0.22, RING_MIN, RING_MAX));
  const shrink = (overflow: number): void => {
    if (overflow > 0) setRingSize((size) => fitArt(size - Math.ceil(overflow) - 1, size, RING_MIN, RING_MAX));
  };
  const grow = (spacer: number): void => {
    const spare = Math.floor((spacer - SPACER_MIN) * 2) - 2;
    if (spare > 0) setRingSize((size) => fitArt(size + spare, size, RING_MIN, RING_MAX));
  };

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
      tertiary={{ label: t('onboarding.welcome.demo'), onPress: () => void startDemo(), testID: 'welcome-demo' }}
      onOverflow={shrink}>
      <View style={{ flex: 1 }}>
        <AppText variant="title" style={{ fontFamily: fonts.bold, letterSpacing: -0.2 }} testID="welcome-wordmark">
          Open<AppText variant="title" style={{ fontFamily: fonts.medium }}>Hoop</AppText>
        </AppText>
        <View style={{ flex: 1, minHeight: SPACER_MIN }} onLayout={(event) => grow(event.nativeEvent.layout.height)} testID="welcome-space" />
        <View
          style={{ height: ringSize, alignItems: 'center', justifyContent: 'center' }}
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg }} testID="welcome-chips">
          <Chip label={t('onboarding.welcome.chipBands')} testID="welcome-chip-bands" />
          <Chip label={t('onboarding.welcome.chipOpen')} testID="welcome-chip-open" />
        </View>
        <View style={{ flex: 1, minHeight: SPACER_MIN }} />
      </View>
    </OnboardingPage>
  );
}
