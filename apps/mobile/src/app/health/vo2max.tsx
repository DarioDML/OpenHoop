import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function Vo2maxScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-vo2max"
      title={t('health.vo2max.title')}
      heading={t('health.vo2max.heading')}
      body={t('health.vo2max.body')}
      icon="lungs"
      issue="healthspan"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.vo2max.p1'), t('health.vo2max.p2'), t('health.vo2max.p3')]}
    />
  );
}
