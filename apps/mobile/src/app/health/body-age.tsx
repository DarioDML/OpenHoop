import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function BodyAgeScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-body-age"
      title={t('health.bodyAge.title')}
      heading={t('health.bodyAge.heading')}
      body={t('health.bodyAge.body')}
      icon="user"
      issue="healthspan"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.bodyAge.p1'), t('health.bodyAge.p2'), t('health.bodyAge.p3')]}
    />
  );
}
