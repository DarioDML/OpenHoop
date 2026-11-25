import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function EcgScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-ecg"
      title={t('health.ecg.title')}
      heading={t('health.ecg.heading')}
      body={t('health.ecg.body')}
      icon="pulse"
      issue="mg"
      needsMg
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.ecg.p1'), t('health.ecg.p2'), t('health.ecg.p3')]}
    />
  );
}
