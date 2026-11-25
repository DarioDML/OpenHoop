import { useT } from '@/i18n/useT';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';

export default function CommunityScreen() {
  const { t } = useT();
  return (
    <Screen>
      <TopBar title={t('tabs.community')} back={false} />
    </Screen>
  );
}
