import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function BiomarkerScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-biomarker"
      title={t('health.biomarker.title')}
      heading={t('health.biomarker.heading')}
      body={t('health.biomarker.body')}
      icon="thermometer"
      issue="labs"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.biomarker.p1'), t('health.biomarker.p2'), t('health.biomarker.p3')]}
    />
  );
}
