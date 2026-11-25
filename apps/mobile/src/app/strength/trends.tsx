import { useT } from '@/i18n/useT';
import { PlannedScreen } from '@/ui/activity/parts';

export default function StrengthTrendsScreen() {
  const { t } = useT();
  return (
    <PlannedScreen
      testID="strength-trends"
      title={t('strength.trends.title')}
      intro={t('strength.trends.intro')}
      issue="strength"
      bullets={['strength.trends.b1', 'strength.trends.b2', 'strength.trends.b3']}
    />
  );
}
