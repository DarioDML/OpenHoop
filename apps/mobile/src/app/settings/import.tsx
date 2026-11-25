import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { CapHeader } from '@/ui/ListGroup';
import { ExportCard } from '@/ui/manage/ExportCard';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { NotBuilt } from '@/ui/NotBuilt';

export default function ImportExportScreen() {
  const { t } = useT();

  return (
    <SettingsPage title={t('privacy.importExport')} tint="neutral" notice testID="import-export">
      <CapHeader title={t('settings.export')} />
      <ExportCard />
      <CapHeader title={t('privacy.import.title')} />
      <Card style={{ gap: 6 }}>
        <AppText variant="bodyStrong">{t('privacy.import.useTitle')}</AppText>
        <AppText variant="label" muted>
          {t('privacy.import.useBody')}
        </AppText>
      </Card>
      <Card style={{ gap: 6 }}>
        <AppText variant="bodyStrong">{t('privacy.import.localTitle')}</AppText>
        <AppText variant="label" muted>
          {t('privacy.import.localBody')}
        </AppText>
      </Card>
      <NotBuilt issue="import" />
    </SettingsPage>
  );
}
