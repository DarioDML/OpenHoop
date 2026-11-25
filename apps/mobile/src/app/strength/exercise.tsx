import { useT } from '@/i18n/useT';
import { PlannedScreen } from '@/ui/activity/parts';

export default function StrengthExerciseScreen() {
  const { t } = useT();
  return (
    <PlannedScreen
      testID="strength-exercise"
      title={t('strength.exercise.title')}
      intro={t('strength.exercise.intro')}
      issue="strength"
      bullets={['strength.exercise.b1', 'strength.exercise.b2', 'strength.exercise.b3']}
      action={{ label: t('strength.exercise.action'), href: '/strength/trends' }}
    />
  );
}
