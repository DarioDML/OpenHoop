import { useT } from '@/i18n/useT';
import { PlannedScreen } from '@/ui/activity/parts';

export default function ShareActivityScreen() {
  const { t } = useT();
  return (
    <PlannedScreen
      testID="share-activity"
      title={t('activity.share.title')}
      intro={t('activity.share.intro')}
      issue="share"
      close
      bullets={['activity.share.b1', 'activity.share.b2', 'activity.share.b3', 'activity.share.b4']}
    />
  );
}
