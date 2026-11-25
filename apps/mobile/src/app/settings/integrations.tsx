import { useT } from '@/i18n/useT';
import { Chip } from '@/ui/Chip';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { NotBuilt } from '@/ui/NotBuilt';
import { useTheme } from '@/ui/theme';

export default function IntegrationsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const status = <Chip label={t('appSettings.integrations.notBuilt')} tone="pink" small />;

  return (
    <SettingsPage title={t('appSettings.integrations')} tint="neutral" testID="integrations">
      <ListGroup>
        <ListRow icon={tile(colors, 'heart', 'positive')} title={t('appSettings.integrations.healthConnect')} subtitle={t('appSettings.integrations.healthConnectBody')} right={status} chevron={false} />
        <ListRow icon={tile(colors, 'load', 'warning')} title={t('appSettings.integrations.strava')} subtitle={t('appSettings.integrations.stravaBody')} right={status} chevron={false} />
        <ListRow icon={tile(colors, 'steps', 'info')} title={t('appSettings.integrations.scale')} subtitle={t('appSettings.integrations.scaleBody')} right={status} chevron={false} />
      </ListGroup>
      <CapHeader title={t('appSettings.integrations.importSection')} />
      <ListGroup>
        <ListRow icon={tile(colors, 'import', 'purple')} title={t('appSettings.integrations.importFile')} subtitle={t('appSettings.integrations.importFileBody')} href="/settings/import" />
        <ListRow icon={tile(colors, 'link', 'neutral')} title={t('appSettings.integrations.providers')} subtitle={t('appSettings.integrations.providersBody')} href="/settings/connect-provider" />
      </ListGroup>
      <NotBuilt issue="integrations" />
    </SettingsPage>
  );
}
