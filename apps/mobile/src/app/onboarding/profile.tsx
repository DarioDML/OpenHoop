import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Field } from '@/ui/controls';
import { Icon, type IconName } from '@/ui/Icon';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { NotBuilt } from '@/ui/NotBuilt';
import { spacing, useTheme } from '@/ui/theme';

const PROMISES: ReadonlyArray<{ icon: IconName; key: TranslationKey }> = [
  { icon: 'shield', key: 'onboarding.profile.promiseLocal' },
  { icon: 'lock', key: 'onboarding.profile.promiseTracking' },
  { icon: 'export', key: 'onboarding.profile.promiseExport' },
];

export default function ProfileScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData, updateUserData } = useAppData();
  const [name, setName] = useState(userData.name ?? '');

  const next = async (): Promise<void> => {
    const trimmed = name.trim();
    await updateUserData({ name: trimmed === '' ? null : trimmed.slice(0, 40) });
    router.push('/onboarding/body');
  };

  return (
    <OnboardingPage
      step={2}
      title={t('onboarding.profile.title')}
      subtitle={t('onboarding.profile.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => void next() }}>
      <Field label={t('onboarding.profile.nameLabel')} value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" autoCorrect={false} testID="name-input" />
      <NotBuilt issue="backup" compact body={t('onboarding.profile.accountNotBuilt')} />
      <Card style={{ gap: spacing.md }}>
        <AppText variant="capLarge" muted>
          {t('onboarding.profile.promiseTitle')}
        </AppText>
        {PROMISES.map((promise) => (
          <View key={promise.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Icon name={promise.icon} color={colors.positive} size={20} />
            <AppText variant="body" style={{ flex: 1 }}>
              {t(promise.key)}
            </AppText>
          </View>
        ))}
      </Card>
    </OnboardingPage>
  );
}
