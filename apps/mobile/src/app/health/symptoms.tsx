import type { Intensity, Symptom } from '@openhoop/core';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { INTENSITY_OPTIONS, SYMPTOM_OPTIONS, groupSymptomsByDay, validateSymptomDraft, type SymptomDraft, type SymptomField } from '@/data/cycle';
import { useT } from '@/i18n/useT';
import { todayIsoDate } from '@/lib/dates';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field, Segmented } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { Section } from '@/ui/Section';
import { radius, spacing, useTheme } from '@/ui/theme';

const SHOWN_DAYS = 14;

function emptyDraft(): SymptomDraft {
  return { day: todayIsoDate(), symptom: null, intensity: 1 };
}

export default function SymptomsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { cycle, saveSymptom, removeSymptom } = useAppData();
  const [draft, setDraft] = useState<SymptomDraft>(emptyDraft);
  const [invalid, setInvalid] = useState<SymptomField[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const groups = groupSymptomsByDay(cycle.symptoms);
  const shown = showAll ? groups : groups.slice(0, SHOWN_DAYS);

  const patchDraft = (change: Partial<SymptomDraft>): void => {
    setDraft((current) => ({ ...current, ...change }));
    setInvalid([]);
  };

  const submit = async (): Promise<void> => {
    const result = validateSymptomDraft(draft, todayIsoDate());
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    setSaving(true);
    const saved = await saveSymptom(result.value);
    setSaving(false);
    if (saved) setDraft((current) => ({ ...current, symptom: null, intensity: 1 }));
  };

  const remove = async (id: number): Promise<void> => {
    setConfirmId(null);
    await removeSymptom(id);
  };

  const pickIntensity = (value: string): void => {
    const level = INTENSITY_OPTIONS.find((candidate) => `${candidate}` === value);
    if (level !== undefined) patchDraft({ intensity: level });
  };

  const chip = (symptom: Symptom) => {
    const selected = draft.symptom === symptom;
    return (
      <Pressable
        key={symptom}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => patchDraft({ symptom })}
        testID={`symptom-chip-${symptom}`}
        style={{
          minHeight: 40,
          paddingHorizontal: spacing.lg,
          justifyContent: 'center',
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.primary : colors.surface,
          borderWidth: 1,
          borderColor: invalid.includes('symptom') ? colors.negative : colors.border,
        }}>
        <AppText variant="label" color={selected ? colors.primaryOn : colors.text}>
          {t(`health.symptoms.symptom.${symptom}`)}
        </AppText>
      </Pressable>
    );
  };

  const intensityLabel = (level: Intensity): string => t(`health.symptoms.intensity.${level}`);

  return (
    <HealthPage
      title={t('health.symptoms.title')}
      testID="health-symptoms"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.symptoms.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.symptoms.body')}
          </AppText>
        </View>
      }>
      <Card testID="symptom-form">
        <AppText variant="capLarge" muted>
          {t('health.symptoms.form.title')}
        </AppText>
        <Field
          label={t('health.symptoms.field.day')}
          hint={t('health.symptoms.field.dayHint')}
          error={invalid.includes('day')}
          value={draft.day}
          onChangeText={(day) => patchDraft({ day })}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="YYYY-MM-DD"
          testID="symptom-input-day"
        />
        <AppText variant="capSmall" muted>
          {t('health.symptoms.field.symptom')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{SYMPTOM_OPTIONS.map(chip)}</View>
        {invalid.includes('symptom') ? (
          <AppText variant="caption" color={colors.negative} testID="symptom-error">
            {t('health.symptoms.error.symptom')}
          </AppText>
        ) : null}
        <AppText variant="capSmall" muted>
          {t('health.symptoms.field.intensity')}
        </AppText>
        <Segmented
          testID="symptom-intensity"
          value={`${draft.intensity}`}
          onChange={pickIntensity}
          options={INTENSITY_OPTIONS.map((level) => ({ value: `${level}`, label: intensityLabel(level) }))}
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
                <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }} testID={`symptom-entry-${entry.id}`}>
                  <AppText variant="body" style={{ flex: 1 }}>
                    {`${t(`health.symptoms.symptom.${entry.symptom}`)} · ${intensityLabel(entry.intensity)}`}
                  </AppText>
                  {confirmId === entry.id ? (
                    <>
                      <Button label={t('health.cycle.action.confirmDelete')} variant="danger" onPress={() => void remove(entry.id)} testID={`symptom-confirm-${entry.id}`} />
                      <Button label={t('health.cycle.action.keep')} variant="tertiary" onPress={() => setConfirmId(null)} testID={`symptom-keep-${entry.id}`} />
                    </>
                  ) : (
                    <Button label={t('health.cycle.action.delete')} variant="tertiary" onPress={() => setConfirmId(entry.id)} testID={`symptom-delete-${entry.id}`} />
                  )}
                </View>
              ))}
            </Card>
          ))
        )}
        {!showAll && groups.length > SHOWN_DAYS ? (
          <Button
            label={t('health.symptoms.history.showAll', { count: groups.length })}
            variant="secondary"
            onPress={() => setShowAll(true)}
            testID="symptom-show-all"
          />
        ) : null}
      </Section>
    </HealthPage>
  );
}
