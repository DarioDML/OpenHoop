import { useT } from '@/i18n/useT';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';

export default function CoachScreen() {
  const { t } = useT();
  return (
    <Screen>
      <TopBar title={t('a11y.coach')} back={true} />
    </Screen>
  );
}
