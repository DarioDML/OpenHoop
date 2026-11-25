import { useT } from '@/i18n/useT';
import { PlannedScreen } from '@/ui/activity/parts';

export default function StrengthSummaryScreen() {
  const { t } = useT();
  return (
    <PlannedScreen
      testID="strength-summary"
      title={t('strength.summary.title')}
      intro={t('strength.summary.intro')}
      issue="strength"
      bullets={['strength.summary.b1', 'strength.summary.b2', 'strength.summary.b3']}
      action={{ label: t('strength.summary.action'), href: '/strength/exercise' }}
    />
  );
}
