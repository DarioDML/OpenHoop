import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function CoachCheckInScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="coach-check-in"
      tint="coach"
      title={t('coach.checkIn.title')}
      heading={t('coach.checkIn.heading')}
      body={t('coach.checkIn.body')}
      icon="bell"
      issue="coach"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('coach.checkIn.p1'), t('coach.checkIn.p2'), t('coach.checkIn.p3')]}
    />
  );
}
