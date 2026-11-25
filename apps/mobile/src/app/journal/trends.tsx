import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { TREND_DAYS, yesRate } from '@/data/healthDerived';
import { activeQuestions } from '@/data/journalQuestions';
import { todayIso } from '@/lib/format';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { HealthPage } from '@/ui/health/HealthPage';
import { StateCard } from '@/ui/StateCard';
import { useTheme } from '@/ui/theme';

export default function JournalTrendsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData } = useAppData();
  const today = todayIso(new Date());
  const questions = activeQuestions(userData.journalQuestions);
  const rows = questions.map((question) => ({ question, rate: yesRate(userData.journal, question.id, today) }));
  const anyAnswers = rows.some((row) => row.rate.answered > 0);

  return (
    <HealthPage
      title={t('journal.trends.title')}
      testID="journal-trends"
      hero={
        <AppText variant="lead" muted>
          {t('journal.trends.intro', { days: TREND_DAYS })}
        </AppText>
      }>
      {!anyAnswers ? (
        <StateCard icon="journal" tone="neutral" title={t('journal.trends.emptyTitle')} body={t('journal.trends.emptyBody')} testID="trends-empty" />
      ) : (
        rows.map(({ question, rate }) => (
          <Card key={question.id} testID={`trend-${question.id}`}>
            <AppText variant="cardTitle">{t(question.labelKey)}</AppText>
            {rate.answered === 0 ? (
              <AppText variant="label" muted>
                {t('journal.trends.noEntries')}
              </AppText>
            ) : (
              <>
                <AppText variant="body" soft testID={`trend-${question.id}-rate`}>
                  {t('journal.trends.yesOf', { yes: rate.yes, answered: rate.answered })}
                </AppText>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {rate.cells.map((cell, index) => (
                    <View
                      key={index}
                      style={{
                        flex: 1,
                        height: 24,
                        borderRadius: 4,
                        backgroundColor: cell === null ? colors.surfaceAlt : cell ? colors.accent : colors.border,
                        opacity: cell === null ? 0.5 : 1,
                      }}
                    />
                  ))}
                </View>
              </>
            )}
          </Card>
        ))
      )}
    </HealthPage>
  );
}
