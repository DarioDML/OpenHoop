import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function BpCalibrationScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-bp-calibration"
      title={t('health.bpCalibration.title')}
      heading={t('health.bpCalibration.heading')}
      body={t('health.bpCalibration.body')}
      icon="settings"
      notOffered={t('health.bpCalibration.notOffered')}
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.bpCalibration.p1'), t('health.bpCalibration.p2'), t('health.bpCalibration.p3')]}
    />
  );
}
