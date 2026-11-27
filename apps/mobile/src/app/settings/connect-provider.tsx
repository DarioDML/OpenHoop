import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { featureEnabled } from '@/net/features';
import { useStrava } from '@/strava/context';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { stravaStatus } from '@/ui/strava/status';
import { useTheme } from '@/ui/theme';

export default function ConnectProviderScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData } = useAppData();
  const { state } = useStrava();
  const none = <Chip label={t('appSettings.provider.none')} small />;
  const status = stravaStatus(state, featureEnabled(userData.network, 'strava'));

  return (
    <SettingsPage title={t('appSettings.provider.title')} tint="neutral" testID="connect-provider">
      <ListGroup>
        <ListRow
          icon={tile(colors, 'load', 'warning')}
          title={t('appSettings.integrations.strava')}
          subtitle={t('strava.integrationsBody')}
          right={<Chip small label={t(`strava.status.${status}`)} tone={status === 'connected' ? 'positive' : status === 'reconnect' ? 'warning' : 'neutral'} />}
          href="/settings/strava"
          testID="provider-strava"
        />
      </ListGroup>
      <Card style={{ gap: 6 }}>
        <AppText variant="bodyStrong">{t('appSettings.provider.partnerTitle')}</AppText>
        <AppText variant="label" muted>
          {t('appSettings.provider.partnerBody')}
        </AppText>
      </Card>
      <ListGroup>
        <ListRow icon={tile(colors, 'drop', 'negative')} title={t('appSettings.provider.labs')} right={none} chevron={false} />
        <ListRow icon={tile(colors, 'heart', 'info')} title={t('appSettings.provider.clinician')} right={none} chevron={false} />
        <ListRow icon={tile(colors, 'journal', 'purple')} title={t('appSettings.provider.records')} right={none} chevron={false} />
        <ListRow icon={tile(colors, 'community', 'positive')} title={t('appSettings.provider.teams')} right={none} chevron={false} />
      </ListGroup>
      <AppText variant="label" muted>
        {t('appSettings.provider.consent')}
      </AppText>
    </SettingsPage>
  );
}
