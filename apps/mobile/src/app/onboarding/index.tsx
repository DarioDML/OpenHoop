import { useT } from '@/i18n/useT';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';

export default function OnboardingScreen() {
  const { t } = useT();
  return (
    <Screen>
      <TopBar title={t('common.continue')} back={false} />
    </Screen>
  );
}
