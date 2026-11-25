import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { NotBuilt } from '@/ui/NotBuilt';
import { useTheme } from '@/ui/theme';

export default function ConnectProviderScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const none = <Chip label={t('appSettings.provider.none')} small />;

  return (
    <SettingsPage title={t('appSettings.provider.title')} tint="neutral" testID="connect-provider">
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
      <NotBuilt issue="integrations" />
    </SettingsPage>
  );
}
