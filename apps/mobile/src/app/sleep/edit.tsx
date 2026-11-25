import { useT } from '@/i18n/useT';
import { NotBuiltPage } from '@/ui/daily/NotBuiltPage';

export default function EditSleepScreen() {
  const { t } = useT();
  return <NotBuiltPage testID="sleep-edit" title={t('sleepx.edit')} issue="sleepEdit" intro={t('sleepx.editIntro')} points={[t('sleepx.editRecalc')]} />;
}
