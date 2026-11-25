import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function LabsScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-labs"
      title={t('health.labs.title')}
      heading={t('health.labs.heading')}
      body={t('health.labs.body')}
      icon="drop"
      issue="labs"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.labs.p1'), t('health.labs.p2'), t('health.labs.p3')]}
    />
  );
}
