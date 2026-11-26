import { formatFirmware } from '@openhoop/protocol';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatAgo, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { KeyValueRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { StateCard } from '@/ui/StateCard';
import { spacing } from '@/ui/theme';

export default function BatteryPackScreen() {
  const { t, language } = useT();
  const { device } = useAppData();
  const pack = device.batteryPack;
  const unknown = t('band.unknown');
  const nowS = Math.floor(Date.now() / 1000);
  const reportedAt = pack === null ? null : (pack.socAt ?? pack.infoAt);

  return (
    <SettingsPage title={t('device.batteryPack')} tint="neutral" testID="battery-pack">
      <Card style={{ gap: 6 }}>
        <AppText variant="bodyStrong">{t('device.pack.title')}</AppText>
        <AppText variant="label" muted>
          {t('device.pack.body')}
        </AppText>
      </Card>
      <Card style={{ gap: 0 }}>
        <KeyValueRow label={t('device.pack.bandBattery')} value={device.batteryPercent === null ? unknown : `${device.batteryPercent}${t('unit.percent')}`} />
      </Card>
      {pack === null ? (
        <StateCard icon="battery" tone="neutral" title={t('device.pack.empty.title')} body={t('device.pack.empty.body')} testID="pack-empty" />
      ) : (
        <Card style={{ gap: 0 }} testID="pack-status">
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs }}>
            <AppText variant="cardTitle" style={{ flexShrink: 1 }}>
              {t('device.pack.reportTitle')}
            </AppText>
            <Chip label={t('device.pack.experimental')} small />
            <ParityBadge level={PARITY.batteryPack} long />
          </View>
          {pack.socPercent !== null && <KeyValueRow label={t('device.pack.charge')} value={`${formatNumber(pack.socPercent, 1, language)} %`} />}
          {reportedAt !== null && <KeyValueRow label={t('device.pack.reported')} value={formatAgo(t, nowS, reportedAt)} />}
          <KeyValueRow label={t('device.pack.serial')} value={pack.info?.serial ?? unknown} />
          <KeyValueRow label={t('device.pack.firmware')} value={pack.info === null ? unknown : formatFirmware(pack.info.firmware)} />
        </Card>
      )}
    </SettingsPage>
  );
}
