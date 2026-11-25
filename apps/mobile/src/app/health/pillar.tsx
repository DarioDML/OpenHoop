import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function PillarScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="health-pillar"
      title={t('health.pillar.title')}
      heading={t('health.pillar.heading')}
      body={t('health.pillar.body')}
      icon="target"
      issue="healthspan"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('health.pillar.p1'), t('health.pillar.p2'), t('health.pillar.p3')]}
    />
  );
}
