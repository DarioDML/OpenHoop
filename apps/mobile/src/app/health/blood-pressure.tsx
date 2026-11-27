import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function BloodPressureScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-blood-pressure"
      title={t('health.bloodPressure.title')}
      heading={t('health.bloodPressure.heading')}
      body={t('health.bloodPressure.body')}
      icon="drop"
      notOffered={t('health.bloodPressure.notOffered')}
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.bloodPressure.p1'), t('health.bloodPressure.p2'), t('health.bloodPressure.p3')]}
    />
  );
}
