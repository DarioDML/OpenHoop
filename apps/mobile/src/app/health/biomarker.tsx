import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { buildHistory, convertLabValue, formatConverted, formatEntered, labBand, linkedBehaviours, rangeStatus, resultsFor, type LinkMetric } from '@/data/labs';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay, formatShortDayIn } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Segmented } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { bandChip, markerName, rangeText, statusText } from '@/ui/health/labsText';
import { RangeBar } from '@/ui/health/RangeBar';
import { useLayout } from '@/ui/layout';
import { LineChart } from '@/ui/LineChart';
import { KeyValueRow } from '@/ui/manage/rows';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';

const RESULT_VALUE_MIN_WIDTH = 140;
const FLAT_SPAN_SHARE = 0.04;

function hoursText(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

export default function BiomarkerScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const layout = useLayout();
  const params = useLocalSearchParams<{ id?: string }>();
  const { labResults, removeLabResult, days } = useAppData();
  const [unit, setUnit] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const id = typeof params.id === 'string' ? params.id : '';
  const entries = id === '' ? [] : resultsFor(labResults, id);
  const history = buildHistory(entries, unit);

  if (history === null) {
    return (
      <HealthPage title={t('health.biomarker.title')} testID="health-biomarker">
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
  const latestEntry = newestFirst[0];
  const band = latestEntry === undefined ? 'none' : labBand(latestEntry);
  const chip = bandChip(band, t);
  const out = band === 'low' || band === 'high';
  const toShown = (value: number | null): number | null => (value === null || latestEntry === undefined ? null : convertLabValue(value, latestEntry.unit, history.unit, history.ref));
  const shownValue = latestEntry === undefined ? null : toShown(latestEntry.value);
  const shownLow = latestEntry === undefined ? null : toShown(latestEntry.refLow);
  const shownHigh = latestEntry === undefined ? null : toShown(latestEntry.refHigh);
  const hasRange = latestEntry !== undefined && (latestEntry.refLow !== null || latestEntry.refHigh !== null);
  const linked = linkedBehaviours(days, entries);
  const addHref = history.ref.kind === 'catalogue' ? { pathname: '/health/labs-upload' as const, params: { biomarker: history.ref.id } } : '/health/labs-upload';

  const linkValue = (metric: LinkMetric, value: number): string => {
    if (metric === 'asleepH') return hoursText(value);
    if (metric === 'load') return formatNumber(value, 1, language);
    return formatNumber(value, 0, language);
  };

  const remove = async (resultId: number): Promise<void> => {
    setConfirmId(null);
    await removeLabResult(resultId);
  };

  return (
    <HealthPage
      title={name}
      testID="health-biomarker"
      hero={
        <View style={{ gap: spacing.sm }}>
          <AppText variant="capLarge" muted testID="biomarker-name">
            {latestEntry === undefined ? name : `${name} · ${formatShortDay(latestEntry.day, language)}`}
          </AppText>
          {shownValue === null ? null : (
            <View style={{ flexDirection: layout.narrow ? 'column' : 'row', alignItems: layout.narrow ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: spacing.sm }}>
              <Num size={layout.narrow ? 64 : 88} color={out ? colors.negative : colors.text} unit={history.unit} unitSize={28} unitColor={colors.textMuted} adjustsFontSizeToFit testID="biomarker-hero-value">
                {formatConverted(shownValue, language)}
              </Num>
              <View style={{ paddingBottom: 8 }}>
                <Chip label={chip.label} tone={chip.tone} testID="biomarker-hero-status" />
              </View>
            </View>
          )}
        </View>
      }>
      <Card testID="biomarker-range-card">
        <AppText variant="capLarge" muted>
          {t('health.biomarker.rangeTitle')}
        </AppText>
        {hasRange && shownValue !== null && (shownLow !== null || shownHigh !== null) ? (
          <RangeBar
            low={shownLow}
            high={shownHigh}
            value={shownValue}
            format={(value) => formatConverted(value, language)}
            accessibilityLabel={t('health.biomarker.rangeA11y', { value: formatConverted(shownValue, language), status: chip.label })}
            testID="biomarker-range-bar"
          />
        ) : (
          <AppText variant="body" muted testID="biomarker-range-none">
            {t('health.biomarker.rangeNone')}
          </AppText>
        )}
      </Card>

      <Card testID="biomarker-chart-card">
        <AppText variant="capLarge" muted>
          {t('health.biomarker.chartTitle')}
        </AppText>
        <AppText variant="caption" muted>
          {t('health.biomarker.body')}
        </AppText>
        {history.units.length > 1 ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="capSmall" muted>
              {t('health.biomarker.unitTitle')}
            </AppText>
            <Segmented testID="biomarker-units" value={history.unit} onChange={setUnit} options={history.units.map((value) => ({ value, label: value }))} />
          </View>
        ) : null}
        <LineChart
          testID="biomarker-chart"
          data={pointValues}
          band={history.band}
          color={out ? colors.negative : undefined}
          formatTick={(value) => formatConverted(value, language)}
          emptyLabel={t('health.biomarker.chartEmpty')}
          startLabel={first === undefined ? undefined : formatShortDayIn(first.result.day, language, lastPoint?.result.day ?? first.result.day)}
          endLabel={lastPoint === undefined ? undefined : formatShortDay(lastPoint.result.day, language)}
          minSpan={Math.max(0.1, Math.abs(lastPoint?.value ?? 0) * FLAT_SPAN_SHARE)}
        />
        <StatRow>
          <StatTile label={t('health.biomarker.latest')} value={lastPoint === undefined ? '–' : formatConverted(lastPoint.value, language)} unit={history.unit} testID="biomarker-latest" />
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
            {t('health.biomarker.band', { day: formatShortDayIn(history.bandFrom.day, language, latestEntry?.day ?? history.bandFrom.day) })}
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

      <Card testID="biomarker-linked">
        <AppText variant="cardTitle">{t('health.biomarker.linked.title')}</AppText>
        {linked === null ? (
          <AppText variant="body" muted testID="biomarker-linked-none">
            {t('health.biomarker.linked.none')}
          </AppText>
        ) : (
          <>
            <AppText variant="label" muted>
              {t('health.biomarker.linked.head', { before: formatShortDay(linked.previousDay, language), latest: formatShortDay(linked.latestDay, language) })}
            </AppText>
            {linked.rows.map((row) => (
              <KeyValueRow
                key={row.metric}
                label={t(`health.biomarker.linked.metric.${row.metric}`)}
                value={`${linkValue(row.metric, row.before)} → ${linkValue(row.metric, row.latest)}`}
                testID={`biomarker-linked-${row.metric}`}
              />
            ))}
          </>
        )}
        <AppText variant="caption" muted>
          {t('health.biomarker.linked.note')}
        </AppText>
      </Card>

      <Button label={t('health.biomarker.add')} icon="plus" variant="secondary" onPress={() => router.push(addHref)} testID="biomarker-add" />

      <Section title={t('health.biomarker.historyTitle')}>
        {newestFirst.map((entry) => {
          const range = rangeText(entry, t, language);
          return (
            <Card key={entry.id} testID={`biomarker-entry-${entry.id}`}>
              <View
                testID={`biomarker-entry-row-${entry.id}`}
                style={{
                  flexDirection: layout.compact ? 'column' : 'row',
                  flexWrap: layout.compact ? 'nowrap' : 'wrap',
                  alignItems: layout.compact ? 'flex-start' : 'center',
                  gap: layout.compact ? spacing.sm : spacing.md,
                }}>
                <View style={layout.compact ? { alignSelf: 'stretch', gap: 2 } : { flexGrow: 1, flexShrink: 1, minWidth: RESULT_VALUE_MIN_WIDTH, gap: 2 }}>
                  <AppText variant="bodyStrong" numeric testID={`biomarker-value-${entry.id}`}>
                    {`${formatEntered(entry.value, language)}\u00a0${entry.unit}`}
                  </AppText>
                  <AppText variant="label" muted numeric testID={`biomarker-day-${entry.id}`}>
                    {formatShortDayIn(entry.day, language, latestEntry?.day ?? entry.day)}
                  </AppText>
                </View>
                {rangeStatus(entry) === null ? null : <Chip label={statusText(entry, t)} tone={bandChip(labBand(entry), t).tone} small testID={`biomarker-status-${entry.id}`} />}
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
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm }}>
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
