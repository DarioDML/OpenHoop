import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function StressScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-stress"
      title={t('health.stress.title')}
      heading={t('health.stress.heading')}
      body={t('health.stress.body')}
      icon="pulse"
      issue="stress"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.stress.p1'), t('health.stress.p2'), t('health.stress.p3')]}
    />
  );
}
