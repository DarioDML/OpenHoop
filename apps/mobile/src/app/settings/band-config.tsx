import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { KeyValueRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { NotBuilt } from '@/ui/NotBuilt';
import { ParityBadge } from '@/ui/ParityBadge';
import { spacing } from '@/ui/theme';

export default function BandConfigScreen() {
  const { t } = useT();
  const { device } = useAppData();
  const unknown = t('band.unknown');

  return (
    <SettingsPage title={t('device.config')} tint="neutral" testID="band-config">
      <Card style={{ gap: spacing.xs }}>
        <KeyValueRow label={t('band.model')} value={device.model ?? unknown} />
        <KeyValueRow label={t('band.firmware')} value={device.firmware ?? unknown} />
        <KeyValueRow label={t('band.lock')} value={t(`lock.${device.lockState}`)} />
      </Card>
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <AppText variant="bodyStrong">{t('device.flags.title')}</AppText>
          <Chip label={t('device.flags.unread')} small />
        </View>
        <AppText variant="label" muted>
          {t('device.flags.body')}
        </AppText>
      </Card>
      <NotBuilt issue="bandConfig" />
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <ParityBadge level="D" />
        <AppText variant="label" muted style={{ flex: 1 }}>
          {t('device.flags.levelD')}
        </AppText>
      </View>
    </SettingsPage>
  );
}
