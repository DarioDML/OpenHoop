import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { MIN_BASELINE_NIGHTS } from '@/data/derived';
import { buildingProgress } from '@/data/progress';
import { TERMS, type TermId } from '@/data/terms';
import { latestVitalsIndex, vitalReadings, vitalsSummary } from '@/data/healthDerived';
import { formatShortDay } from '@/lib/format';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { ProgressDots } from '@/ui/explain/ProgressDots';
import { HealthPage } from '@/ui/health/HealthPage';
import { rangeChip } from '@/ui/health/rangeChip';
import { MetricTile } from '@/ui/MetricTile';
import { Num } from '@/ui/Num';
import { StateCard } from '@/ui/StateCard';
import { spacing } from '@/ui/theme';

export default function VitalsScreen() {
  const { t, language } = useT();
  const { days } = useAppData();
  const index = latestVitalsIndex(days);
  const day = days[index];
  const readings = index >= 0 ? vitalReadings(days, index) : [];
  const summary = vitalsSummary(readings);
  const shortLine = (term: TermId): string | undefined => {
    const key = TERMS[term].short;
    return key === null ? undefined : t(key);
  };
  const building = index >= 0 ? buildingProgress('normalRange', days, index) : null;

  return (
    <HealthPage
      title={t('health.vitals.title')}
      testID="health-vitals"
      hero={
        day && summary.judged > 0 ? (
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Num size={56} testID="vitals-hero">{`${summary.within}/${summary.judged}`}</Num>
              <AppText variant="cardTitle" muted style={{ fontWeight: '400' }}>
                {t('health.vitals.withinRange')}
              </AppText>
            </View>
            <AppText variant="label" muted>
              {t('health.vitals.lastNight', { day: formatShortDay(day.day, language) })}
            </AppText>
          </View>
        ) : (
          <AppText variant="lead" muted>
            {t('health.vitals.intro')}
          </AppText>
        )
      }>
      {day === undefined || summary.measured === 0 ? (
        <StateCard icon="pulse" tone="neutral" title={t('empty.title')} body={t('health.vitals.empty')} testID="vitals-empty" />
      ) : (
        <View style={{ gap: spacing.md }}>
          {building ? (
            <View testID="vitals-ranges-after" style={{ gap: spacing.sm }}>
              <AppText variant="label" muted>
                {t('health.vitals.rangesAfter', { count: MIN_BASELINE_NIGHTS })}
              </AppText>
              <ProgressDots progress={building} />
            </View>
          ) : null}
          {readings.map((reading) => (
            <MetricTile
              key={reading.spec.id}
              testID={`vital-${reading.spec.id}`}
              label={t(reading.spec.labelKey)}
              value={reading.value}
              reason={reading.reason}
              level={reading.spec.level}
              unit={t(reading.spec.unitKey)}
              decimals={reading.spec.decimals}
              chip={rangeChip(t, language, reading.status, reading.baseline, reading.spec.decimals)}
              href={`/recovery/metric/${reading.spec.id}`}
              explain={{ term: reading.spec.term, index }}
              caption={shortLine(reading.spec.term)}
            />
          ))}
        </View>
      )}
      <AppText variant="caption" muted>
        {t('explain.tapHint')}
      </AppText>
      <AppText variant="caption" muted>
        {t('health.vitals.footnote')}
      </AppText>
    </HealthPage>
  );
}
