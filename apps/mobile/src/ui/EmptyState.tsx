import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Card } from './Card';

export function EmptyState() {
  const { t } = useT();
  return (
    <Card style={{ gap: 6 }}>
      <AppText variant="title">{t('empty.title')}</AppText>
      <AppText variant="body" muted>
        {t('empty.body')}
      </AppText>
    </Card>
  );
}
