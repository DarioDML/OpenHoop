import type { BodyMeasurement } from '@openhoop/core';
import { useState } from 'react';
import { View } from 'react-native';

import {
  BODY_LIMITS,
  BODY_RANGES,
  computeTrend,
  parseBodyRange,
  sortMeasurements,
  validateBodyDraft,
  type BodyDraft,
  type BodyField,
} from '@/data/bodyComposition';
import { useAppData } from '@/data/context';
import { bmi } from '@/data/healthDerived';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { formatNumber, formatShortDay, formatSigned } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field, Segmented } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { LineChart } from '@/ui/LineChart';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { spacing } from '@/ui/theme';

const SHOWN_ENTRIES = 15;

function todayIso(): string {
  const now = new Date(Date.now());
  return unixToIsoDate(Math.floor(now.getTime() / 1000), deviceTzOffsetS(now));
}

function emptyDraft(): BodyDraft {
  return { day: todayIso(), weight: '', bodyFat: '' };
}

export default function BodyCompositionScreen() {
  const { t, language } = useT();
  const { userData, bodyMeasurements, saveBodyMeasurement, removeBodyMeasurement } = useAppData();
  const [draft, setDraft] = useState<BodyDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [invalid, setInvalid] = useState<BodyField[]>([]);
  const [saving, setSaving] = useState(false);
  const [range, setRange] = useState<string>('90');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const today = todayIso();
  const trend = computeTrend(bodyMeasurements, parseBodyRange(range), today);
  const index = trend.latest === null ? null : bmi(userData.heightCm, trend.latest.weightKg);
  const fmt = (value: number, decimals = 1): string => formatNumber(value, decimals, language);
  const newestFirst = sortMeasurements(bodyMeasurements).reverse();
  const entries = showAll ? newestFirst : newestFirst.slice(0, SHOWN_ENTRIES);
  const has = (field: BodyField): boolean => invalid.includes(field);

  const patchDraft = (change: Partial<BodyDraft>): void => {
    setDraft((current) => ({ ...current, ...change }));
    setInvalid([]);
  };

  const reset = (): void => {
    setDraft(emptyDraft());
    setEditingId(null);
    setInvalid([]);
  };

  const submit = async (): Promise<void> => {
    const result = validateBodyDraft(draft, todayIso());
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    setSaving(true);
    const saved = await saveBodyMeasurement(editingId, result.value);
    setSaving(false);
    if (saved) reset();
  };

  const startEdit = (entry: BodyMeasurement): void => {
    setEditingId(entry.id);
    setConfirmId(null);
    setInvalid([]);
    setDraft({
      day: entry.day,
      weight: entry.weightKg.toString(),
      bodyFat: entry.bodyFatPct === null ? '' : entry.bodyFatPct.toString(),
    });
  };

  const remove = async (id: number): Promise<void> => {
    setConfirmId(null);
    if (await removeBodyMeasurement(id)) {
      if (editingId === id) reset();
    }
  };

  const range1 = formatShortDay(trend.firstDay ?? '', language);
  const range2 = formatShortDay(trend.lastDay ?? '', language);

  return (
    <HealthPage
      title={t('health.bodyComposition.title')}
      testID="health-body-composition"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.bodyComposition.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.bodyComposition.body')}
          </AppText>
        </View>
      }>
      <Card testID="body-form">
        <AppText variant="capLarge" muted>
          {editingId === null ? t('health.bodyComposition.form.addTitle') : t('health.bodyComposition.form.editTitle')}
        </AppText>
        <Field
          label={t('health.bodyComposition.field.date')}
          hint={t('health.bodyComposition.field.dateHint')}
          error={has('day')}
          value={draft.day}
          onChangeText={(day) => patchDraft({ day })}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="YYYY-MM-DD"
          testID="body-input-day"
        />
        <Field
          label={t('health.bodyComposition.weight')}
          hint={t('health.bodyComposition.field.weightHint', { min: BODY_LIMITS.weightKg.min, max: BODY_LIMITS.weightKg.max })}
          error={has('weight')}
          suffix="kg"
          value={draft.weight}
          onChangeText={(weight) => patchDraft({ weight })}
          keyboardType="decimal-pad"
          testID="body-input-weight"
        />
        <Field
          label={t('health.bodyComposition.field.bodyFat')}
          hint={t('health.bodyComposition.field.bodyFatHint', { min: BODY_LIMITS.bodyFatPct.min, max: BODY_LIMITS.bodyFatPct.max })}
          error={has('bodyFat')}
          suffix="%"
          value={draft.bodyFat}
          onChangeText={(bodyFat) => patchDraft({ bodyFat })}
          keyboardType="decimal-pad"
          testID="body-input-fat"
        />
        <AppText variant="caption" muted>
          {t('health.bodyComposition.form.profileHint')}
        </AppText>
        <Button
          label={editingId === null ? t('health.bodyComposition.action.save') : t('health.bodyComposition.action.saveEdit')}
          onPress={() => void submit()}
          disabled={saving}
          testID="body-save"
        />
        {editingId !== null ? <Button label={t('health.bodyComposition.action.cancel')} variant="tertiary" onPress={reset} testID="body-cancel" /> : null}
      </Card>

      <Section title={t('health.bodyComposition.trend.title')}>
        <Segmented
          testID="body-range"
          value={range}
          onChange={setRange}
          options={BODY_RANGES.map((value) => ({ value: `${value}` as const, label: t(`health.bodyComposition.range.${value}`) }))}
        />
        <Card testID="body-trend">
          <LineChart
            testID="body-chart"
            data={trend.points.map((point) => point.weightKg)}
            formatTick={(value) => fmt(value)}
            emptyLabel={t('health.bodyComposition.trend.empty', { days: range })}
            startLabel={trend.firstDay === null ? undefined : range1}
            endLabel={trend.lastDay === null ? undefined : range2}
            minSpan={2}
          />
          <StatRow>
            <StatTile
              label={t('health.bodyComposition.trend.latest')}
              value={trend.latest === null ? t('health.bodyComposition.notSet') : fmt(trend.latest.weightKg)}
              unit={trend.latest === null ? undefined : 'kg'}
              testID="body-latest"
            />
            <StatTile
              label={t('health.bodyComposition.trend.change', { days: range })}
              value={trend.changeKg === null ? t('health.bodyComposition.notSet') : formatSigned(trend.changeKg, 1, language)}
              unit={trend.changeKg === null ? undefined : 'kg'}
              testID="body-change"
            />
          </StatRow>
          <StatRow>
            <StatTile label="BMI" value={index === null ? t('health.bodyComposition.notSet') : fmt(index)} testID="body-bmi" />
            <StatTile
              label={t('health.bodyComposition.trend.leanMass')}
              value={trend.leanMass === null ? t('health.bodyComposition.notSet') : fmt(trend.leanMass.kg)}
              unit={trend.leanMass === null ? undefined : 'kg'}
              testID="body-lean"
            />
          </StatRow>
          {trend.changeKg === null && trend.latest !== null ? (
            <AppText variant="caption" muted testID="body-change-few">
              {t('health.bodyComposition.trend.fewEntries')}
            </AppText>
          ) : null}
          {trend.changeBodyFatPct !== null ? (
            <AppText variant="label" muted testID="body-fat-change">
              {t('health.bodyComposition.trend.fatChange', { value: formatSigned(trend.changeBodyFatPct, 1, language) })}
            </AppText>
          ) : null}
          {trend.latest !== null && index === null ? (
            <AppText variant="caption" muted testID="body-bmi-missing">
              {t('health.bodyComposition.trend.noHeight')}
            </AppText>
          ) : null}
          {trend.latest !== null && trend.leanMass === null ? (
            <AppText variant="caption" muted testID="body-lean-missing">
              {t('health.bodyComposition.trend.noBodyFat')}
            </AppText>
          ) : null}
          {trend.leanMass !== null && !trend.leanMass.fromNewest ? (
            <AppText variant="caption" muted testID="body-lean-older">
              {t('health.bodyComposition.trend.leanFrom', { day: trend.leanMass.day })}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <ParityBadge level="D" />
            <AppText variant="caption" muted style={{ flex: 1 }} testID="body-entered-note">
              {t('health.bodyComposition.trend.enteredNote')}
            </AppText>
          </View>
        </Card>
      </Section>

      <Section title={t('health.bodyComposition.entries.title')}>
        {entries.length === 0 ? (
          <AppText variant="body" muted testID="body-entries-empty">
            {t('health.bodyComposition.entries.empty')}
          </AppText>
        ) : (
          entries.map((entry) => (
            <Card key={entry.id} testID={`body-entry-${entry.id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong" numeric>
                    {fmt(entry.weightKg)} kg
                  </AppText>
                  <AppText variant="label" muted numeric>
                    {entry.day}
                    {entry.bodyFatPct === null ? '' : ` · ${t('health.bodyComposition.entries.fat', { value: fmt(entry.bodyFatPct) })}`}
                  </AppText>
                  {entry.source === 'health_connect' ? (
                    <AppText variant="caption" muted testID={`body-source-${entry.id}`}>
                      {entry.origin === null
                        ? t('health.bodyComposition.entries.fromHealthConnect')
                        : t('health.bodyComposition.entries.fromHealthConnectApp', { app: entry.origin })}
                    </AppText>
                  ) : null}
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
                {confirmId === entry.id ? (
                  <>
                    <Button label={t('health.bodyComposition.action.confirmDelete')} variant="danger" onPress={() => void remove(entry.id)} testID={`body-confirm-${entry.id}`} />
                    <Button label={t('health.bodyComposition.action.keep')} variant="tertiary" onPress={() => setConfirmId(null)} testID={`body-keep-${entry.id}`} />
                  </>
                ) : (
                  <>
                    <Button label={t('health.bodyComposition.action.edit')} variant="tertiary" onPress={() => startEdit(entry)} testID={`body-edit-${entry.id}`} />
                    <Button label={t('health.bodyComposition.action.delete')} variant="tertiary" onPress={() => setConfirmId(entry.id)} testID={`body-delete-${entry.id}`} />
                  </>
                )}
              </View>
            </Card>
          ))
        )}
        {!showAll && newestFirst.length > SHOWN_ENTRIES ? (
          <Button
            label={t('health.bodyComposition.action.showAll', { count: newestFirst.length })}
            variant="secondary"
            onPress={() => setShowAll(true)}
            testID="body-show-all"
          />
        ) : null}
      </Section>
    </HealthPage>
  );
}
