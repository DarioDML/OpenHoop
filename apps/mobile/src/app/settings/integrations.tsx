import { useEffect } from 'react';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { HC_EXPORT_TYPES, HC_IMPORT_TYPES } from '@/lib/healthConnectMapping';
import { Chip } from '@/ui/Chip';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { HealthConnectPanel } from '@/ui/manage/HealthConnectPanel';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { NotBuilt } from '@/ui/NotBuilt';
import { useTheme } from '@/ui/theme';

export default function IntegrationsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { healthConnect, refreshHealthConnect } = useAppData();
  useEffect(() => {
    void refreshHealthConnect();
  }, [refreshHealthConnect]);
  const { state, availability } = healthConnect;
  const notBuilt = <Chip label={t('appSettings.integrations.notBuilt')} tone="pink" small />;
  const on = HC_EXPORT_TYPES.some((type) => state.export[type]) || HC_IMPORT_TYPES.some((type) => state.import[type]);
  const hcStatus =
    availability === 'unsupported' ? (
      <Chip label={t('appSettings.integrations.androidOnly')} small testID="hc-status" />
    ) : (
      <Chip label={on ? t('appSettings.integrations.on') : t('appSettings.integrations.off')} tone={on ? 'positive' : 'neutral'} small testID="hc-status" />
    );

  return (
    <SettingsPage title={t('appSettings.integrations')} tint="neutral" notice testID="integrations">
      <ListGroup>
        <ListRow
          icon={tile(colors, 'heart', 'positive')}
          title={t('appSettings.integrations.healthConnect')}
          subtitle={t('appSettings.integrations.healthConnectBody')}
          right={hcStatus}
          chevron={false}
        />
      </ListGroup>
      <HealthConnectPanel />
      <CapHeader title={t('appSettings.integrations.importSection')} />
      <ListGroup>
        <ListRow icon={tile(colors, 'steps', 'info')} title={t('appSettings.integrations.scale')} subtitle={t('appSettings.integrations.scaleBody')} chevron={false} />
        <ListRow icon={tile(colors, 'load', 'warning')} title={t('appSettings.integrations.strava')} subtitle={t('appSettings.integrations.stravaBody')} right={notBuilt} chevron={false} />
        <ListRow icon={tile(colors, 'import', 'purple')} title={t('appSettings.integrations.importFile')} subtitle={t('appSettings.integrations.importFileBody')} href="/settings/import" />
        <ListRow icon={tile(colors, 'link', 'neutral')} title={t('appSettings.integrations.providers')} subtitle={t('appSettings.integrations.providersBody')} href="/settings/connect-provider" />
      </ListGroup>
      <NotBuilt issue="integrations" body={t('appSettings.integrations.othersNotBuilt')} />
    </SettingsPage>
  );
}
