import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { KeyValueRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { NotBuilt } from '@/ui/NotBuilt';

export default function BatteryPackScreen() {
  const { t } = useT();
  const { device } = useAppData();

  return (
    <SettingsPage title={t('device.batteryPack')} tint="neutral" testID="battery-pack">
      <Card style={{ gap: 6 }}>
        <AppText variant="bodyStrong">{t('device.pack.title')}</AppText>
        <AppText variant="label" muted>
          {t('device.pack.body')}
        </AppText>
      </Card>
      <Card style={{ gap: 0 }}>
        <KeyValueRow label={t('device.pack.bandBattery')} value={device.batteryPercent === null ? t('band.unknown') : `${device.batteryPercent}${t('unit.percent')}`} />
      </Card>
      <NotBuilt issue="battery" />
    </SettingsPage>
  );
}
