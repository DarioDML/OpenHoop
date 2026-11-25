import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function LabsUploadScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-labs-upload"
      title={t('health.labsUpload.title')}
      heading={t('health.labsUpload.heading')}
      body={t('health.labsUpload.body')}
      icon="import"
      issue="labs"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.labsUpload.p1'), t('health.labsUpload.p2'), t('health.labsUpload.p3')]}
    />
  );
}
