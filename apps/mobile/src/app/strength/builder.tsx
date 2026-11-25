import { useT } from '@/i18n/useT';
import { PlannedScreen } from '@/ui/activity/parts';

export default function StrengthBuilderScreen() {
  const { t } = useT();
  return (
    <PlannedScreen
      testID="strength-builder"
      title={t('strength.builder.title')}
      intro={t('strength.builder.intro')}
      issue="strength"
      bullets={['strength.builder.b1', 'strength.builder.b2', 'strength.builder.b3']}
      action={{ label: t('strength.builder.action'), href: '/strength/live' }}
    />
  );
}
