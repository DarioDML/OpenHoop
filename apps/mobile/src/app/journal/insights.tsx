import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { MetricKey } from '@/data/derived';
import { MIN_DAYS_PER_SIDE, compareBehaviour, type BehaviourComparison } from '@/data/healthDerived';
import { activeQuestions } from '@/data/journalQuestions';
import { formatNumber, formatSigned } from '@/lib/format';
import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { HealthPage } from '@/ui/health/HealthPage';
import { StateCard } from '@/ui/StateCard';
import { spacing } from '@/ui/theme';

interface Target {
  key: MetricKey;
  labelKey: TranslationKey;
  decimals: number;
}

const TARGETS: readonly Target[] = [
  { key: 'readiness', labelKey: 'score.readiness', decimals: 0 },
  { key: 'hrv', labelKey: 'metric.hrv', decimals: 0 },
];

export default function JournalInsightsScreen() {
  const { t, language } = useT();
  const { days, userData } = useAppData();
  const questions = activeQuestions(userData.journalQuestions);
  const answeredAny = Object.values(userData.journal).some((answers) => Object.keys(answers).length > 0);

  const renderTarget = (questionId: string, target: Target) => {
    const result: BehaviourComparison = compareBehaviour(days, userData.journal, questionId, target.key);
    const counts = t('journal.insights.counts', { nWith: result.nWith, nWithout: result.nWithout });
    return (
      <View key={target.key} style={{ gap: 4 }} testID={`insight-${questionId}-${target.key}`}>
        <AppText variant="capSmall" muted>
          {t(target.labelKey)}
        </AppText>
        {result.enough && result.withAvg !== null && result.withoutAvg !== null ? (
          <>
            <AppText variant="body" soft>
              {t('journal.insights.compare', {
                withAvg: formatNumber(result.withAvg, target.decimals, language),
                withoutAvg: formatNumber(result.withoutAvg, target.decimals, language),
              })}
              {result.deltaPct !== null ? ` (${formatSigned(result.deltaPct, 0, language)}%)` : ''}
            </AppText>
            <AppText variant="caption" muted>
              {counts}
            </AppText>
          </>
        ) : (
          <>
            <AppText variant="body" muted>
              {t('journal.insights.needsMore', { min: MIN_DAYS_PER_SIDE })}
            </AppText>
            <AppText variant="caption" muted>
              {counts}
            </AppText>
          </>
        )}
      </View>
    );
  };

  return (
    <HealthPage
      title={t('journal.insights.title')}
      testID="journal-insights-screen"
      hero={
        <AppText variant="lead" muted>
          {t('journal.insights.intro')}
        </AppText>
      }>
      {!answeredAny ? (
        <StateCard icon="journal" tone="neutral" title={t('journal.trends.emptyTitle')} body={t('journal.insights.empty')} testID="insights-empty" />
      ) : (
        questions.map((question) => (
          <Card key={question.id} testID={`insight-${question.id}`} style={{ gap: spacing.md }}>
            <AppText variant="cardTitle">{t(question.labelKey)}</AppText>
            {TARGETS.map((target) => renderTarget(question.id, target))}
          </Card>
        ))
      )}
      <AppText variant="caption" muted>
        {t('journal.insights.footnote')}
      </AppText>
    </HealthPage>
  );
}
