import { useAppData } from '@/data/context';
import { visibleReadiness } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { BriefPage, type BriefStat } from '@/ui/daily/BriefPage';
import { briefLines } from '@/ui/daily/briefText';
import { NoDataPage } from '@/ui/daily/bits';
import { readinessNightsLeft } from '@/data/progress';
import { readinessColor, useTheme } from '@/ui/theme';

export default function MorningBriefScreen() {
  const { days, userData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const index = days.length - 1;
  const day = days[index];
  if (!day) return <NoDataPage title={t('home.brief')} body={t('empty.body')} />;

  const { value: shownReadiness } = visibleReadiness(day);
  const nightsLeft = readinessNightsLeft(days, index);
  const stats: BriefStat[] = [
    {
      id: 'readiness',
      label: t('score.readiness'),
      value: shownReadiness === null ? null : formatNumber(shownReadiness, 0, language),
      missing: nightsLeft === null ? undefined : nightsLeft === 1 ? t('why.status.nightsOne') : t('why.status.nights', { count: nightsLeft }),
      unit: '%',
      color: readinessColor(colors, shownReadiness),
    },
    { id: 'sleep', label: t('score.sleep'), value: day.sleep.score.value === null ? null : formatNumber(day.sleep.score.value, 0, language), unit: '%' },
    { id: 'hrv', label: t('metric.hrv'), value: day.hrv.value === null ? null : formatNumber(day.hrv.value, 0, language), unit: t('unit.ms') },
  ];
  const heading = userData.name ? t('home.goodMorningName', { name: userData.name }) : t('home.goodMorning');

  return (
    <BriefPage
      testID="morning-brief"
      title={t('home.brief')}
      heading={heading}
      stats={stats}
      lines={briefLines(t, language, days, index)}
      linesTitle={t('home.briefLines')}
      emptyText={t('home.briefEmpty')}
    />
  );
}
