import { useT } from '@/i18n/useT';
import { FeaturePage } from '@/ui/health/FeaturePage';

export default function CoachSettingsScreen() {
  const { t } = useT();
  return (
    <FeaturePage
      testID="coach-settings"
      tint="coach"
      title={t('coach.settings.title')}
      heading={t('coach.settings.heading')}
      body={t('coach.settings.body')}
      icon="settings"
      issue="coach"
      pointsTitle={t('health.feature.pointsTitle')}
      points={[t('coach.settings.p1'), t('coach.settings.p2'), t('coach.settings.p3')]}
    />
  );
}
