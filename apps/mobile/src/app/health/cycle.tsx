import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function CycleScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-cycle"
      title={t('health.cycle.title')}
      heading={t('health.cycle.heading')}
      body={t('health.cycle.body')}
      icon="calendar"
      issue="cycle"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.cycle.p1'), t('health.cycle.p2'), t('health.cycle.p3')]}
    />
  );
}
