import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData, useSyncProgress } from '@/data/context';
import type { LockState } from '@/data/types';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { BandActionsCard } from '@/ui/manage/BandActionsCard';
import { KeyValueRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { NotBuilt } from '@/ui/NotBuilt';
import { SyncBanner } from '@/ui/SyncBanner';
import { spacing, useTheme } from '@/ui/theme';

export default function DeviceSettingsScreen() {
  const { device, sync } = useAppData();
  const syncProgress = useSyncProgress();
  const { t } = useT();
  const { colors } = useTheme();

  const syncing = device.connection === 'syncing' || syncProgress !== null;
  const unknown = t('band.unknown');
  const nowS = Math.floor(Date.now() / 1000);
  const wear = device.band?.wear ?? null;
  const charging = device.band?.charging ?? null;
  const boot = device.band?.boot;
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

      <Card style={{ gap: 0 }} testID="band-status">
        <AppText variant="cardTitle">{t('device.status.title')}</AppText>
        <AppText variant="label" muted>
          {t('device.status.body')}
        </AppText>
        <KeyValueRow
          testID="band-status-wear"
          label={t('device.status.wear')}
          value={wear === null ? unknown : t(wear.phase === 'on' ? 'device.status.onWrist' : 'device.status.offWrist')}
        />
        {wear !== null && <KeyValueRow testID="band-status-wear-since" label={t('device.status.since')} value={formatAgo(t, nowS, wear.since)} />}
        <KeyValueRow
          testID="band-status-charging"
          label={t('device.status.charging')}
          value={charging === null ? unknown : t(charging.charging ? 'device.status.chargingYes' : 'device.status.chargingNo')}
        />
        {charging !== null && <KeyValueRow testID="band-status-charging-at" label={t('device.status.reported')} value={formatAgo(t, nowS, charging.at)} />}
      </Card>

      <Card style={{ gap: 0 }} testID="band-info">
        <AppText variant="cardTitle">{t('device.info.title')}</AppText>
        <KeyValueRow testID="band-info-signal" label={t('device.info.signalProcessing')} value={boot?.signalProcessingVersion ?? unknown} />
        <KeyValueRow testID="band-info-restarts" label={t('device.info.restarts')} value={boot?.bootCount === null || boot === undefined ? unknown : String(boot.bootCount)} />
        <KeyValueRow
          testID="band-info-last"
          label={t('device.info.lastRestart')}
          value={boot?.lastBootAt === null || boot === undefined ? unknown : formatAgo(t, nowS, boot.lastBootAt)}
        />
        <KeyValueRow
          testID="band-info-reason"
          label={t('device.info.restartReason')}
          value={boot?.rebootReason === null || boot === undefined ? unknown : `0x${boot.rebootReason.toString(16).padStart(4, '0')}`}
        />
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
      <CapHeader title={t('device.actions.title')} />
      <BandActionsCard />
      <NotBuilt issue="bandConfig" compact body={t('device.motionNotBuilt')} testID="motion-not-built" />

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
