import { useState } from 'react';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { spacing } from '@/ui/theme';

export function ExportCard() {
  const { exportData } = useAppData();
  const { t } = useT();
  const [exporting, setExporting] = useState(false);

  const run = async (): Promise<void> => {
    setExporting(true);
    try {
      await exportData();
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <AppText variant="body" muted>
        {t('settings.exportBody')}
      </AppText>
      <AppText variant="label" muted>
        {t('settings.exportWarning')}
      </AppText>
      <Button label={exporting ? t('settings.exporting') : t('settings.exportAction')} onPress={() => void run()} disabled={exporting} testID="export-button" />
    </Card>
  );
}
