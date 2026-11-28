import type { Intensity, Symptom } from '@openhoop/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import {
  CYCLE_LIMITS,
  INTENSITY_OPTIONS,
  SYMPTOM_OPTIONS,
  applyDayFlow,
  computeCycleStats,
  dayFlow,
  estimateNextPeriod,
  fertileWindow,
  groupSymptomsByDay,
  validateSymptomDraft,
  type FlowChoice,
} from '@/data/cycle';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { parseIsoDate, todayIsoDate } from '@/lib/dates';
import { formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Field, Segmented } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { SelectChip } from '@/ui/health/SelectChip';
import type { IconName } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { KeyValueRow } from '@/ui/manage/rows';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

const SHOWN_DAYS = 14;

const SYMPTOM_ICON: Readonly<Record<Symptom, IconName>> = {
  cramps: 'load',
  headache: 'alert',
  bloating: 'layers',
  mood: 'sun',
  fatigue: 'battery',
  breastTenderness: 'heart',
  nausea: 'wind',
  backPain: 'user',
};

const FLOW_CHOICES = [0, 1, 2, 3] as const satisfies readonly FlowChoice[];

const FLOW_LABEL: Readonly<Record<FlowChoice, TranslationKey>> = {
  0: 'health.symptoms.flow.none',
  1: 'health.cycle.flow.1',
  2: 'health.cycle.flow.2',
  3: 'health.cycle.flow.3',
};

type Picked = Partial<Record<Symptom, Intensity>>;

type Problem = 'symptom' | 'day' | 'flowInside' | 'flowInvalid' | null;

export default function SymptomsScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const layout = useLayout();
  const { cycle, saveSymptom, removeSymptom, savePeriod, removePeriod } = useAppData();
  const [day, setDay] = useState<string>(todayIsoDate);
  const [picked, setPicked] = useState<Picked>({});
  const [flow, setFlow] = useState<FlowChoice | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const today = todayIsoDate();
  const groups = groupSymptomsByDay(cycle.symptoms);
  const shown = showAll ? groups : groups.slice(0, SHOWN_DAYS);
  const selected = SYMPTOM_OPTIONS.filter((symptom) => picked[symptom] !== undefined);
  const validDay = parseIsoDate(day.trim()) !== null && day.trim() <= today;
  const loggedFlow = validDay ? dayFlow(cycle.periods, day.trim(), today) : 0;
  const shownFlow = flow ?? loggedFlow;
  const pregnant = cycle.pregnancy !== null;
  const next = estimateNextPeriod(computeCycleStats(cycle.periods), today);
  const fertile = fertileWindow(next);
  const shortDay = (value: string): string => formatShortDay(value, language);

  const toggle = (symptom: Symptom): void => {
    setPicked((current) => {
      const nextPicked = { ...current };
      if (nextPicked[symptom] === undefined) nextPicked[symptom] = 1;
      else delete nextPicked[symptom];
      return nextPicked;
    });
    setProblem(null);
  };

  const setIntensity = (symptom: Symptom, value: string): void => {
    const level = INTENSITY_OPTIONS.find((candidate) => `${candidate}` === value);
    if (level !== undefined) setPicked((current) => ({ ...current, [symptom]: level }));
  };

  const submit = async (): Promise<void> => {
    const chosenDay = day.trim();
    if (!validDay) {
      setProblem('day');
      return;
    }
    const flowChanged = flow !== null && flow !== loggedFlow;
    if (selected.length === 0 && !flowChanged) {
      setProblem('symptom');
      return;
    }
    const action = flowChanged ? applyDayFlow(cycle.periods, chosenDay, flow, today) : ({ kind: 'none' } as const);
    if (action.kind === 'inside' || action.kind === 'invalid') {
      setProblem(action.kind === 'inside' ? 'flowInside' : 'flowInvalid');
      return;
    }
    setSaving(true);
    let ok = true;
    for (const symptom of selected) {
      const result = validateSymptomDraft({ day: chosenDay, symptom, intensity: picked[symptom] ?? 1 }, today);
      if (result.ok) ok = (await saveSymptom(result.value)) && ok;
    }
    if (action.kind === 'insert') ok = (await savePeriod(null, action.input)) && ok;
    if (action.kind === 'update') ok = (await savePeriod(action.id, action.input)) && ok;
    if (action.kind === 'delete') ok = (await removePeriod(action.id)) && ok;
    setSaving(false);
    if (ok) {
      setPicked({});
      setFlow(null);
    }
  };

  const remove = async (id: number): Promise<void> => {
    setConfirmId(null);
    await removeSymptom(id);
  };

  const intensityLabel = (level: Intensity): string => t(`health.symptoms.intensity.${level}`);
  const problemText =
    problem === 'symptom'
      ? t('health.symptoms.error.symptom')
      : problem === 'day'
        ? t('health.symptoms.error.day')
        : problem === 'flowInside'
          ? t('health.symptoms.error.flowInside')
          : problem === 'flowInvalid'
            ? t('health.symptoms.error.flowInvalid')
            : null;

  return (
    <HealthPage
      title={t('health.symptoms.title')}
      tint="cycle"
      testID="health-symptoms"
      right={<IconButton icon="check" label={t('health.symptoms.action.save')} onPress={() => void submit()} testID="symptom-save-top" />}>
      <View style={{ gap: spacing.md }} testID="symptom-form">
        <AppText variant="capLarge" muted>
          {day.trim() === today ? t('health.symptoms.today') : validDay ? shortDay(day.trim()) : t('health.symptoms.field.day')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {SYMPTOM_OPTIONS.map((symptom) => (
            <SelectChip
              key={symptom}
              label={t(`health.symptoms.symptom.${symptom}`)}
              icon={SYMPTOM_ICON[symptom]}
              selected={picked[symptom] !== undefined}
              error={problem === 'symptom'}
              onPress={() => toggle(symptom)}
              testID={`symptom-chip-${symptom}`}
            />
          ))}
        </View>
        {problemText !== null ? (
          <AppText variant="caption" color={colors.negative} testID={problem === 'symptom' ? 'symptom-error' : 'symptom-problem'}>
            {problemText}
          </AppText>
        ) : null}

        {selected.map((symptom) => (
          <View key={symptom} style={{ gap: spacing.sm }}>
            <AppText variant="capLarge" muted>
              {t('health.symptoms.intensityFor', { symptom: t(`health.symptoms.symptom.${symptom}`) })}
            </AppText>
            <Segmented
              testID={`symptom-intensity-${symptom}`}
              value={`${picked[symptom] ?? 1}`}
              onChange={(value) => setIntensity(symptom, value)}
              options={INTENSITY_OPTIONS.map((level) => ({ value: `${level}`, label: intensityLabel(level) }))}
            />
          </View>
        ))}

        <AppText variant="capLarge" muted>
          {t('health.cycle.field.flow')}
        </AppText>
        <Segmented
          testID="symptom-flow"
          value={`${shownFlow}`}
          onChange={(value) => {
            const choice = FLOW_CHOICES.find((candidate) => `${candidate}` === value);
            if (choice !== undefined) setFlow(choice);
            setProblem(null);
          }}
          options={FLOW_CHOICES.map((choice) => ({ value: `${choice}`, label: t(FLOW_LABEL[choice]), testID: `symptom-flow-${choice}` }))}
        />
        <AppText variant="caption" muted>
          {t('health.symptoms.flowHint')}
        </AppText>
      </View>

      <Card testID="symptom-predictions">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <AppText variant="cardTitle">{t('health.symptoms.predictions.title')}</AppText>
          <Chip label={t('health.cycle.tile.predicted')} tone="pink" />
        </View>
        {pregnant ? (
          <AppText variant="body" muted testID="symptom-predictions-pregnant">
            {t('health.cycle.pregnancyActive')}
          </AppText>
        ) : next.ok && fertile !== null ? (
          <View>
            <KeyValueRow label={t('health.symptoms.predictions.next')} value={shortDay(next.day)} testID="symptom-predict-next" />
            <KeyValueRow label={t('health.symptoms.predictions.fertile')} value={`${shortDay(fertile.from)} – ${shortDay(fertile.to)}`} testID="symptom-predict-fertile" />
          </View>
        ) : (
          <AppText variant="body" muted testID="symptom-predictions-reason">
            {next.ok || next.reason === 'needs-history' ? t('health.cycle.next.needsHistory', { count: CYCLE_LIMITS.minCyclesForEstimate + 1 }) : t('health.cycle.next.noData')}
          </AppText>
        )}
        <AppText variant="caption" muted>
          {t('health.symptoms.predictions.note')}
        </AppText>
        <Button label={t('health.cycle.title')} variant="tertiary" onPress={() => router.push('/health/cycle')} testID="symptom-open-cycle" />
      </Card>

      <Card>
        <Field
          label={t('health.symptoms.field.day')}
          hint={t('health.symptoms.field.dayHint')}
          error={problem === 'day'}
          value={day}
          onChangeText={(value) => {
            setDay(value);
            setFlow(null);
            setProblem(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="YYYY-MM-DD"
          testID="symptom-input-day"
        />
        <AppText variant="caption" muted>
          {t('health.symptoms.replaceHint')}
        </AppText>
        <Button label={t('health.symptoms.action.save')} onPress={() => void submit()} disabled={saving} testID="symptom-save" />
      </Card>

      <Section title={t('health.symptoms.history.title')}>
        {groups.length === 0 ? (
          <AppText variant="body" muted testID="symptom-empty">
            {t('health.symptoms.history.empty')}
          </AppText>
        ) : (
          shown.map((group) => (
            <Card key={group.day} testID={`symptom-day-${group.day}`}>
              <AppText variant="bodyStrong" numeric>
                {group.day}
              </AppText>
              {group.entries.map((entry) => (
                <View
                  key={entry.id}
                  style={{ flexDirection: layout.narrow ? 'column' : 'row', alignItems: layout.narrow ? 'flex-start' : 'center', gap: spacing.sm }}
                  testID={`symptom-entry-${entry.id}`}>
                  <AppText variant="body" style={{ flex: layout.narrow ? undefined : 1 }}>
                    {`${t(`health.symptoms.symptom.${entry.symptom}`)} · ${intensityLabel(entry.intensity)}`}
                  </AppText>
                  {confirmId === entry.id ? (
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Button label={t('health.cycle.action.confirmDelete')} variant="danger" onPress={() => void remove(entry.id)} testID={`symptom-confirm-${entry.id}`} />
                      <Button label={t('health.cycle.action.keep')} variant="tertiary" onPress={() => setConfirmId(null)} testID={`symptom-keep-${entry.id}`} />
                    </View>
                  ) : (
                    <Button label={t('health.cycle.action.delete')} variant="tertiary" onPress={() => setConfirmId(entry.id)} testID={`symptom-delete-${entry.id}`} />
                  )}
                </View>
              ))}
            </Card>
          ))
        )}
        <AppText variant="caption" muted testID="symptom-about">
          {t('health.symptoms.body')}
        </AppText>
        {!showAll && groups.length > SHOWN_DAYS ? (
          <Button label={t('health.symptoms.history.showAll', { count: groups.length })} variant="secondary" onPress={() => setShowAll(true)} testID="symptom-show-all" />
        ) : null}
      </Section>
    </HealthPage>
  );
}
