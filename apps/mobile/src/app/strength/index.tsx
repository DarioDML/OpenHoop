import { useT } from '@/i18n/useT';
import { PlannedScreen } from '@/ui/activity/parts';

export default function StrengthHomeScreen() {
  const { t } = useT();
  return (
    <PlannedScreen
      testID="strength-home"
      title={t('strength.home.title')}
      intro={t('strength.home.intro')}
      issue="strength"
      bullets={['strength.home.b1', 'strength.home.b2', 'strength.home.b3']}
      action={{ label: t('strength.home.action'), href: '/strength/builder' }}
    />
  );
}
