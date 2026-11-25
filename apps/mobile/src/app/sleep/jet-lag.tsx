import { useT } from '@/i18n/useT';
import { NotBuiltPage } from '@/ui/daily/NotBuiltPage';

export default function JetLagScreen() {
  const { t } = useT();
  return <NotBuiltPage testID="sleep-jet-lag" title={t('sleepx.jetLag')} issue="jetLag" intro={t('sleepx.jetLagIntro')} points={[t('sleepx.jetLagLight'), t('sleepx.jetLagBed')]} />;
}
