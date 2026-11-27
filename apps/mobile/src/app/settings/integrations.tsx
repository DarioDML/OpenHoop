import { useEffect } from 'react';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { HC_EXPORT_TYPES, HC_IMPORT_TYPES } from '@/lib/healthConnectMapping';
import { featureEnabled } from '@/net/features';
import { useStrava } from '@/strava/context';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { HealthConnectPanel } from '@/ui/manage/HealthConnectPanel';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { stravaStatus } from '@/ui/strava/status';
import { useTheme } from '@/ui/theme';

export default function IntegrationsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { healthConnect, refreshHealthConnect, userData } = useAppData();
  const strava = useStrava();
  useEffect(() => {
    void refreshHealthConnect();
  }, [refreshHealthConnect]);
  const { state, availability } = healthConnect;
  const stravaState = stravaStatus(strava.state, featureEnabled(userData.network, 'strava'));
  const stravaChip = (
    <Chip
      small
      label={t(`strava.status.${stravaState}`)}
      tone={stravaState === 'connected' ? 'positive' : stravaState === 'reconnect' ? 'warning' : 'neutral'}
      testID="strava-status"
    />
  );
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
        <ListRow icon={tile(colors, 'load', 'warning')} title={t('appSettings.integrations.strava')} subtitle={t('strava.integrationsBody')} right={stravaChip} href="/settings/strava" testID="strava-row" />
        <ListRow icon={tile(colors, 'import', 'purple')} title={t('appSettings.integrations.importFile')} subtitle={t('appSettings.integrations.importFileBody')} href="/settings/import" />
        <ListRow icon={tile(colors, 'link', 'neutral')} title={t('appSettings.integrations.providers')} subtitle={t('appSettings.integrations.providersBody')} href="/settings/connect-provider" />
      </ListGroup>
      <AppText variant="caption" muted testID="integrations-others">
        {t('appSettings.integrations.othersNotBuilt')}
      </AppText>
    </SettingsPage>
  );
}
