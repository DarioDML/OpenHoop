import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function EcgResultScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-ecg-result"
      title={t('health.ecgResult.title')}
      heading={t('health.ecgResult.heading')}
      body={t('health.ecgResult.body')}
      icon="heart"
      issue="mg"
      needsMg
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.ecgResult.p1'), t('health.ecgResult.p2'), t('health.ecgResult.p3')]}
    />
  );
}
