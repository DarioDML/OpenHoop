import { useT } from '@/i18n/useT';
import { NotBuiltPage } from '@/ui/daily/NotBuiltPage';

export default function HapticAlarmScreen() {
  const { t } = useT();
  return (
    <NotBuiltPage
      testID="sleep-alarm"
      title={t('sleepx.alarm')}
      issue="alarm"
      intro={t('sleepx.alarmIntro')}
      points={[t('sleepx.alarmExact'), t('sleepx.alarmGoal'), t('sleepx.alarmWindow')]}
    />
  );
}
