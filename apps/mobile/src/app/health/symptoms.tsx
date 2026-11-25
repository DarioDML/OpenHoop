import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function SymptomsScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-symptoms"
      title={t('health.symptoms.title')}
      heading={t('health.symptoms.heading')}
      body={t('health.symptoms.body')}
      icon="journal"
      issue="cycle"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.symptoms.p1'), t('health.symptoms.p2'), t('health.symptoms.p3')]}
    />
  );
}
