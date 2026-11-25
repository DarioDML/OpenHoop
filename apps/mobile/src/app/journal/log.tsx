import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function JournalLogScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="journal-log"
      title={t('journal.log.title')}
      heading={t('journal.log.heading')}
      body={t('journal.log.body')}
      icon="mic"
      issue="voice"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('journal.log.p1'), t('journal.log.p2'), t('journal.log.p3')]}
    />
  );
}
