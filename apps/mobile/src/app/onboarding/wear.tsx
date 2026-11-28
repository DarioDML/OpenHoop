import { router } from 'expo-router';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon, type IconName } from '@/ui/Icon';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { radius, spacing, useTheme } from '@/ui/theme';

const PLACES: ReadonlyArray<{ icon: IconName; title: TranslationKey; body: TranslationKey }> = [
  { icon: 'band', title: 'onboarding.wear.wrist', body: 'onboarding.wear.wristBody' },
  { icon: 'dumbbell', title: 'onboarding.wear.bicep', body: 'onboarding.wear.bicepBody' },
  { icon: 'layers', title: 'onboarding.wear.garment', body: 'onboarding.wear.garmentBody' },
];

const TIPS: readonly TranslationKey[] = ['onboarding.wear.tip1', 'onboarding.wear.tip2', 'onboarding.wear.tip3'];

export default function WearGuideScreen() {
  const { t } = useT();
  const { colors } = useTheme();

  return (
    <OnboardingPage
      screen="wear"
      title={t('onboarding.wear.title')}
      subtitle={t('onboarding.wear.subtitle')}
      primary={{ label: t('onboarding.wear.done'), onPress: () => router.push('/onboarding/calibration') }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {PLACES.map((place) => (
          <View key={place.title} style={{ flex: 1, alignItems: 'center', gap: 6, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface }}>
            <Icon name={place.icon} color={colors.accent} size={26} />
            <AppText variant="bodyStrong" style={{ textAlign: 'center' }}>
              {t(place.title)}
            </AppText>
            <AppText variant="caption" muted style={{ textAlign: 'center' }}>
              {t(place.body)}
            </AppText>
          </View>
        ))}
      </View>
      <Card style={{ gap: spacing.md }}>
        <AppText variant="capLarge" muted>
          {t('onboarding.wear.tips')}
        </AppText>
        {TIPS.map((tip) => (
          <View key={tip} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Icon name="check" color={colors.positive} size={18} />
            <AppText variant="body" style={{ flex: 1 }}>
              {t(tip)}
            </AppText>
          </View>
        ))}
      </Card>
    </OnboardingPage>
  );
}
