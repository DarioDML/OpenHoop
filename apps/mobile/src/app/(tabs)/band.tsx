import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { LockState } from '@/data/types';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { ConfirmDangerDialog } from '@/ui/ConfirmDangerDialog';
import { Button } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';

interface RowProps {
  label: string;
  value: string;
}

function Row({ label, value }: RowProps) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: 32 }}>
      <AppText variant="body" muted>
        {label}
      </AppText>
      <AppText variant="bodyStrong" numeric style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}

export default function BandScreen() {
  const { device, sync } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [dangerOpen, setDangerOpen] = useState(false);

  const syncing = device.connection === 'syncing';
  const unknown = t('band.unknown');
  const lockBody: Record<LockState, string> = {
    open: t('lock.open.body'),
    locked: t('lock.locked.body'),
    'no-data': t('lock.no-data.body'),
    unknown: t('lock.unknown.body'),
  };
  const lockLabel: Record<LockState, string> = {
    open: t('lock.open'),
    locked: t('lock.locked'),
    'no-data': t('lock.no-data'),
    unknown: t('lock.unknown'),
  };
  const nowS = Math.floor(Date.now() / 1000);

  return (
    <Screen>
      <Card style={{ gap: spacing.xs }}>
        <AppText variant="title">{device.name ?? unknown}</AppText>
        <Row label={t('band.model')} value={device.model ?? unknown} />
        <Row label={t('band.firmware')} value={device.firmware ?? unknown} />
        <Row label={t('band.battery')} value={device.batteryPercent === null ? unknown : `${device.batteryPercent}${t('unit.percent')}`} />
        <Row label={t('band.lastSync')} value={device.lastSyncAt === null ? t('band.neverSynced') : formatAgo(t, nowS, device.lastSyncAt)} />
        <Row label={t('band.backlog')} value={device.backlogPages === null ? unknown : t('band.backlogPages', { count: device.backlogPages })} />
        <Row label={t('band.connection')} value={t(`connection.${device.connection}`)} />
        <Row label={t('band.lock')} value={lockLabel[device.lockState]} />
      </Card>

      {device.lockState === 'locked' ? (
        <Card tone="warning" style={{ gap: 6 }} >
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
        <Button label={t('band.pair')} variant="secondary" onPress={() => router.push('/pairing')} />
      </View>

      <Section title={t('danger.title')}>
        <Card tone="warning" style={{ gap: spacing.md }}>
          <AppText variant="body" muted>
            {t('danger.intro')}
          </AppText>
          <Button label={t('danger.entry')} variant="secondary" onPress={() => setDangerOpen(true)} testID="danger-entry" />
        </Card>
      </Section>

      <ConfirmDangerDialog
        visible={dangerOpen}
        commandName={t('danger.command')}
        title={t('danger.dialogTitle')}
        body={t('danger.dialogBody', { command: t('danger.command') })}
        inputLabel={t('danger.inputLabel')}
        confirmLabel={t('danger.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setDangerOpen(false)}
        onConfirm={() => setDangerOpen(false)}
      />
    </Screen>
  );
}
