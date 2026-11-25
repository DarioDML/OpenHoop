import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { LockState } from '@/data/types';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { KeyValueRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { NotBuilt } from '@/ui/NotBuilt';
import { SyncBanner } from '@/ui/SyncBanner';
import { spacing, useTheme } from '@/ui/theme';

export default function DeviceSettingsScreen() {
  const { device, sync, syncProgress } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();

  const syncing = device.connection === 'syncing' || syncProgress !== null;
  const unknown = t('band.unknown');
  const nowS = Math.floor(Date.now() / 1000);
  const lockBody: Record<LockState, string> = {
    open: t('lock.open.body'),
    locked: t('lock.locked.body'),
    'no-data': t('lock.no-data.body'),
    unknown: t('lock.unknown.body'),
  };

  return (
    <SettingsPage title={t('device.title')} tint="neutral" notice testID="device-settings">
      <SyncBanner detailed />
      <Card style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
          <AppText variant="cardTitle" style={{ flex: 1 }}>
            {device.name ?? unknown}
          </AppText>
          <Chip label={t(`connection.${device.connection}`)} tone={device.connection === 'disconnected' ? 'neutral' : 'positive'} />
        </View>
        <KeyValueRow label={t('band.model')} value={device.model ?? unknown} />
        <KeyValueRow label={t('band.firmware')} value={device.firmware ?? unknown} />
        <KeyValueRow label={t('band.battery')} value={device.batteryPercent === null ? unknown : `${device.batteryPercent}${t('unit.percent')}`} />
        <KeyValueRow label={t('band.lastSync')} value={device.lastSyncAt === null ? t('band.neverSynced') : formatAgo(t, nowS, device.lastSyncAt)} />
        <KeyValueRow label={t('band.backlog')} value={device.backlogPages === null ? unknown : t('band.backlogPages', { count: device.backlogPages })} />
        <KeyValueRow label={t('band.connection')} value={t(`connection.${device.connection}`)} />
        <KeyValueRow label={t('band.lock')} value={t(`lock.${device.lockState}`)} />
      </Card>

      {device.lockState === 'locked' ? (
        <Card tone="warning" style={{ gap: 6 }}>
          <AppText variant="bodyStrong" color={colors.warning}>
            {t('lock.locked.title')}
          </AppText>
          <AppText variant="body">{lockBody.locked}</AppText>
        </Card>
      ) : device.lockState !== 'open' ? (
        <Card>
          <AppText variant="body" muted>
            {lockBody[device.lockState]}
          </AppText>
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Button label={syncing ? t('band.syncing') : t('band.sync')} onPress={() => void sync()} disabled={syncing} testID="sync-button" />
        <Button label={t('band.pair')} variant="secondary" onPress={() => router.push('/onboarding/pair')} testID="pair-link" />
      </View>

      <CapHeader title={t('device.bandSection')} />
      <ListGroup>
        <ListRow icon={tile(colors, 'settings', 'info')} title={t('device.config')} subtitle={t('device.configBody')} href="/settings/band-config" />
        <ListRow icon={tile(colors, 'plug', 'gold')} title={t('device.batteryPack')} subtitle={t('device.batteryPackBody')} href="/settings/battery-pack" />
      </ListGroup>
      <NotBuilt issue="bandConfig" compact body={t('device.actionsNotBuilt')} />

      <CapHeader title={t('device.firmwareSection')} />
      <Card style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('device.firmwareTitle')}</AppText>
        <AppText variant="label" muted>
          {t('device.firmwareBody')}
        </AppText>
      </Card>

      <CapHeader title={t('danger.title')} />
      <Card tone="warning" style={{ gap: spacing.md }}>
        <AppText variant="body" muted>
          {t('danger.intro')}
        </AppText>
        <Button label={t('danger.entry')} variant="secondary" onPress={() => router.push('/settings/safety-lock')} testID="danger-entry" />
      </Card>
    </SettingsPage>
  );
}
