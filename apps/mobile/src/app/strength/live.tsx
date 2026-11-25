import { useT } from '@/i18n/useT';
import { PlannedScreen } from '@/ui/activity/parts';

export default function StrengthLiveScreen() {
  const { t } = useT();
  return (
    <PlannedScreen
      testID="strength-live"
      title={t('strength.live.title')}
      intro={t('strength.live.intro')}
      issue="strength"
      close
      bullets={['strength.live.b1', 'strength.live.b2', 'strength.live.b3']}
      action={{ label: t('strength.live.action'), href: '/strength/summary' }}
    />
  );
}
