import type { BodyMeasurement } from '@openhoop/core';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import {
  BODY_LIMITS,
  BODY_RANGES,
  computeTrend,
  parseBodyRange,
  sortMeasurements,
  draftWeightKg,
  towardGoal,
  validateBodyDraft,
  type WeightBase,
  type BodyDraft,
  type BodyField,
} from '@/data/bodyComposition';
import { useAppData } from '@/data/context';
import { bmi } from '@/data/healthDerived';
import { weightGoalsPaused } from '@/data/pregnancyPrefs';
import { useT } from '@/i18n/useT';
import { appNameList } from '@/lib/appNames';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { formatNumber, formatShortDay, formatSigned } from '@/lib/format';
import { formatWeight, useUnits, weightIn, weightToKg, weightUnit } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import type { ChipTone } from '@/ui/Chip';
import { Button, Field, Segmented } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { LineChart } from '@/ui/LineChart';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { KeyValueRow } from '@/ui/manage/rows';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { GridTile, StatGrid } from '@/ui/StatGrid';
import { spacing, useTheme } from '@/ui/theme';

const SHOWN_ENTRIES = 15;
const GOAL_TEXT = /^\d{1,3}([.,]\d{1,2})?$/;

function todayIso(): string {
  const now = new Date(Date.now());
  return unixToIsoDate(Math.floor(now.getTime() / 1000), deviceTzOffsetS(now));
}

function emptyDraft(): BodyDraft {
  return { day: todayIso(), weight: '', bodyFat: '' };
}

function plain(value: number): string {
  return Number(value.toFixed(1)).toString();
}

export default function BodyCompositionScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const units = useUnits();
  const { userData, cycle, healthConnect, updateUserData, bodyMeasurements, saveBodyMeasurement, removeBodyMeasurement } = useAppData();
  const [draft, setDraft] = useState<BodyDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBase, setEditBase] = useState<WeightBase | null>(null);
  const [invalid, setInvalid] = useState<BodyField[]>([]);
  const [saving, setSaving] = useState(false);
  const [range, setRange] = useState<string>('90');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalText, setGoalText] = useState('');
  const [goalInvalid, setGoalInvalid] = useState(false);

  const today = todayIso();
  const trend = computeTrend(bodyMeasurements, parseBodyRange(range), today);
  const index = trend.latest === null ? null : bmi(userData.heightCm, trend.latest.weightKg);
  const fmt = (value: number, decimals = 1): string => formatNumber(value, decimals, language);
  const weight = (kg: number): string => {
    const shown = formatWeight(kg, units, language);
    return `${shown.value} ${shown.unit}`;
  };
  const unit = weightUnit(units);
  const newestFirst = sortMeasurements(bodyMeasurements).reverse();
  const entries = showAll ? newestFirst : newestFirst.slice(0, SHOWN_ENTRIES);
  const has = (field: BodyField): boolean => invalid.includes(field);
  const paused = weightGoalsPaused(userData.pregnancyPrefs, cycle);
  const goalKg = paused ? null : userData.weightGoalKg;
  const firstPoint = trend.points[0];
  const lastPoint = trend.points[trend.points.length - 1];
  const toward = firstPoint === undefined || lastPoint === undefined ? null : towardGoal(firstPoint.weightKg, lastPoint.weightKg, goalKg);
  const fromHealthConnect = bodyMeasurements.filter((entry) => entry.source === 'health_connect');
  const apps = appNameList(fromHealthConnect.map((entry) => entry.origin));
  const android = Platform.OS === 'android';

  const arrow = (change: number, decimals: number, suffix: string): string => `${change > 0 ? '↑' : change < 0 ? '↓' : '→'} ${fmt(Math.abs(change), decimals)}${suffix}`;
  const changeChip = (change: number | null, decimals: number, suffix: string, tone: ChipTone): { label: string; tone: ChipTone } | null =>
    change === null ? null : { label: arrow(change, decimals, suffix), tone };

  const patchDraft = (change: Partial<BodyDraft>): void => {
    setDraft((current) => ({ ...current, ...change }));
    setInvalid([]);
  };

  const reset = (): void => {
    setDraft(emptyDraft());
    setEditingId(null);
    setEditBase(null);
    setInvalid([]);
  };

  const submit = async (): Promise<void> => {
    const result = validateBodyDraft({ ...draft, weight: draftWeightKg(draft.weight, units, editBase) }, todayIso());
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
    const shownWeight = units === 'metric' ? entry.weightKg.toString() : plain(weightIn(entry.weightKg, units));
    setEditBase({ text: shownWeight, kg: entry.weightKg });
    setEditingId(entry.id);
    setConfirmId(null);
    setInvalid([]);
    setDraft({
      day: entry.day,
      weight: shownWeight,
      bodyFat: entry.bodyFatPct === null ? '' : entry.bodyFatPct.toString(),
    });
  };

  const remove = async (id: number): Promise<void> => {
    setConfirmId(null);
    if (await removeBodyMeasurement(id)) {
      if (editingId === id) reset();
    }
  };

  const saveGoal = async (clear: boolean): Promise<void> => {
    if (clear) {
      if (await updateUserData({ weightGoalKg: null })) setGoalOpen(false);
      return;
    }
    const text = goalText.trim();
    const value = GOAL_TEXT.test(text) ? weightToKg(Number(text.replace(',', '.')), units) : null;
    if (value === null || value < BODY_LIMITS.weightKg.min || value > BODY_LIMITS.weightKg.max) {
      setGoalInvalid(true);
      return;
    }
    if (await updateUserData({ weightGoalKg: Math.round(value * 10) / 10 })) setGoalOpen(false);
  };

  const sourceText =
    fromHealthConnect.length > 0
      ? apps.length > 0
        ? t('health.bodyComposition.source.healthConnectApps', { apps: apps.join(', ') })
        : t('health.bodyComposition.source.healthConnect')
      : android && healthConnect.availability !== 'unsupported'
        ? t('health.bodyComposition.source.manualHc')
        : t('health.bodyComposition.source.manual');

  const limits = { min: Math.round(weightIn(BODY_LIMITS.weightKg.min, units)), max: Math.round(weightIn(BODY_LIMITS.weightKg.max, units)) };

  return (
    <HealthPage
      title={t('health.bodyComposition.title')}
      testID="health-body-composition"
      hero={
        <Segmented
          testID="body-range"
          value={range}
          onChange={setRange}
          options={BODY_RANGES.map((value) => ({ value: `${value}` as const, label: t(`health.bodyComposition.rangeShort.${value}`) }))}
        />
      }>
      <StatGrid testID="body-tiles">
        <GridTile
          label={t('health.bodyComposition.weight')}
          value={trend.latest === null ? null : formatWeight(trend.latest.weightKg, units, language).value}
          unit={unit}
          missing={t('health.bodyComposition.notSet')}
          chip={changeChip(trend.changeKg === null ? null : weightIn(trend.changeKg, units), 1, ` ${unit}`, toward === null ? 'neutral' : toward ? 'positive' : 'warning')}
          testID="body-latest"
        />
        <GridTile
          label={t('health.bodyComposition.fat')}
          value={trend.latest?.bodyFatPct == null ? null : fmt(trend.latest.bodyFatPct)}
          unit="%"
          missing={t('health.bodyComposition.notSet')}
          chip={changeChip(trend.changeBodyFatPct, 1, ` ${t('health.bodyComposition.unit.points')}`, 'neutral')}
          testID="body-fat"
        />
        <GridTile
          label={t('health.bodyComposition.trend.leanMass')}
          value={trend.leanMass === null ? null : formatWeight(trend.leanMass.kg, units, language).value}
          unit={unit}
          missing={t('health.bodyComposition.notSet')}
          chip={changeChip(trend.changeLeanKg === null ? null : weightIn(trend.changeLeanKg, units), 1, ` ${unit}`, 'neutral')}
          testID="body-lean"
        />
        <GridTile label="BMI" value={index === null ? null : fmt(index)} missing={t('health.bodyComposition.notSet')} testID="body-bmi" />
      </StatGrid>

      <Card testID="body-trend">
        <AppText variant="capLarge" muted>
          {t('health.bodyComposition.weight')}
        </AppText>
        <LineChart
          testID="body-chart"
          data={trend.points.map((point) => weightIn(point.weightKg, units))}
          height={110}
          color={colors.textMuted}
          guide={goalKg === null ? null : weightIn(goalKg, units)}
          formatTick={(value) => fmt(value)}
          emptyLabel={t('health.bodyComposition.trend.empty', { days: range })}
          startLabel={trend.firstDay === null ? undefined : formatShortDay(trend.firstDay, language)}
          endLabel={trend.lastDay === null ? undefined : formatShortDay(trend.lastDay, language)}
          minSpan={2}
        />
        <KeyValueRow
          label={t('health.bodyComposition.trend.change', { days: range })}
          value={trend.changeKg === null ? t('health.bodyComposition.notSet') : `${formatSigned(weightIn(trend.changeKg, units), 1, language)} ${unit}`}
          testID="body-change"
        />
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
          <AppText variant="caption" muted testID="body-bmi-reason">
            {t('health.bodyComposition.trend.noHeight')}
          </AppText>
        ) : null}
        {trend.latest !== null && trend.leanMass === null ? (
          <AppText variant="caption" muted testID="body-lean-reason">
            {t('health.bodyComposition.trend.noBodyFat')}
          </AppText>
        ) : null}
        {trend.leanMass !== null && !trend.leanMass.fromNewest ? (
          <AppText variant="caption" muted testID="body-lean-older">
            {t('health.bodyComposition.trend.leanFrom', { day: trend.leanMass.day })}
          </AppText>
        ) : null}
        {goalKg !== null ? (
          <AppText variant="caption" muted testID="body-goal-line">
            {t('health.bodyComposition.goal.line', { goal: weight(goalKg) })}
          </AppText>
        ) : null}
      </Card>

      <ListGroup>
        <ListRow
          testID="body-source"
          icon={{ icon: 'scale', color: colors.textSoft, background: colors.surfaceAlt }}
          title={t('health.bodyComposition.source.title')}
          subtitle={sourceText}
          href={android && healthConnect.availability !== 'unsupported' ? '/settings/integrations' : undefined}
        />
        <ListRow
          testID="body-goal"
          icon={{ icon: 'target', color: colors.textSoft, background: colors.surfaceAlt }}
          title={t('health.bodyComposition.goal.title')}
          subtitle={paused ? t('health.bodyComposition.goal.paused') : t('health.bodyComposition.goal.body')}
          value={paused ? undefined : userData.weightGoalKg === null ? t('health.bodyComposition.notSet') : weight(userData.weightGoalKg)}
          onPress={
            paused
              ? undefined
              : () => {
                  setGoalOpen(!goalOpen);
                  setGoalInvalid(false);
                  setGoalText(userData.weightGoalKg === null ? '' : plain(weightIn(userData.weightGoalKg, units)));
                }
          }
        />
      </ListGroup>

      {goalOpen && !paused ? (
        <Card testID="body-goal-form">
          <Field
            label={t('health.bodyComposition.goal.field')}
            hint={t('health.bodyComposition.field.weightHint', { ...limits, unit })}
            error={goalInvalid}
            suffix={unit}
            value={goalText}
            onChangeText={(text) => {
              setGoalText(text);
              setGoalInvalid(false);
            }}
            keyboardType="decimal-pad"
            testID="body-goal-input"
          />
          <Button label={t('health.bodyComposition.goal.save')} onPress={() => void saveGoal(false)} testID="body-goal-save" />
          {userData.weightGoalKg !== null ? (
            <Button label={t('health.bodyComposition.goal.clear')} variant="tertiary" onPress={() => void saveGoal(true)} testID="body-goal-clear" />
          ) : null}
        </Card>
      ) : null}

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
          hint={t('health.bodyComposition.field.weightHint', { ...limits, unit })}
          error={has('weight')}
          suffix={unit}
          value={draft.weight}
          onChangeText={(value) => patchDraft({ weight: value })}
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

      <Section title={t('health.bodyComposition.entries.title')}>
        {entries.length === 0 ? (
          <AppText variant="body" muted testID="body-entries-empty">
            {t('health.bodyComposition.entries.empty')}
          </AppText>
        ) : (
          entries.map((entry) => (
            <Card key={entry.id} testID={`body-entry-${entry.id}`}>
              <View style={{ gap: 2 }}>
                <AppText variant="bodyStrong" numeric>
                  {weight(entry.weightKg)}
                </AppText>
                <AppText variant="label" muted numeric>
                  {entry.day}
                  {entry.bodyFatPct === null ? '' : ` · ${t('health.bodyComposition.entries.fat', { value: fmt(entry.bodyFatPct) })}`}
                </AppText>
                {entry.source === 'health_connect' ? (
                  <AppText variant="caption" muted testID={`body-source-${entry.id}`}>
                    {appNameList([entry.origin]).length === 0
                      ? t('health.bodyComposition.entries.fromHealthConnect')
                      : t('health.bodyComposition.entries.fromHealthConnectApp', { app: appNameList([entry.origin]).join(', ') })}
                  </AppText>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm }}>
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
          <Button label={t('health.bodyComposition.action.showAll', { count: newestFirst.length })} variant="secondary" onPress={() => setShowAll(true)} testID="body-show-all" />
        ) : null}
      </Section>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <ParityBadge level="D" />
        <AppText variant="caption" muted style={{ flex: 1 }} testID="body-entered-note">
          {t('health.bodyComposition.trend.enteredNote')}
        </AppText>
      </View>
      <AppText variant="caption" muted>
        {t('health.bodyComposition.body')}
      </AppText>
    </HealthPage>
  );
}
