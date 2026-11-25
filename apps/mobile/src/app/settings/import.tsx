import { useState } from 'react';

import { useAppData } from '@/data/context';
import { pickVendorFiles } from '@/data/vendorExport/pickFiles';
import type { VendorImportResult } from '@/data/vendorExport/summary';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { CapHeader } from '@/ui/ListGroup';
import { ExportCard } from '@/ui/manage/ExportCard';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { ImportResultCard, VendorHistory } from '@/ui/manage/VendorImport';
import { spacing } from '@/ui/theme';

export default function ImportExportScreen() {
  const { t } = useT();
  const { importVendorFiles } = useAppData();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VendorImportResult | null>(null);

  const choose = async (): Promise<void> => {
    setBusy(true);
    try {
      const picked = await pickVendorFiles();
      if (!picked.picked) return;
      setResult(await importVendorFiles(picked.files, picked.rejected));
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

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
      <Card style={{ gap: spacing.sm }} testID="import-how">
        <AppText variant="bodyStrong">{t('import.how.title')}</AppText>
        <AppText variant="label" muted>
          {t('import.how.body')}
        </AppText>
        <AppText variant="label" muted>
          {t('import.formats')}
        </AppText>
        <Button label={busy ? t('import.choosing') : t('import.choose')} onPress={() => void choose()} disabled={busy} testID="import-choose" />
      </Card>
      {result === null ? null : <ImportResultCard result={result} />}
      <VendorHistory onRemoved={() => setResult(null)} />
    </SettingsPage>
  );
}
