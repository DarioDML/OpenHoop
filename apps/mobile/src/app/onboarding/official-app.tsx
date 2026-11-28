import { router } from 'expo-router';
import { useState } from 'react';

import { useAppData } from '@/data/context';
import type { OfficialAppMode } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, RadioRow } from '@/ui/controls';
import { NoteBox } from '@/ui/manage/NoteBox';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { useTheme } from '@/ui/theme';

export default function OfficialAppScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData, updateUserData, device } = useAppData();
  const [mode, setMode] = useState<OfficialAppMode>(userData.officialAppMode ?? 'only');

  const choose = (next: OfficialAppMode): void => {
    setMode(next);
    void updateUserData({ officialAppMode: next });
  };

  const next = async (): Promise<void> => {
    if (userData.officialAppMode !== mode) await updateUserData({ officialAppMode: mode });
    router.push('/onboarding/pair');
  };

  return (
    <OnboardingPage
      screen="official"
      title={t('onboarding.official.title')}
      subtitle={t('onboarding.official.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => void next() }}>
      <RadioRow
        label={t('onboarding.official.only')}
        subtitle={t('onboarding.official.onlyBody')}
        selected={mode === 'only'}
        onSelect={() => choose('only')}
        accent={colors.positive}
        testID="official-only"
      />
      <RadioRow
        label={t('onboarding.official.switch')}
        subtitle={t('onboarding.official.switchBody')}
        selected={mode === 'switch'}
        onSelect={() => choose('switch')}
        accent={colors.positive}
        testID="official-switch"
      />
      <NoteBox
        icon="info"
        title={mode === 'only' ? t('onboarding.official.guideOnlyTitle') : t('onboarding.official.guideSwitchTitle')}
        body={mode === 'only' ? t('onboarding.official.guideOnlyBody') : t('onboarding.official.guideSwitchBody')}
        testID="official-guide"
      />
      <NoteBox icon="lock" tone="warning" title={t('onboarding.official.firmwareTitle')} body={t('onboarding.official.firmwareBody')} testID="official-firmware" />
      <AppText variant="label" muted testID="official-firmware-note">
        {device.firmware === null ? t('onboarding.official.firmwareNote') : t('onboarding.official.firmwareNoteKnown', { version: device.firmware })}
      </AppText>
      <Card style={{ gap: 4 }} testID="onboarding-import-card">
        <AppText variant="bodyStrong">{t('onboarding.official.importTitle')}</AppText>
        <AppText variant="label" muted>
          {t('onboarding.official.importBody')}
        </AppText>
        <Button label={t('onboarding.official.importAction')} variant="tertiary" icon="import" onPress={() => router.push('/settings/import')} style={{ alignSelf: 'flex-start', minHeight: 44 }} testID="onboarding-import" />
      </Card>
    </OnboardingPage>
  );
}
