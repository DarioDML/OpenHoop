import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatEntered, labBand, latestLabDay, outOfRangeFirst, summarizeBiomarkers, tallyLabs } from '@/data/labs';
import { useT } from '@/i18n/useT';
import { formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { LabsGauge } from '@/ui/health/LabsGauge';
import { bandChip, markerName, rangeShort } from '@/ui/health/labsText';
import { useLayout } from '@/ui/layout';
import { LevelNote } from '@/ui/LevelNote';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { spacing } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

export default function LabsScreen() {
  const { t, language } = useT();
  const layout = useLayout();
  const { labResults } = useAppData();
  const summaries = outOfRangeFirst(summarizeBiomarkers(labResults));
  const tally = tallyLabs(summaries);
  const latest = latestLabDay(labResults);
  const upload = (): void => router.push('/health/labs-upload');
  const gaugeWidth = Math.min(280, layout.width - layout.gutter * 2 - 40);

  return (
    <HealthPage
      title={t('health.labs.title')}
      testID="health-labs"
      right={<IconButton icon="upload" label={t('health.labs.add')} onPress={upload} testID="labs-add-top" />}
      hero={
        summaries.length === 0 ? (
          <View style={{ gap: spacing.md }}>
            <AppText variant="h2" accessibilityRole="header">
              {t('health.labs.heading')}
            </AppText>
            <AppText variant="lead" muted>
              {t('health.labs.body')}
            </AppText>
          </View>
        ) : (
          <LabsGauge
            tally={tally}
            width={gaugeWidth}
            labels={{
              mid: t('health.labs.tally.mid', { count: tally.mid }),
              edge: t('health.labs.tally.edge', { count: tally.edge }),
              out: t('health.labs.tally.out', { count: tally.out }),
            }}
            emptyLabel={t('health.labs.tally.noRanges')}
            testID="labs-gauge"
          />
        )
      }>
      {latest !== null ? (
        <AppText variant="label" muted testID="labs-source">
          {t('health.labs.source', { day: formatShortDay(latest, language), count: summaries.length })}
        </AppText>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <CapHeader title={summaries.length === 0 ? t('health.labs.summaryTitle') : t('health.labs.outFirst')} />
        {summaries.length === 0 ? (
          <Card>
            <AppText variant="body" muted testID="labs-empty">
              {t('health.labs.empty')}
            </AppText>
          </Card>
        ) : (
          <ListGroup>
            {summaries.map((summary) => {
              const { latest: result } = summary;
              const chip = bandChip(labBand(result), t);
              const count = summary.count === 1 ? t('health.labs.countOne') : t('health.labs.count', { count: summary.count });
              return (
                <ListRow
                  key={summary.group}
                  testID={`labs-row-${summary.group}`}
                  title={markerName(summary.ref, t)}
                  subtitle={`${formatEntered(result.value, language)} ${result.unit} · ${rangeShort(result, t, language)}\n${formatShortDay(result.day, language)} · ${count}`}
                  right={<Chip label={chip.label} tone={chip.tone} testID={`labs-status-${summary.group}`} />}
                  onPress={() => router.push({ pathname: '/health/biomarker', params: { id: summary.key } })}
                />
              );
            })}
          </ListGroup>
        )}
      </View>

      <Button label={t('health.labs.uploadNew')} icon="upload" variant="soft" onPress={upload} testID="labs-add" />

      <LevelNote level="D" text={t('health.labs.note')} testID="labs-entered-note" />
      <AppText variant="caption" muted testID="labs-band-note">
        {t('health.labs.bandNote')}
      </AppText>
    </HealthPage>
  );
}
