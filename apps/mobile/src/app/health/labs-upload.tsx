import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import {
  BIOMARKER_IDS,
  BIOMARKER_UNITS,
  CUSTOM_PICK,
  LAB_LIMITS,
  convertLabValue,
  draftFromResult,
  emptyLabDraft,
  formatConverted,
  isBiomarkerId,
  parseBiomarkerKey,
  validateLabDraft,
  type LabDraft,
  type LabField,
} from '@/data/labs';
import { useT } from '@/i18n/useT';
import { todayIso } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { Button, Field, Segmented } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { markerName } from '@/ui/health/labsText';
import { ParityBadge } from '@/ui/ParityBadge';
import { spacing, useTheme } from '@/ui/theme';

function today(): string {
  return todayIso(new Date(Date.now()));
}

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/health/labs');
}

export default function LabsUploadScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ biomarker?: string; entry?: string }>();
  const { labResults, saveLabResult } = useAppData();
  const entryId = typeof params.entry === 'string' && /^\d+$/.test(params.entry) ? Number(params.entry) : null;
  const existing = entryId === null ? null : (labResults.find((result) => result.id === entryId) ?? null);
  const preset = typeof params.biomarker === 'string' && isBiomarkerId(params.biomarker) ? params.biomarker : '';

  const [draft, setDraft] = useState<LabDraft>(() => (existing === null ? emptyLabDraft(today(), preset) : draftFromResult(existing)));
  const [invalid, setInvalid] = useState<LabField[]>([]);
  const [saving, setSaving] = useState(false);
  const has = (field: LabField): boolean => invalid.includes(field);

  const patch = (change: Partial<LabDraft>): void => {
    setDraft((current) => ({ ...current, ...change }));
    setInvalid([]);
  };

  const pick = (biomarker: string): void => {
    if (biomarker === draft.biomarker) return;
    const units = isBiomarkerId(biomarker) ? BIOMARKER_UNITS[biomarker] : [];
    patch({ biomarker, unit: units[0]?.label ?? '' });
  };

  const submit = async (): Promise<void> => {
    const result = validateLabDraft(draft, today());
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    setSaving(true);
    const saved = await saveLabResult(existing === null ? null : existing.id, result.value);
    setSaving(false);
    if (saved) leave();
  };

  const catalogueUnits = isBiomarkerId(draft.biomarker) ? BIOMARKER_UNITS[draft.biomarker] : null;
  const typedValue = Number(draft.value.trim().replace(',', '.'));
  const showConversion = catalogueUnits !== null && draft.value.trim() !== '' && Number.isFinite(typedValue);
  const editing = existing !== null;
  const missingEntry = entryId !== null && existing === null;

  return (
    <HealthPage
      title={t('health.labsUpload.title')}
      testID="health-labs-upload"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.labsUpload.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.labsUpload.body')}
          </AppText>
        </View>
      }>
      {missingEntry ? (
        <Card>
          <AppText variant="body" muted testID="labs-upload-not-found">
            {t('health.labsUpload.notFound')}
          </AppText>
          <Button label={t('health.labsUpload.action.cancel')} variant="secondary" onPress={leave} testID="labs-cancel" />
        </Card>
      ) : (
        <Card testID="labs-form">
          <AppText variant="capLarge" muted>
            {editing ? t('health.labsUpload.form.editTitle') : t('health.labsUpload.form.addTitle')}
          </AppText>

          <View style={{ gap: 6 }}>
            <AppText variant="capSmall" muted>
              {t('health.labsUpload.field.biomarker')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {BIOMARKER_IDS.map((id) => (
                <Pill key={id} label={markerName({ kind: 'catalogue', id }, t)} selected={draft.biomarker === id} onPress={() => pick(id)} testID={`labs-pick-${id}`} />
              ))}
              <Pill label={t('health.labs.marker.custom')} selected={draft.biomarker === CUSTOM_PICK} onPress={() => pick(CUSTOM_PICK)} testID="labs-pick-custom" />
            </View>
            {has('biomarker') && draft.biomarker !== CUSTOM_PICK ? (
              <AppText variant="caption" color={colors.negative} testID="labs-biomarker-error">
                {t('health.labsUpload.field.biomarker')}
              </AppText>
            ) : null}
          </View>

          {draft.biomarker === CUSTOM_PICK ? (
            <Field
              label={t('health.labsUpload.field.customName')}
              hint={t('health.labsUpload.field.customNameHint', { max: LAB_LIMITS.nameLength })}
              error={has('biomarker')}
              value={draft.customName}
              onChangeText={(customName) => patch({ customName })}
              maxLength={LAB_LIMITS.nameLength}
              testID="labs-input-name"
            />
          ) : null}

          {catalogueUnits !== null ? (
            <View style={{ gap: 6 }}>
              <AppText variant="capSmall" muted>
                {t('health.labsUpload.field.unit')}
              </AppText>
              <Segmented
                testID="labs-input-unit"
                value={draft.unit}
                onChange={(unit) => patch({ unit })}
                options={catalogueUnits.map((unit) => ({ value: unit.label, label: unit.label }))}
              />
            </View>
          ) : null}
          {draft.biomarker === CUSTOM_PICK ? (
            <Field
              label={t('health.labsUpload.field.unit')}
              hint={t('health.labsUpload.field.customUnitHint')}
              error={has('unit')}
              value={draft.unit}
              onChangeText={(unit) => patch({ unit })}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={LAB_LIMITS.unitLength}
              testID="labs-input-custom-unit"
            />
          ) : null}

          <Field
            label={t('health.labsUpload.field.value')}
            hint={t('health.labsUpload.field.valueHint')}
            error={has('value')}
            suffix={draft.unit === '' ? undefined : draft.unit}
            value={draft.value}
            onChangeText={(value) => patch({ value })}
            keyboardType="decimal-pad"
            testID="labs-input-value"
          />
          {showConversion && catalogueUnits !== null && isBiomarkerId(draft.biomarker)
            ? catalogueUnits
                .filter((unit) => unit.label !== draft.unit)
                .map((unit) => {
                  const converted = convertLabValue(typedValue, draft.unit, unit.label, parseBiomarkerKey(draft.biomarker));
                  return converted === null ? null : (
                    <AppText key={unit.label} variant="caption" muted numeric testID={`labs-convert-${unit.label}`}>
                      {t('health.labsUpload.convertHint', { value: formatConverted(converted, language), unit: unit.label })}
                    </AppText>
                  );
                })
            : null}

          <Field
            label={t('health.labsUpload.field.date')}
            hint={t('health.labsUpload.field.dateHint')}
            error={has('day')}
            value={draft.day}
            onChangeText={(day) => patch({ day })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="YYYY-MM-DD"
            testID="labs-input-day"
          />
          <Field
            label={t('health.labsUpload.field.refLow')}
            error={has('refLow')}
            suffix={draft.unit === '' ? undefined : draft.unit}
            value={draft.refLow}
            onChangeText={(refLow) => patch({ refLow })}
            keyboardType="decimal-pad"
            testID="labs-input-low"
          />
          <Field
            label={t('health.labsUpload.field.refHigh')}
            hint={t('health.labsUpload.field.rangeHint')}
            error={has('refHigh')}
            suffix={draft.unit === '' ? undefined : draft.unit}
            value={draft.refHigh}
            onChangeText={(refHigh) => patch({ refHigh })}
            keyboardType="decimal-pad"
            testID="labs-input-high"
          />
          <Field
            label={t('health.labsUpload.field.note')}
            hint={t('health.labsUpload.field.noteHint', { max: LAB_LIMITS.noteLength })}
            error={has('note')}
            value={draft.note}
            onChangeText={(note) => patch({ note })}
            maxLength={LAB_LIMITS.noteLength}
            multiline
            testID="labs-input-note"
          />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <ParityBadge level="D" />
            <AppText variant="caption" muted style={{ flex: 1 }} testID="labs-upload-entered-note">
              {t('health.labsUpload.enteredNote')}
            </AppText>
          </View>
          <Button
            label={editing ? t('health.labsUpload.action.saveEdit') : t('health.labsUpload.action.save')}
            onPress={() => void submit()}
            disabled={saving}
            testID="labs-save"
          />
          {editing ? <Button label={t('health.labsUpload.action.cancel')} variant="tertiary" onPress={leave} testID="labs-cancel" /> : null}
        </Card>
      )}

      {editing ? null : (
        <Card testID="labs-import-entry">
          <AppText variant="cardTitle">{t('health.labsUpload.import.title')}</AppText>
          <AppText variant="label" muted>
            {t('health.labsUpload.import.body')}
          </AppText>
          <Button label={t('health.labsUpload.import.action')} icon="report" variant="secondary" onPress={() => router.push('/health/labs-import')} testID="labs-import-open" />
        </Card>
      )}
    </HealthPage>
  );
}
