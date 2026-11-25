import { useAppData } from '@/data/context';
import { readinessImpacts } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { formatNumber, formatSigned } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Callout, NoDataPage, Page } from '@/ui/daily/bits';
import { StateCard } from '@/ui/StateCard';
import { spacing } from '@/ui/theme';

export default function ImpactsScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  if (days.length === 0) return <NoDataPage title={t('readinessx.impacts')} body={t('empty.body')} />;

  const impacts = readinessImpacts(days);

  return (
    <Page title={t('readinessx.impacts')} tint="recovery" testID="impacts">
      <AppText variant="body" muted>
        {t('readinessx.impactsIntro')}
      </AppText>
      {impacts.length === 0 ? (
        <StateCard testID="impacts-empty" icon="trends" tone="neutral" title={t('readinessx.impactsEmptyTitle')} body={t('readinessx.impactsEmptyBody', { days: days.length })} />
      ) : (
        impacts.map((impact) => {
          const sleepBased = impact.id === 'sleep';
          const threshold = formatNumber(impact.threshold, 1, language);
          const diff = Math.round(impact.difference);
          return (
            <Card key={impact.id} testID={`impact-${impact.id}`} style={{ gap: spacing.sm }}>
              <AppText variant="cardTitle">{sleepBased ? t('readinessx.impact.sleepTitle') : t('readinessx.impact.loadTitle')}</AppText>
              <Chip label={t('readinessx.impact.diff', { value: formatSigned(diff, 0, language) })} tone={Math.abs(diff) < 3 ? 'neutral' : diff > 0 ? 'positive' : 'warning'} />
              <AppText variant="body" soft testID={`impact-${impact.id}-text`}>
                {sleepBased
                  ? t('readinessx.impact.sleepBody', {
                      threshold,
                      high: formatNumber(impact.meanHigh, 0, language),
                      low: formatNumber(impact.meanLow, 0, language),
                    })
                  : t('readinessx.impact.loadBody', {
                      threshold,
                      high: formatNumber(impact.meanHigh, 0, language),
                      low: formatNumber(impact.meanLow, 0, language),
                    })}
              </AppText>
              <AppText variant="caption" muted>
                {t('readinessx.impact.sample', { high: impact.nHigh, low: impact.nLow })}
              </AppText>
            </Card>
          );
        })
      )}
      <Callout title={t('readinessx.impactsNoteTitle')} body={t('readinessx.impactsNote')} />
    </Page>
  );
}
