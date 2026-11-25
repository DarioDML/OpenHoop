import type { VendorCycle, VendorJournalEntry, VendorKind, VendorSleep, VendorWorkout } from '@openhoop/core';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import type { Language } from '@/data/types';
import type { VendorImportResult } from '@/data/vendorExport/summary';
import { VENDOR_KIND_ORDER } from '@/data/vendorExport/summary';
import { CHART_POINTS, HISTORY_PAGE, dayRange, newestFirst, recoverySeries, storedTotal } from '@/data/vendorExport/view';
import { useAppData } from '@/data/context';
import { useT, type TFunction } from '@/i18n/useT';
import { formatClock, formatDuration, formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Segmented } from '@/ui/controls';
import { LineChart } from '@/ui/LineChart';
import { Section } from '@/ui/Section';
import { spacing } from '@/ui/theme';

interface ResultProps {
  result: VendorImportResult;
}

export function ImportResultCard({ result }: ResultProps) {
  const { t } = useT();
  const total = VENDOR_KIND_ORDER.reduce((sum, kind) => sum + result.counts[kind].imported, 0);
  return (
    <Card testID="import-result" tone={total > 0 ? 'accent' : 'default'}>
      <AppText variant="bodyStrong">{total > 0 ? t('import.result.title') : t('import.result.none')}</AppText>
      {VENDOR_KIND_ORDER.map((kind) => {
        const counts = result.counts[kind];
        if (counts.imported + counts.skipped + counts.invalid === 0) return null;
        return (
          <AppText key={kind} variant="label" testID={`import-result-${kind}`}>
            {t('import.result.row', { kind: t(`import.kind.${kind}`), ...counts })}
          </AppText>
        );
      })}
      {result.files.length > 0 ? (
        <View style={{ gap: 2 }}>
          <AppText variant="capSmall" muted>
            {t('import.result.files')}
          </AppText>
          {result.files.map((file, index) => (
            <AppText key={`${file.name}-${index}`} variant="caption" muted testID={`import-file-${index}`}>
              {file.problem === null
                ? t('import.file.ok', { name: file.name, kind: file.kind === null ? '' : t(`import.kind.${file.kind}`), rows: file.rows, invalid: file.invalid })
                : t('import.file.problem', { name: file.name, problem: t(`import.problem.${file.problem}`) })}
            </AppText>
          ))}
        </View>
      ) : null}
      <AppText variant="caption" muted>
        {t('import.result.legend')}
      </AppText>
    </Card>
  );
}

function SourceChip() {
  const { t } = useT();
  return <Chip small tone="purple" label={t('import.source.chip')} />;
}

function Row({ title, lines, testID }: { title: string; lines: string[]; testID: string }) {
  return (
    <Card testID={testID} style={{ gap: spacing.sm }}>
      <SourceChip />
      <AppText variant="bodyStrong">{title}</AppText>
      {lines.map((line, index) => (
        <AppText key={index} variant="label" muted numeric>
          {line}
        </AppText>
      ))}
    </Card>
  );
}

type Piece = [label: string, value: number | null, decimals: number, unit: string];

function pieces(t: TFunction, language: Language, items: readonly Piece[]): string {
  return items
    .flatMap(([label, value, decimals, unit]) => (value === null ? [] : [`${label} ${formatNumber(value, decimals, language)}${unit}`]))
    .join(' · ');
}

function minutes(t: TFunction, value: number | null): string | null {
  return value === null ? null : formatDuration(t, value * 60);
}

function timed(t: TFunction, items: ReadonlyArray<[string, number | null]>): string {
  return items.flatMap(([label, value]) => (value === null ? [] : [`${label} ${minutes(t, value)}`])).join(' · ');
}

function nonEmpty(lines: readonly string[]): string[] {
  return lines.filter((line) => line !== '');
}

function CycleRow({ cycle }: { cycle: VendorCycle }) {
  const { t, language } = useT();
  const lines = nonEmpty([
    pieces(t, language, [
      [t('import.metric.recovery'), cycle.recoveryPct, 0, '%'],
      [t('import.metric.strain'), cycle.dayStrain, 1, ''],
    ]),
    pieces(t, language, [
      [t('import.metric.restingHr'), cycle.restingHr, 0, ' bpm'],
      [t('import.metric.hrv'), cycle.hrvMs, 1, ' ms'],
    ]),
    pieces(t, language, [
      [t('import.metric.skinTemp'), cycle.skinTempC, 1, ' °C'],
      [t('import.metric.spo2'), cycle.spo2Pct, 1, '%'],
      [t('import.metric.respiratory'), cycle.respiratoryRate, 1, ' rpm'],
    ]),
  ]);
  return <Row testID={`import-cycle-${cycle.startT}`} title={t('import.row.cycle', { day: cycle.day })} lines={lines} />;
}

function SleepRow({ sleep }: { sleep: VendorSleep }) {
  const { t, language } = useT();
  const when = t('import.row.sleepWhen', { from: formatClock(sleep.onset, sleep.tzOffsetS), to: formatClock(sleep.wake, sleep.tzOffsetS) });
  const lines = nonEmpty([
    when,
    timed(t, [
      [t('import.metric.asleep'), sleep.asleepMin],
      [t('import.metric.inBed'), sleep.inBedMin],
    ]),
    timed(t, [
      [t('import.metric.light'), sleep.lightMin],
      [t('import.metric.deep'), sleep.deepMin],
      [t('import.metric.rem'), sleep.remMin],
      [t('import.metric.awake'), sleep.awakeMin],
    ]),
    pieces(t, language, [
      [t('import.metric.performance'), sleep.performancePct, 0, '%'],
      [t('import.metric.efficiency'), sleep.efficiencyPct, 0, '%'],
      [t('import.metric.consistency'), sleep.consistencyPct, 0, '%'],
      [t('import.metric.respiratory'), sleep.respiratoryRate, 1, ' rpm'],
    ]),
  ]);
  return <Row testID={`import-sleep-${sleep.onset}`} title={t(sleep.nap ? 'import.row.nap' : 'import.row.sleep', { day: sleep.day })} lines={lines} />;
}

function WorkoutRow({ workout }: { workout: VendorWorkout }) {
  const { t, language } = useT();
  const lines = nonEmpty([
    t('import.row.workoutWhen', { day: workout.day, time: formatClock(workout.startT, workout.tzOffsetS) }),
    `${t('import.metric.duration')} ${formatDuration(t, workout.endT - workout.startT)}`,
    pieces(t, language, [
      [t('import.metric.strain'), workout.strain, 1, ''],
      [t('import.metric.avgHr'), workout.avgHr, 0, ' bpm'],
      [t('import.metric.maxHr'), workout.maxHr, 0, ' bpm'],
    ]),
  ]);
  return <Row testID={`import-workout-${workout.startT}`} title={workout.activity ?? t('import.row.workout')} lines={lines} />;
}

function JournalRow({ entry }: { entry: VendorJournalEntry }) {
  const { t } = useT();
  const lines = nonEmpty([`${entry.day}: ${t(entry.answeredYes ? 'import.answer.yes' : 'import.answer.no')}`, entry.notes ?? '']);
  return <Row testID={`import-journal-${entry.cycleStart}`} title={entry.question} lines={lines} />;
}

interface HistoryProps {
  onRemoved?: () => void;
}

export function VendorHistory({ onRemoved }: HistoryProps) {
  const { t, language } = useT();
  const { vendorData, removeVendorData } = useAppData();
  const [kind, setKind] = useState<VendorKind>('cycles');
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const total = storedTotal(vendorData);

  if (total === 0) {
    return (
      <Section title={t('import.stored.title')}>
        <AppText variant="body" muted testID="import-stored-empty">
          {t('import.stored.empty')}
        </AppText>
      </Section>
    );
  }

  const series = recoverySeries(vendorData);
  const range = dayRange(vendorData);
  const page = <T,>(items: readonly T[], render: (item: T) => ReactNode): { count: number; body: ReactNode[] } => {
    const rows = newestFirst(items);
    return { count: rows.length, body: (showAll ? rows : rows.slice(0, HISTORY_PAGE)).map(render) };
  };
  const { count, body } =
    kind === 'cycles'
      ? page(vendorData.cycles, (cycle) => <CycleRow key={cycle.startT} cycle={cycle} />)
      : kind === 'sleeps'
        ? page(vendorData.sleeps, (sleep) => <SleepRow key={sleep.onset} sleep={sleep} />)
        : kind === 'workouts'
          ? page(vendorData.workouts, (workout) => <WorkoutRow key={workout.startT} workout={workout} />)
          : page(vendorData.journal, (entry) => <JournalRow key={`${entry.cycleStart}-${entry.question}`} entry={entry} />);

  const remove = async (): Promise<void> => {
    setConfirming(false);
    if (await removeVendorData()) onRemoved?.();
  };

  return (
    <Section title={t('import.stored.title')}>
      <Card testID="import-stored" style={{ gap: spacing.sm }}>
        <SourceChip />
        <AppText variant="label" testID="import-stored-counts">
          {t('import.stored.counts', {
            cycles: vendorData.cycles.length,
            sleeps: vendorData.sleeps.length,
            workouts: vendorData.workouts.length,
            journal: vendorData.journal.length,
          })}
        </AppText>
        {range === null ? null : (
          <AppText variant="label" muted numeric testID="import-stored-range">
            {t('import.stored.range', { from: range.first, to: range.last })}
          </AppText>
        )}
        <AppText variant="caption" muted testID="import-stored-note">
          {t('import.stored.note')}
        </AppText>
      </Card>

      <Card testID="import-chart-card">
        <SourceChip />
        <AppText variant="capLarge" muted>
          {t('import.chart.title')}
        </AppText>
        <LineChart
          testID="import-chart"
          data={series.values}
          formatTick={(value) => formatNumber(value, 0, language)}
          emptyLabel={t('import.chart.empty')}
          startLabel={series.firstDay === null ? undefined : formatShortDay(series.firstDay, language)}
          endLabel={series.lastDay === null ? undefined : formatShortDay(series.lastDay, language)}
          minSpan={10}
        />
        <AppText variant="caption" muted>
          {t('import.chart.note', { count: CHART_POINTS })}
        </AppText>
      </Card>

      <Segmented
        testID="import-kind"
        value={kind}
        onChange={(next) => {
          setKind(next);
          setShowAll(false);
        }}
        options={VENDOR_KIND_ORDER.map((value) => ({ value, label: t(`import.kind.${value}`) }))}
      />
      {count === 0 ? (
        <AppText variant="body" muted testID="import-history-empty">
          {t('import.history.empty')}
        </AppText>
      ) : null}
      {body}
      {!showAll && count > HISTORY_PAGE ? (
        <Button label={t('import.history.showAll', { count })} variant="secondary" onPress={() => setShowAll(true)} testID="import-show-all" />
      ) : null}

      <Card tone="danger" testID="import-remove-card">
        {confirming ? (
          <>
            <AppText variant="body">{t('import.remove.confirm', { count: total })}</AppText>
            <Button label={t('import.remove.yes')} variant="danger" onPress={() => void remove()} testID="import-remove-confirm" />
            <Button label={t('import.remove.keep')} variant="tertiary" onPress={() => setConfirming(false)} testID="import-remove-keep" />
          </>
        ) : (
          <Button label={t('import.remove.action')} variant="danger" onPress={() => setConfirming(true)} testID="import-remove" />
        )}
      </Card>
    </Section>
  );
}
