import { router } from 'expo-router';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { radius, spacing, useTheme } from '@/ui/theme';

export default function OfficialAppScreen() {
  const { t } = useT();
  const { colors } = useTheme();

  return (
    <OnboardingPage
      step={6}
      title={t('onboarding.official.title')}
      subtitle={t('onboarding.official.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => router.push('/onboarding/pair') }}
      secondary={{ label: t('onboarding.official.importAction'), onPress: () => router.push('/settings/import'), testID: 'onboarding-import' }}>
      <Card tone="accent" style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('onboarding.official.onlyTitle')}</AppText>
        <AppText variant="label" muted>
          {t('onboarding.official.onlyBody')}
        </AppText>
      </Card>
      <Card style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('onboarding.official.switchTitle')}</AppText>
        <AppText variant="label" muted>
          {t('onboarding.official.switchBody')}
        </AppText>
      </Card>
      <Card style={{ gap: 4 }} testID="onboarding-import-card">
        <AppText variant="bodyStrong">{t('onboarding.official.importTitle')}</AppText>
        <AppText variant="label" muted>
          {t('onboarding.official.importBody')}
        </AppText>
      </Card>
      <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.warningSoft }}>
        <Icon name="alert" color={colors.warning} size={22} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong">{t('onboarding.official.firmwareTitle')}</AppText>
          <AppText variant="label" muted>
            {t('onboarding.official.firmwareBody')}
          </AppText>
        </View>
      </View>
    </OnboardingPage>
  );
}
