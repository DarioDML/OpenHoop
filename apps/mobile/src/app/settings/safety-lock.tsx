import { Stack } from 'expo-router';
import { useState } from 'react';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { ConfirmDangerDialog } from '@/ui/ConfirmDangerDialog';
import { Button } from '@/ui/controls';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { useTheme } from '@/ui/theme';

export default function SafetyLockScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <SettingsPage title={t('device.safety.title')} tint="neutral" testID="safety-lock">
      <Stack.Screen options={{ presentation: 'modal' }} />
      <Card tone="danger" style={{ gap: 8 }}>
        <AppText variant="cardTitle" color={colors.negative}>
          {t('device.safety.heading')}
        </AppText>
        <AppText variant="body">{t('device.safety.body')}</AppText>
      </Card>
      <Card style={{ gap: 6 }}>
        <AppText variant="bodyStrong">{t('device.safety.howTitle')}</AppText>
        <AppText variant="label" muted>
          {t('device.safety.howBody')}
        </AppText>
      </Card>
      <Button label={t('danger.entry')} variant="danger" onPress={() => setOpen(true)} testID="safety-entry" />
      <AppText variant="label" muted>
        {t('danger.note')}
      </AppText>
      <ConfirmDangerDialog
        visible={open}
        commandName={t('danger.command')}
        title={t('danger.dialogTitle')}
        body={t('danger.dialogBody', { command: t('danger.command') })}
        inputLabel={t('danger.inputLabel')}
        confirmLabel={t('danger.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </SettingsPage>
  );
}
