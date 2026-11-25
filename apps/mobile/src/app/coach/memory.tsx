import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function CoachMemoryScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="coach-memory"
      tint="coach"
      title={t('coach.memory.title')}
      heading={t('coach.memory.heading')}
      body={t('coach.memory.body')}
      icon="layers"
      issue="coach"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('coach.memory.p1'), t('coach.memory.p2'), t('coach.memory.p3')]}
    />
  );
}
