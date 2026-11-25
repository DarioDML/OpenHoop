import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function CoachHistoryScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="coach-history"
      tint="coach"
      title={t('coach.history.title')}
      heading={t('coach.history.heading')}
      body={t('coach.history.body')}
      icon="clock"
      issue="coach"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('coach.history.p1'), t('coach.history.p2'), t('coach.history.p3')]}
    />
  );
}
