import { useT } from '@/i18n/useT';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';

export default function MoreScreen() {
  const { t } = useT();
  return (
    <Screen>
      <TopBar title={t('tabs.more')} back={false} />
    </Screen>
  );
}
