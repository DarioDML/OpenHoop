import { useAppData } from '@/data/context';
import { visibleReadiness } from '@/data/derived';
import { formatLongDay } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { BriefPage, type BriefStat } from '@/ui/daily/BriefPage';
import { eveningLines } from '@/ui/daily/briefText';
import { NoDataPage } from '@/ui/daily/bits';
import { readinessNightsLeft } from '@/data/progress';

export default function EveningReviewScreen() {
  const { days, userData } = useAppData();
  const { t, language } = useT();
  const index = days.length - 1;
  const day = days[index];
  if (!day) return <NoDataPage title={t('home.evening')} body={t('empty.body')} />;

  const { value: shownReadiness } = visibleReadiness(day);
  const nightsLeft = readinessNightsLeft(days, index);
  const stats: BriefStat[] = [
    { id: 'load', label: t('score.load'), value: day.load.value === null ? null : formatNumber(day.load.value, 1, language) },
    { id: 'steps', label: t('metric.steps'), value: day.steps === null ? null : formatNumber(day.steps, 0, language) },
    {
      id: 'readiness',
      label: t('score.readiness'),
      value: shownReadiness === null ? null : formatNumber(shownReadiness, 0, language),
      missing: nightsLeft === null ? undefined : nightsLeft === 1 ? t('why.status.nightsOne') : t('why.status.nights', { count: nightsLeft }),
      unit: '%',
    },
  ];

  return (
    <BriefPage
      testID="evening-review"
      title={t('home.evening')}
      heading={t('home.eveningHeading', { day: formatLongDay(day.day, language) })}
      stats={stats}
      lines={eveningLines(t, language, days, index, userData.stepsGoal)}
      linesTitle={t('home.eveningLines')}
      emptyText={t('home.eveningEmpty')}
    />
  );
}
