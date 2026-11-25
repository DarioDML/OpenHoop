import { useT } from '@/i18n/useT';
import { PlannedScreen } from '@/ui/activity/parts';

export default function GpsActivityScreen() {
  const { t } = useT();
  return (
    <PlannedScreen
      testID="gps-activity"
      title={t('activity.gps.title')}
      intro={t('activity.gps.intro')}
      issue="gps"
      close
      bulletsTitle={t('activity.planned.title')}
      bullets={['activity.gps.b1', 'activity.gps.b2', 'activity.gps.b3']}
    />
  );
}
