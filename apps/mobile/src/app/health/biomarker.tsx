import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { buildHistory, formatConverted, formatEntered, rangeStatus, resultsFor } from '@/data/labs';
import { useT } from '@/i18n/useT';
import { formatShortDay } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Segmented } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { markerName, rangeText, statusText } from '@/ui/health/labsText';
import { LineChart } from '@/ui/LineChart';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { spacing } from '@/ui/theme';

export default function BiomarkerScreen() {
  const { t, language } = useT();
  const params = useLocalSearchParams<{ id?: string }>();
  const { labResults, removeLabResult } = useAppData();
  const [unit, setUnit] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const id = typeof params.id === 'string' ? params.id : '';
  const entries = id === '' ? [] : resultsFor(labResults, id);
  const history = buildHistory(entries, unit);
  const title = t('health.biomarker.title');

  if (history === null) {
    return (
      <HealthPage title={title} testID="health-biomarker">
        <Card>
          <AppText variant="body" muted testID="biomarker-not-found">
            {t('health.biomarker.notFound')}
          </AppText>
        </Card>
        <Button label={t('health.biomarker.add')} icon="plus" onPress={() => router.push('/health/labs-upload')} testID="biomarker-add" />
      </HealthPage>
    );
  }

  const name = markerName(history.ref, t);
  const pointValues = history.points.map((point) => point.value);
  const lastPoint = history.points[history.points.length - 1];
  const prevPoint = history.points[history.points.length - 2];
  const change = lastPoint !== undefined && prevPoint !== undefined ? lastPoint.value - prevPoint.value : null;
  const converted = history.points.some((point) => point.result.unit !== history.unit);
  const hidden = entries.length - history.points.length;
  const first = history.points[0];
  const newestFirst = [...entries].reverse();
  const addHref = history.ref.kind === 'catalogue' ? { pathname: '/health/labs-upload' as const, params: { biomarker: history.ref.id } } : '/health/labs-upload';

  const remove = async (resultId: number): Promise<void> => {
    setConfirmId(null);
    await removeLabResult(resultId);
  };

  return (
    <HealthPage
      title={title}
      testID="health-biomarker"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header" testID="biomarker-name">
            {name}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.biomarker.body')}
          </AppText>
        </View>
      }>
      {history.units.length > 1 ? (
        <Section title={t('health.biomarker.unitTitle')}>
          <Segmented
            testID="biomarker-units"
            value={history.unit}
            onChange={setUnit}
            options={history.units.map((value) => ({ value, label: value }))}
          />
        </Section>
      ) : null}

      <Card testID="biomarker-chart-card">
        <LineChart
          testID="biomarker-chart"
          data={pointValues}
          band={history.band}
          formatTick={(value) => formatConverted(value, language)}
          emptyLabel={t('health.biomarker.chartEmpty')}
          startLabel={first === undefined ? undefined : formatShortDay(first.result.day, language)}
          endLabel={lastPoint === undefined ? undefined : formatShortDay(lastPoint.result.day, language)}
          minSpan={0.1}
        />
        <StatRow>
          <StatTile
            label={t('health.biomarker.latest')}
            value={lastPoint === undefined ? '–' : formatConverted(lastPoint.value, language)}
            unit={history.unit}
            testID="biomarker-latest"
          />
          <StatTile
            label={t('health.biomarker.change')}
            value={change === null ? '–' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatConverted(Math.abs(change), language)}`}
            unit={change === null ? undefined : history.unit}
            testID="biomarker-change"
          />
        </StatRow>
        {history.bandFrom === null ? (
          <AppText variant="caption" muted testID="biomarker-no-band">
            {t('health.biomarker.noBand')}
          </AppText>
        ) : (
          <AppText variant="caption" muted testID="biomarker-band">
            {t('health.biomarker.band', { day: history.bandFrom.day })}
          </AppText>
        )}
        {converted ? (
          <AppText variant="caption" muted testID="biomarker-converted">
            {t('health.biomarker.converted')}
          </AppText>
        ) : null}
        {hidden > 0 ? (
          <AppText variant="caption" muted testID="biomarker-hidden">
            {t('health.biomarker.hidden', { count: hidden, unit: history.unit })}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <ParityBadge level="D" />
          <AppText variant="caption" muted style={{ flex: 1 }} testID="biomarker-entered-note">
            {t('health.biomarker.enteredNote')}
          </AppText>
        </View>
      </Card>

      <Button label={t('health.biomarker.add')} icon="plus" variant="secondary" onPress={() => router.push(addHref)} testID="biomarker-add" />

      <Section title={t('health.biomarker.historyTitle')}>
        {newestFirst.map((entry) => {
          const range = rangeText(entry, t, language);
          return (
            <Card key={entry.id} testID={`biomarker-entry-${entry.id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong" numeric>
                    {formatEntered(entry.value, language)} {entry.unit}
                  </AppText>
                  <AppText variant="label" muted numeric>
                    {entry.day}
                  </AppText>
                </View>
                {rangeStatus(entry) === null ? null : <Chip label={statusText(entry, t)} tone="neutral" small testID={`biomarker-status-${entry.id}`} />}
              </View>
              {range === null ? null : (
                <AppText variant="caption" muted numeric testID={`biomarker-range-${entry.id}`}>
                  {range}
                </AppText>
              )}
              {entry.note === null ? null : (
                <AppText variant="caption" muted testID={`biomarker-note-${entry.id}`}>
                  {t('health.biomarker.entryNote', { note: entry.note })}
                </AppText>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
                {confirmId === entry.id ? (
                  <>
                    <Button label={t('health.biomarker.confirmDelete')} variant="danger" onPress={() => void remove(entry.id)} testID={`biomarker-confirm-${entry.id}`} />
                    <Button label={t('health.biomarker.keep')} variant="tertiary" onPress={() => setConfirmId(null)} testID={`biomarker-keep-${entry.id}`} />
                  </>
                ) : (
                  <>
                    <Button
                      label={t('health.biomarker.edit')}
                      variant="tertiary"
                      onPress={() => router.push({ pathname: '/health/labs-upload', params: { entry: String(entry.id) } })}
                      testID={`biomarker-edit-${entry.id}`}
                    />
                    <Button label={t('health.biomarker.delete')} variant="tertiary" onPress={() => setConfirmId(entry.id)} testID={`biomarker-delete-${entry.id}`} />
                  </>
                )}
              </View>
            </Card>
          );
        })}
      </Section>
    </HealthPage>
  );
}
