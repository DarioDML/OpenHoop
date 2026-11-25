import type { FlowLevel, PeriodEntry } from '@openhoop/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import {
  CYCLE_LIMITS,
  FLOW_OPTIONS,
  buildTimeline,
  computeCycleStats,
  dayOfCycle,
  estimateNextPeriod,
  parseTimelineRange,
  periodLengthDays,
  validatePeriodDraft,
  TIMELINE_RANGES,
  type PeriodDraft,
  type PeriodField,
} from '@/data/cycle';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { todayIsoDate } from '@/lib/dates';
import { formatNumber, formatShortDay, formatSigned } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field, Segmented } from '@/ui/controls';
import { CycleTimeline } from '@/ui/health/CycleTimeline';
import { HealthPage } from '@/ui/health/HealthPage';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';

const FLOW_LABEL: Readonly<Record<FlowLevel, TranslationKey>> = {
  1: 'health.cycle.flow.1',
  2: 'health.cycle.flow.2',
  3: 'health.cycle.flow.3',
};

function emptyDraft(): PeriodDraft {
  return { start: todayIsoDate(), end: '', flow: 2 };
}

export default function CycleScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, cycle, savePeriod, removePeriod, removeAllCycleData } = useAppData();
  const [draft, setDraft] = useState<PeriodDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [invalid, setInvalid] = useState<PeriodField[]>([]);
  const [saving, setSaving] = useState(false);
  const [range, setRange] = useState<string>('90');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const today = todayIsoDate();
  const stats = computeCycleStats(cycle.periods);
  const next = estimateNextPeriod(stats, today);
  const cycleDay = dayOfCycle(stats, today);
  const timeline = buildTimeline(days, cycle.periods, today, parseTimelineRange(range));
  const newestFirst = [...cycle.periods].reverse();
  const pregnant = cycle.pregnancy !== null;
  const has = (field: PeriodField): boolean => invalid.includes(field);
  const fmt = (value: number): string => formatNumber(value, 1, language);
  const hasData = cycle.periods.length > 0 || cycle.symptoms.length > 0 || cycle.pregnancy !== null;

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

  return (
    <HealthPage
      title={t('health.cycle.title')}
      testID="health-cycle"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.cycle.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.cycle.body')}
          </AppText>
        </View>
      }>
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
          <StatRow>
            <StatTile
              label={t('health.cycle.stat.day')}
              value={cycleDay === null ? notSet : `${cycleDay}`}
              testID="cycle-day"
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
              {next.reason === 'no-data'
                ? t('health.cycle.next.noData')
                : t('health.cycle.next.needsHistory', { count: CYCLE_LIMITS.minCyclesForEstimate + 1 })}
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
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
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

      <View style={{ gap: spacing.sm }}>
        <Button label={t('health.cycle.links.symptoms')} variant="secondary" onPress={() => router.push('/health/symptoms')} testID="cycle-link-symptoms" />
        <Button label={t('health.cycle.links.pregnancy')} variant="secondary" onPress={() => router.push('/health/pregnancy')} testID="cycle-link-pregnancy" />
      </View>

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
            <Button
              label={t('health.cycle.privacy.deleteAll')}
              variant="secondary"
              disabled={!hasData}
              onPress={() => setConfirmAll(true)}
              testID="cycle-wipe"
            />
          )}
        </Card>
      </Section>
    </HealthPage>
  );
}
