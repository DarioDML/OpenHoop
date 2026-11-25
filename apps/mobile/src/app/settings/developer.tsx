import { useAppData } from '@/data/context';
import type { DataSource } from '@/data/types';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Segmented } from '@/ui/controls';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { KeyValueRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { useTheme } from '@/ui/theme';

export default function DeveloperScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { settings, updateSettings, device, days } = useAppData();

  return (
    <SettingsPage title={t('dev.title')} tint="neutral" testID="developer">
      <Card style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('dev.intro')}</AppText>
        <AppText variant="label" muted>
          {t('dev.introBody')}
        </AppText>
      </Card>

      <ListGroup>
        <ListRow icon={tile(colors, 'code', 'positive')} title={t('settings.selftest')} subtitle={t('dev.selftestBody')} href="/settings/selftest" testID="selftest-link" />
        <ListRow icon={tile(colors, 'layers', 'purple')} title={t('dev.states')} subtitle={t('dev.statesBody')} href="/settings/states" testID="states-link" />
      </ListGroup>

      <CapHeader title={t('settings.dataSource')} />
      <Segmented<DataSource>
        value={settings.dataSource}
        onChange={(dataSource) => void updateSettings({ dataSource })}
        options={[
          { value: 'demo', label: t('settings.source.demo') },
          { value: 'band', label: t('settings.source.band') },
        ]}
      />

      <CapHeader title={t('dev.state')} />
      <Card style={{ gap: 0 }}>
        <KeyValueRow label={t('band.connection')} value={t(`connection.${device.connection}`)} />
        <KeyValueRow label={t('band.lock')} value={t(`lock.${device.lockState}`)} />
        <KeyValueRow label={t('dev.days')} value={String(days.length)} />
      </Card>
      <AppText variant="label" muted>
        {t('dev.noPacketLog')}
      </AppText>
    </SettingsPage>
  );
}
