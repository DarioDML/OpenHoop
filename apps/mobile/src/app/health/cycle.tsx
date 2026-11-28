import type { FlowLevel, PeriodEntry } from '@openhoop/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import {
  CYCLE_LIMITS,
  CYCLE_PHASES,
  FLOW_OPTIONS,
  buildTimeline,
  computeCycleStats,
  cycleWheel,
  estimateNextPeriod,
  deviationGap,
  latestDeviation,
  tempDirection,
  parseTimelineRange,
  periodLengthDays,
  tempFitsPhase,
  validatePeriodDraft,
  TIMELINE_RANGES,
  type CyclePhase,
  type PeriodDraft,
  type PeriodField,
} from '@/data/cycle';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { todayIsoDate } from '@/lib/dates';
import { formatNumber, formatShortDay, formatSigned } from '@/lib/format';
import { formatTemperatureDelta, useUnits } from '@/lib/units';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field, Segmented } from '@/ui/controls';
import { CycleTimeline } from '@/ui/health/CycleTimeline';
import { MetricName } from '@/ui/explain/MetricName';
import { CycleWheel } from '@/ui/health/CycleWheel';
import { HealthPage } from '@/ui/health/HealthPage';
import { useLayout } from '@/ui/layout';
import { LevelNote } from '@/ui/LevelNote';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Section } from '@/ui/Section';
import { GridTile, StatGrid } from '@/ui/StatGrid';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

const FLOW_LABEL: Readonly<Record<FlowLevel, TranslationKey>> = {
  1: 'health.cycle.flow.1',
  2: 'health.cycle.flow.2',
  3: 'health.cycle.flow.3',
};

const RECENT_TEMP_DAYS = 3;

function emptyDraft(): PeriodDraft {
  return { start: todayIsoDate(), end: '', flow: 2 };
}

export default function CycleScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const layout = useLayout();
  const units = useUnits();
  const { days, cycle, savePeriod, removePeriod, removeAllCycleData } = useAppData();
  const [draft, setDraft] = useState<PeriodDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [invalid, setInvalid] = useState<PeriodField[]>([]);
  const [saving, setSaving] = useState(false);
  const [range, setRange] = useState<string>('90');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [formOpen, setFormOpen] = useState(cycle.periods.length === 0);

  const today = todayIsoDate();
  const stats = computeCycleStats(cycle.periods);
  const next = estimateNextPeriod(stats, today);
  const pregnant = cycle.pregnancy !== null;
  const wheel = pregnant ? null : cycleWheel(stats, today);
  const deviation = latestDeviation(days, today, RECENT_TEMP_DAYS);
  const deviationIndex = deviation === null ? days.length - 1 : days.findIndex((record) => record.day === deviation.day);
  const fit = wheel === null || deviation === null ? null : tempFitsPhase(wheel.phase, deviation.value);
  const timeline = buildTimeline(days, cycle.periods, today, parseTimelineRange(range));
  const newestFirst = [...cycle.periods].reverse();
  const has = (field: PeriodField): boolean => invalid.includes(field);
  const fmt = (value: number): string => formatNumber(value, 1, language);
  const hasData = cycle.periods.length > 0 || cycle.symptoms.length > 0 || cycle.pregnancy !== null;
  const phaseName = (phase: CyclePhase): string => t(`health.cycle.phase.${phase}`);

  const patchDraft = (change: Partial<PeriodDraft>): void => {
    setDraft((current) => ({ ...current, ...change }));
    setInvalid([]);
  };

  const reset = (): void => {
    setDraft(emptyDraft());
    setEditingId(null);
    setInvalid([]);
  };

  const submit = async (): Promise<void> => {
    const result = validatePeriodDraft(draft, today, cycle.periods, editingId);
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    setSaving(true);
    const saved = await savePeriod(editingId, result.value);
    setSaving(false);
    if (saved) reset();
  };

  const startEdit = (entry: PeriodEntry): void => {
    setEditingId(entry.id);
    setConfirmId(null);
    setInvalid([]);
    setFormOpen(true);
    setDraft({ start: entry.startDay, end: entry.endDay ?? '', flow: entry.flow });
  };

  const remove = async (id: number): Promise<void> => {
    setConfirmId(null);
    if (await removePeriod(id)) {
      if (editingId === id) reset();
    }
  };

  const wipe = async (): Promise<void> => {
    setConfirmAll(false);
    if (await removeAllCycleData()) reset();
  };

  const nextValue = (): string => {
    if (!next.ok) return '';
    if (next.daysUntil === 0) return t('health.cycle.next.today');
    if (next.daysUntil === 1) return t('health.cycle.next.tomorrow');
    if (next.daysUntil > 1) return t('health.cycle.next.inDays', { count: next.daysUntil });
    return next.daysUntil === -1 ? t('health.cycle.next.lateOne') : t('health.cycle.next.late', { count: -next.daysUntil });
  };

  const notSet = t('health.cycle.stat.notSet');
  const timelineStart = timeline[0]?.day ?? '';
  const temp = deviation === null ? null : formatTemperatureDelta(deviation.value, units, language);

  const phaseBody = (): string => {
    if (wheel === null) return pregnant ? t('health.cycle.pregnancyActive') : t('health.cycle.phase.none');
    const parts = [wheel.overdue ? t('health.cycle.phase.overdue') : t(`health.cycle.phase.${wheel.phase}Body`)];
    parts.push(temp === null ? t('health.cycle.phase.noTemp') : t('health.cycle.phase.temp', { value: `${temp.value} ${temp.unit}` }));
    return parts.join(' ');
  };

  const wheelSize = Math.min(240, Math.max(180, layout.width - layout.gutter * 2 - 80));

  return (
    <HealthPage
      title={t('health.cycle.title')}
      tint="cycle"
      testID="health-cycle"
      right={<IconButton icon="calendar" label={t('health.cycle.form.addTitle')} onPress={() => setFormOpen(true)} testID="cycle-open-calendar" />}
      hero={
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <CycleWheel
            wheel={wheel}
            size={wheelSize}
            dayLabel={t('health.cycle.stat.day')}
            phaseLabel={wheel === null ? null : wheel.overdue ? t('health.cycle.wheel.overdue') : phaseName(wheel.phase)}
            emptyLabel={pregnant ? t('health.cycle.wheel.pregnant') : t('health.cycle.wheel.empty')}
            accessibilityLabel={
              wheel === null
                ? t('health.cycle.wheel.empty')
                : wheel.overdue
                  ? t('health.cycle.wheel.a11yOverdue', { day: wheel.day, length: wheel.length })
                  : t('health.cycle.wheel.a11y', { day: wheel.day, length: wheel.length, phase: phaseName(wheel.phase) })
            }
            testID="cycle-wheel"
          />
          {wheel !== null && wheel.typicalLength ? (
            <AppText variant="caption" color={colors.textSoft} style={{ textAlign: 'center' }} testID="cycle-wheel-typical">
              {t('health.cycle.wheel.typical', { days: wheel.length, count: CYCLE_LIMITS.minCyclesForEstimate + 1 })}
            </AppText>
          ) : null}
        </View>
      }>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm }} testID="cycle-legend">
        {CYCLE_PHASES.map((phase) => (
          <View key={phase} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.cyclePhase[phase] }} />
            <AppText variant="label" soft>
              {phaseName(phase)}
            </AppText>
          </View>
        ))}
      </View>

      <Card testID="cycle-phase-card">
        <View style={{ flexDirection: layout.narrow ? 'column' : 'row', justifyContent: 'space-between', alignItems: layout.narrow ? 'flex-start' : 'center', gap: spacing.xs }}>
          <AppText variant="cardTitle" testID="cycle-phase-title">
            {wheel === null || wheel.overdue ? t('health.cycle.phase.title') : t('health.cycle.phase.named', { phase: phaseName(wheel.phase) })}
          </AppText>
          {wheel !== null && !wheel.overdue ? (
            <AppText variant="capSmall" muted testID="cycle-phase-left">
              {wheel.daysLeftInPhase === 0 ? t('health.cycle.phase.lastDay') : wheel.daysLeftInPhase === 1 ? t('health.cycle.phase.leftOne') : t('health.cycle.phase.left', { count: wheel.daysLeftInPhase })}
            </AppText>
          ) : null}
        </View>
        <AppText variant="body" soft testID="cycle-phase-body">
          {phaseBody()}
        </AppText>
      </Card>

      <StatGrid testID="cycle-tiles">
        <GridTile
          label={t('health.cycle.tile.next')}
          value={pregnant || !next.ok ? null : next.daysUntil > 1 ? t('health.cycle.tile.inValue', { count: next.daysUntil }) : nextValue()}
          unit={!pregnant && next.ok && next.daysUntil > 1 ? t('health.cycle.unit.days') : undefined}
          missing={pregnant ? t('health.cycle.tile.pregnant') : t('health.cycle.tile.needsLogs')}
          chip={!pregnant && next.ok ? { label: t('health.cycle.tile.predicted'), tone: 'pink' } : null}
          testID="cycle-tile-next"
        />
        <GridTile
          label={t('health.cycle.tile.temp')}
          value={temp === null ? null : temp.value}
          unit={temp?.unit}
          missing={deviationGap(days, today, RECENT_TEMP_DAYS) === 'learning' ? t('health.cycle.tile.tempLearning') : t('health.cycle.tile.noTemp')}
          caption={deviation === null ? undefined : t(`health.cycle.tile.tempDir.${tempDirection(deviation.value)}`)}
          header={
            <MetricName
              target={{ term: 'skinTempChange', index: deviationIndex, shown: temp === null ? null : { value: temp.value, unit: temp.unit, reason: null } }}
              label={t('health.cycle.tile.temp')}
              testID="cycle-tile-temp-name"
            />
          }
          chip={fit === null ? null : fit === 'typical' ? { label: t('health.cycle.tile.typical'), tone: 'positive' } : { label: t('health.cycle.tile.different'), tone: 'neutral' }}
          testID="cycle-tile-temp"
        />
      </StatGrid>

      <Button label={t('health.cycle.links.symptoms')} icon="plus" onPress={() => router.push('/health/symptoms')} testID="cycle-link-symptoms" />

      <LevelNote level="D" text={t('health.cycle.levelNote')} testID="cycle-level" />

      {formOpen || editingId !== null ? (
        <Card testID="cycle-form">
          <AppText variant="capLarge" muted>
            {editingId === null ? t('health.cycle.form.addTitle') : t('health.cycle.form.editTitle')}
          </AppText>
          <Field
            label={t('health.cycle.field.start')}
            hint={t('health.cycle.field.startHint')}
            error={has('start')}
            value={draft.start}
            onChangeText={(start) => patchDraft({ start })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="YYYY-MM-DD"
            testID="cycle-input-start"
          />
          <Field
            label={t('health.cycle.field.end')}
            hint={t('health.cycle.field.endHint', { max: CYCLE_LIMITS.maxPeriodDays })}
            error={has('end')}
            value={draft.end}
            onChangeText={(end) => patchDraft({ end })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="YYYY-MM-DD"
            testID="cycle-input-end"
          />
          <AppText variant="capSmall" muted>
            {t('health.cycle.field.flow')}
          </AppText>
          <Segmented
            testID="cycle-flow"
            value={`${draft.flow}` as `${FlowLevel}`}
            onChange={(value) => {
              const level = FLOW_OPTIONS.find((candidate) => `${candidate}` === value);
              if (level !== undefined) patchDraft({ flow: level });
            }}
            options={FLOW_OPTIONS.map((level) => ({ value: `${level}` as const, label: t(FLOW_LABEL[level]) }))}
          />
          {has('overlap') ? (
            <AppText variant="caption" color={colors.negative} testID="cycle-overlap">
              {t('health.cycle.error.overlap')}
            </AppText>
          ) : null}
          <Button
            label={editingId === null ? t('health.cycle.action.save') : t('health.cycle.action.saveEdit')}
            onPress={() => void submit()}
            disabled={saving}
            testID="cycle-save"
          />
          {editingId !== null ? <Button label={t('health.cycle.action.cancel')} variant="tertiary" onPress={reset} testID="cycle-cancel" /> : null}
        </Card>
      ) : (
        <Button label={t('health.cycle.form.addTitle')} icon="calendar" variant="soft" onPress={() => setFormOpen(true)} testID="cycle-open-form" />
      )}

      <Section title={t('health.cycle.overview.title')}>
        <Card testID="cycle-overview">
          <StatRow>
            <StatTile
              label={t('health.cycle.stat.cycleLength')}
              value={stats.averageCycleDays === null ? notSet : fmt(stats.averageCycleDays)}
              unit={stats.averageCycleDays === null ? undefined : t('health.cycle.unit.days')}
              testID="cycle-average"
            />
            <StatTile
              label={t('health.cycle.stat.periodLength')}
              value={stats.averagePeriodDays === null ? notSet : fmt(stats.averagePeriodDays)}
              unit={stats.averagePeriodDays === null ? undefined : t('health.cycle.unit.days')}
              testID="cycle-period-average"
            />
          </StatRow>
          {stats.cycleCount > 0 && stats.shortestCycleDays !== null && stats.longestCycleDays !== null ? (
            <AppText variant="caption" muted testID="cycle-basis">
              {t('health.cycle.stat.basis', { count: stats.cycleCount, min: stats.shortestCycleDays, max: stats.longestCycleDays })}
            </AppText>
          ) : null}
          {stats.skippedGaps > 0 ? (
            <AppText variant="caption" muted testID="cycle-skipped">
              {t('health.cycle.stat.skipped', { count: stats.skippedGaps, min: CYCLE_LIMITS.minCycleDays, max: CYCLE_LIMITS.maxCycleDays })}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <ParityBadge level="D" />
            <AppText variant="caption" muted style={{ flex: 1 }}>
              {t('health.cycle.overview.note')}
            </AppText>
          </View>
        </Card>

        <Card testID="cycle-next">
          <AppText variant="capLarge" muted>
            {t('health.cycle.next.title')}
          </AppText>
          {pregnant ? (
            <AppText variant="body" testID="cycle-next-pregnant">
              {t('health.cycle.pregnancyActive')}
            </AppText>
          ) : next.ok ? (
            <>
              <AppText variant="h2" numeric testID="cycle-next-value">
                {nextValue()}
              </AppText>
              <AppText variant="label" muted numeric testID="cycle-next-day">
                {next.day}
              </AppText>
              {next.earliestDay !== next.latestDay ? (
                <AppText variant="caption" muted testID="cycle-next-range">
                  {t('health.cycle.next.range', { from: formatShortDay(next.earliestDay, language), to: formatShortDay(next.latestDay, language) })}
                </AppText>
              ) : null}
            </>
          ) : (
            <AppText variant="body" muted testID="cycle-next-reason">
              {next.reason === 'no-data' ? t('health.cycle.next.noData') : t('health.cycle.next.needsHistory', { count: CYCLE_LIMITS.minCyclesForEstimate + 1 })}
            </AppText>
          )}
          <AppText variant="caption" muted testID="cycle-next-disclaimer">
            {t('health.cycle.next.disclaimer')}
          </AppText>
        </Card>
      </Section>

      <Section title={t('health.cycle.timeline.title')} hint={t('health.cycle.timeline.hint')}>
        <Segmented
          testID="cycle-range"
          value={range}
          onChange={setRange}
          options={TIMELINE_RANGES.map((value) => ({ value: `${value}` as const, label: t(`health.cycle.range.${value}`) }))}
        />
        <Card testID="cycle-timeline-card">
          <CycleTimeline
            testID="cycle-timeline"
            days={timeline}
            formatTick={(value) => formatSigned(value, 1, language)}
            emptyLabel={t('health.cycle.timeline.empty', { days: range })}
            startLabel={formatShortDay(timelineStart, language)}
            endLabel={formatShortDay(today, language)}
          />
          <AppText variant="caption" muted>
            {t('health.cycle.timeline.legendPeriod')}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <ParityBadge level={PARITY.skinTemp} />
            <AppText variant="caption" muted style={{ flex: 1 }} testID="cycle-temp-note">
              {t('health.cycle.timeline.legendTemp')}
            </AppText>
          </View>
        </Card>
      </Section>

      <Section title={t('health.cycle.entries.title')}>
        {newestFirst.length === 0 ? (
          <AppText variant="body" muted testID="cycle-entries-empty">
            {t('health.cycle.entries.empty')}
          </AppText>
        ) : (
          newestFirst.map((entry) => {
            const length = periodLengthDays(entry);
            return (
              <Card key={entry.id} testID={`cycle-entry-${entry.id}`}>
                <View style={{ gap: 2 }}>
                  <AppText variant="bodyStrong" numeric>
                    {entry.endDay === null ? `${entry.startDay} · ${t('health.cycle.entries.ongoing')}` : `${entry.startDay} → ${entry.endDay}`}
                  </AppText>
                  <AppText variant="label" muted>
                    {t(FLOW_LABEL[entry.flow])}
                    {length === null ? '' : ` · ${t('health.cycle.entries.length', { days: length })}`}
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm }}>
                  {confirmId === entry.id ? (
                    <>
                      <Button label={t('health.cycle.action.confirmDelete')} variant="danger" onPress={() => void remove(entry.id)} testID={`cycle-confirm-${entry.id}`} />
                      <Button label={t('health.cycle.action.keep')} variant="tertiary" onPress={() => setConfirmId(null)} testID={`cycle-keep-${entry.id}`} />
                    </>
                  ) : (
                    <>
                      <Button label={t('health.cycle.action.edit')} variant="tertiary" onPress={() => startEdit(entry)} testID={`cycle-edit-${entry.id}`} />
                      <Button label={t('health.cycle.action.delete')} variant="tertiary" onPress={() => setConfirmId(entry.id)} testID={`cycle-delete-${entry.id}`} />
                    </>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </Section>

      <Button label={t('health.cycle.links.pregnancy')} variant="secondary" onPress={() => router.push('/health/pregnancy')} testID="cycle-link-pregnancy" />

      <Section title={t('health.cycle.privacy.title')}>
        <Card testID="cycle-privacy">
          <AppText variant="body" muted>
            {t('health.cycle.privacy.body')}
          </AppText>
          {confirmAll ? (
            <>
              <AppText variant="bodyStrong" testID="cycle-wipe-warning">
                {t('health.cycle.privacy.confirm')}
              </AppText>
              <Button label={t('health.cycle.privacy.confirmAction')} variant="danger" onPress={() => void wipe()} testID="cycle-wipe-confirm" />
              <Button label={t('health.cycle.action.keep')} variant="tertiary" onPress={() => setConfirmAll(false)} testID="cycle-wipe-keep" />
            </>
          ) : (
            <Button label={t('health.cycle.privacy.deleteAll')} variant="secondary" disabled={!hasData} onPress={() => setConfirmAll(true)} testID="cycle-wipe" />
          )}
        </Card>
      </Section>
    </HealthPage>
  );
}
