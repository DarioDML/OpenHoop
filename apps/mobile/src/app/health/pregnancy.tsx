import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function PregnancyScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-pregnancy"
      title={t('health.pregnancy.title')}
      heading={t('health.pregnancy.heading')}
      body={t('health.pregnancy.body')}
      icon="heart"
      issue="cycle"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.pregnancy.p1'), t('health.pregnancy.p2'), t('health.pregnancy.p3')]}
    />
  );
}
