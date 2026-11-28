import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { useAppData } from '@/data/context';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Field } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { issueUrl } from '@/ui/NotBuilt';
import { spacing, useTheme } from '@/ui/theme';

const PROMISES: readonly TranslationKey[] = ['onboarding.profile.promiseLocal', 'onboarding.profile.promiseTracking', 'onboarding.profile.promiseExport'];

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
      screen="profile"
      title={t('onboarding.profile.title')}
      subtitle={t('onboarding.profile.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => void next() }}>
      <Field label={t('onboarding.profile.nameLabel')} value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" autoCorrect={false} testID="name-input" />
      <ListGroup>
        <ListRow
          title={t('onboarding.profile.accountTitle')}
          subtitle={t('onboarding.profile.accountBody')}
          right={<Chip label={t('notBuilt.title')} tone="pink" small testID="account-not-built" />}
          chevron={false}
          onPress={() => void Linking.openURL(issueUrl('backup'))}
          testID="account-row"
        />
      </ListGroup>
      <Card style={{ gap: spacing.md }} testID="privacy-promise">
        <AppText variant="cardTitle">{t('onboarding.profile.promiseTitle')}</AppText>
        {PROMISES.map((key) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="check" color={colors.positive} size={20} strokeWidth={2.25} />
            <AppText variant="body" soft style={{ flex: 1 }}>
              {t(key)}
            </AppText>
          </View>
        ))}
      </Card>
    </OnboardingPage>
  );
}
