import { useAppData } from '@/data/context';
import { visibleReadiness } from '@/data/derived';
import { readinessNightsLeft } from '@/data/progress';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { CoachAsk } from '@/ui/CoachAsk';
import { BriefShell, PlanCard, StatChips, type BriefStat } from '@/ui/daily/BriefPage';
import { morningPlan, morningQuestion } from '@/ui/daily/briefText';
import { NoDataPage } from '@/ui/daily/bits';
import { LevelNote } from '@/ui/LevelNote';
import { PARITY } from '@/ui/parity';
import { readinessBand, useTheme } from '@/ui/theme';

export default function MorningBriefScreen() {
  const { days, userData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const index = days.length - 1;
  const day = days[index];
  if (!day) return <NoDataPage title={t('home.brief')} body={t('empty.body')} />;

  const visible = visibleReadiness(day);
  const shownReadiness = visible.value;
  const band = readinessBand(shownReadiness);
  const nightsLeft = readinessNightsLeft(days, index);
  const stats: BriefStat[] = [
    {
      id: 'readiness',
      label: t('score.readiness'),
      value: shownReadiness === null ? null : formatNumber(shownReadiness, 0, language),
      missing: nightsLeft === null ? undefined : nightsLeft === 1 ? t('why.status.nightsOne') : t('why.status.nights', { count: nightsLeft }),
      unit: '%',
      tone: band === 'high' ? 'positive' : band === null ? 'neutral' : 'warning',
      explain: { term: 'readiness', index, shown: { value: null, unit: null, reason: visible.reason } },
    },
    {
      id: 'sleep',
      label: t('home.week.sleep'),
      value: day.sleep.score.value === null ? null : formatNumber(day.sleep.score.value, 0, language),
      unit: '%',
      tone: 'purple',
      explain: { term: 'sleepScore', index, shown: { value: null, unit: null, reason: day.sleep.score.reason } },
    },
    {
      id: 'hrv',
      label: t('metric.hrv'),
      value: day.hrv.value === null ? null : formatNumber(day.hrv.value, 0, language),
      unit: ` ${t('unit.ms')}`,
      explain: { term: 'hrv', index, shown: { value: null, unit: null, reason: day.hrv.reason } },
    },
  ];
  const heading = userData.name ? t('home.goodMorningName', { name: userData.name }) : t('home.goodMorning');
  const plan = morningPlan(t, language, days, index, userData.journal, userData.journalQuestions);

  return (
    <BriefShell testID="morning-brief" title={t('home.brief')} tint="community" icon="sun" iconColor={colors.gold} heading={heading} sub={<StatChips stats={stats} />}>
      <AppText variant="capLarge" muted>
        {t('brief.todaysPlan')}
      </AppText>
      {plan.length > 0 ? (
        <PlanCard items={plan} testID="brief-plan" />
      ) : (
        <Card>
          <AppText variant="body" muted>
            {t('home.briefEmpty')}
          </AppText>
        </Card>
      )}
      <CoachAsk question={morningQuestion(t, days, index)} testID="brief-ask" />
      <LevelNote level={PARITY.readiness} text={t('home.briefNote')} />
    </BriefShell>
  );
}
