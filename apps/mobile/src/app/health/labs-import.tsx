import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { CoachErrorKind } from '@/coach/api';
import { useCoach } from '@/coach/CoachContext';
import { secureKeyStore } from '@/coach/keyStore';
import { useAppData } from '@/data/context';
import { requestLabExtraction } from '@/data/labImport/claude';
import { parseLabCsv } from '@/data/labImport/csv';
import { discardReport, pickCsvFile, pickReportFile, takeReportPhoto, type CsvPick, type PickOutcome, type ReportFile } from '@/data/labImport/files';
import { parseLabText } from '@/data/labImport/parse';
import { onDeviceAvailable, readOnDevice, uploadFor, type DeviceReadError, type UploadError } from '@/data/labImport/reader';
import { remapRow, rowsFromCandidates, sharedDay, validateSelected, withDay, type ReviewRow } from '@/data/labImport/review';
import { BIOMARKER_IDS, BIOMARKER_UNITS, CUSTOM_PICK, LAB_LIMITS, isBiomarkerId, type LabDraft, type LabField } from '@/data/labs';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { todayIso } from '@/lib/format';
import { netFetch } from '@/net';
import { featureEnabled } from '@/net/features';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { Button, Field, Segmented, Toggle } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { markerName } from '@/ui/health/labsText';
import { ParityBadge } from '@/ui/ParityBadge';
import { spacing, useTheme } from '@/ui/theme';

type Method = 'device' | 'claude';
type PickError = Exclude<PickOutcome['status'], 'picked' | 'cancelled'>;
type Failure =
  | { kind: 'pick'; error: PickError }
  | { kind: 'device'; error: DeviceReadError }
  | { kind: 'upload'; error: UploadError }
  | { kind: 'claude'; error: CoachErrorKind }
  | { kind: 'csv'; error: Exclude<CsvPick['status'], 'picked' | 'cancelled'> | 'nothing' }
  | { kind: 'nothing' };

type Phase =
  | { step: 'choose' }
  | { step: 'reading'; method: Method }
  | { step: 'review'; rows: ReviewRow[]; dropped: number }
  | { step: 'failed'; failure: Failure };

function today(): string {
  return todayIso(new Date(Date.now()));
}

function failureKey(failure: Failure): TranslationKey {
  switch (failure.kind) {
    case 'pick':
      return `health.labsImport.error.${failure.error}`;
    case 'device':
      return `health.labsImport.error.${failure.error}`;
    case 'upload':
      return failure.error === 'unreadable' ? 'health.labsImport.error.failed' : `health.labsImport.error.${failure.error}`;
    case 'claude':
      return `health.labsImport.claudeError.${failure.error}`;
    case 'csv':
      return `health.labsImport.csvError.${failure.error}`;
    case 'nothing':
      return 'health.labsImport.error.nothing';
  }
}

export default function LabsImportScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData, saveLabResult } = useAppData();
  const { state: coach } = useCoach();
  const params = useLocalSearchParams<{ source?: string }>();
  const csv = params.source === 'csv';
  const claudeReady = featureEnabled(userData.network, 'labs') && coach.hasKey;
  const deviceReady = onDeviceAvailable();
  const [method, setMethod] = useState<Method>(deviceReady || !claudeReady ? 'device' : 'claude');
  const [phase, setPhase] = useState<Phase>({ step: 'choose' });
  const [invalid, setInvalid] = useState<Record<string, LabField[]>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const chosen: Method = claudeReady ? method : 'device';

  const show = (next: Phase): void => {
    if (mounted.current) setPhase(next);
  };

  const readFile = async (file: ReportFile, via: Method): Promise<void> => {
    const day = today();
    const note = (value: string): string => t('health.labsImport.review.censoredNote', { value });
    try {
      if (via === 'device') {
        const read = await readOnDevice(file, (lines) => parseLabText(lines, day).candidates.length > 0);
        if (!read.ok) return show({ step: 'failed', failure: { kind: 'device', error: read.error } });
        const parsed = parseLabText(read.lines, day);
        if (parsed.candidates.length === 0) return show({ step: 'failed', failure: { kind: 'nothing' } });
        return show({ step: 'review', rows: rowsFromCandidates(parsed.candidates, note), dropped: 0 });
      }
      const upload = await uploadFor(file);
      if (!upload.ok) return show({ step: 'failed', failure: { kind: 'upload', error: upload.error } });
      let apiKey: string | null;
      try {
        apiKey = await secureKeyStore.load();
      } catch {
        return show({ step: 'failed', failure: { kind: 'claude', error: 'storage' } });
      }
      if (apiKey === null) return show({ step: 'failed', failure: { kind: 'claude', error: 'no-key' } });
      const reply = await requestLabExtraction(netFetch, { apiKey, model: userData.coach.model, upload: upload.upload, today: day });
      if (!reply.ok) return show({ step: 'failed', failure: { kind: 'claude', error: reply.error } });
      if (reply.candidates.length === 0) return show({ step: 'failed', failure: { kind: 'nothing' } });
      return show({ step: 'review', rows: rowsFromCandidates(reply.candidates, note), dropped: reply.dropped });
    } finally {
      discardReport(file.uri);
    }
  };

  const start = async (source: () => Promise<PickOutcome>): Promise<void> => {
    const via = chosen;
    const outcome = await source();
    if (outcome.status === 'cancelled') return;
    if (outcome.status !== 'picked') return show({ step: 'failed', failure: { kind: 'pick', error: outcome.status } });
    setInvalid({});
    setNotice(null);
    show({ step: 'reading', method: via });
    await readFile(outcome.file, via);
  };

  const startCsv = async (): Promise<void> => {
    const outcome = await pickCsvFile();
    if (outcome.status === 'cancelled') return;
    if (outcome.status !== 'picked') return show({ step: 'failed', failure: { kind: 'csv', error: outcome.status } });
    setInvalid({});
    setNotice(null);
    const parsed = parseLabCsv(outcome.text, today());
    if (parsed.candidates.length === 0) return show({ step: 'failed', failure: { kind: 'csv', error: 'nothing' } });
    const note = (value: string): string => t('health.labsImport.review.censoredNote', { value });
    show({ step: 'review', rows: rowsFromCandidates(parsed.candidates, note), dropped: 0 });
  };

  const updateRow = (id: string, change: (row: ReviewRow) => ReviewRow): void => {
    setPhase((current) => (current.step === 'review' ? { ...current, rows: current.rows.map((row) => (row.id === id ? change(row) : row)) } : current));
    setInvalid((current) => {
      if (current[id] === undefined) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setNotice(null);
  };

  const setDay = (day: string): void => {
    setPhase((current) => (current.step === 'review' ? { ...current, rows: withDay(current.rows, day) } : current));
    setInvalid({});
    setNotice(null);
  };

  const save = async (rows: readonly ReviewRow[]): Promise<void> => {
    if (busy.current) return;
    const checked = validateSelected(rows, today());
    if (!checked.ok) {
      setInvalid(checked.invalid);
      setNotice(t('health.labsImport.review.invalid'));
      return;
    }
    busy.current = true;
    setSaving(true);
    const saved = new Set<string>();
    try {
      for (const { id, input } of checked.inputs) {
        if (await saveLabResult(null, input)) saved.add(id);
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
    if (!mounted.current) return;
    const failed = checked.inputs.length - saved.size;
    if (failed === 0) {
      router.replace('/health/labs');
      return;
    }
    setPhase((current) => (current.step === 'review' ? { ...current, rows: current.rows.filter((row) => !saved.has(row.id)) } : current));
    setNotice(t('health.labsImport.review.saveFailed', { count: failed }));
  };

  const reset = (): void => {
    setInvalid({});
    setNotice(null);
    setPhase({ step: 'choose' });
  };

  return (
    <HealthPage
      title={t('health.labsImport.title')}
      testID="health-labs-import"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {csv ? t('health.labsImport.csv.heading') : t('health.labsImport.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {csv ? t('health.labsImport.csv.body') : t('health.labsImport.body')}
          </AppText>
        </View>
      }>
      {phase.step === 'choose' && csv ? (
        <Card testID="labs-import-csv">
          <AppText variant="capLarge" muted>
            {t('health.labsImport.csv.title')}
          </AppText>
          <AppText variant="body" muted>
            {t('health.labsImport.csv.columns')}
          </AppText>
          <Button label={t('health.labsImport.csv.pick')} icon="upload" onPress={() => void startCsv()} testID="labs-import-csv-pick" />
          <Button label={t('health.labsImport.csv.other')} variant="tertiary" onPress={() => router.replace('/health/labs-import')} testID="labs-import-csv-other" />
        </Card>
      ) : null}

      {phase.step === 'choose' && !csv ? (
        <Card testID="labs-import-choose">
          <AppText variant="capLarge" muted>
            {t('health.labsImport.method.title')}
          </AppText>
          {claudeReady ? (
            <Segmented
              testID="labs-import-method"
              value={chosen}
              onChange={setMethod}
              options={[
                { value: 'device', label: t('health.labsImport.method.device') },
                { value: 'claude', label: t('health.labsImport.method.claude') },
              ]}
            />
          ) : null}
          {chosen === 'device' ? (
            <AppText variant="body" muted testID="labs-import-device-body">
              {deviceReady ? t('health.labsImport.method.deviceBody') : t('health.labsImport.method.deviceUnavailable')}
            </AppText>
          ) : (
            <AppText variant="body" color={colors.warning} testID="labs-import-claude-body">
              {t('health.labsImport.method.claudeBody', { model: userData.coach.model })}
            </AppText>
          )}
          {claudeReady ? null : (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="caption" muted testID="labs-import-claude-off">
                {t('health.labsImport.method.claudeOff')}
              </AppText>
              <Button label={t('health.labsImport.method.privacy')} variant="tertiary" onPress={() => router.push('/settings/privacy')} testID="labs-import-privacy" />
            </View>
          )}
          <Button label={t('health.labsImport.pick')} icon="report" disabled={chosen === 'device' && !deviceReady} onPress={() => void start(pickReportFile)} testID="labs-import-pick" />
          <Button label={t('health.labsImport.camera')} variant="secondary" disabled={chosen === 'device' && !deviceReady} onPress={() => void start(takeReportPhoto)} testID="labs-import-camera" />
        </Card>
      ) : null}

      {phase.step === 'reading' ? (
        <Card testID="labs-import-reading">
          <ActivityIndicator color={colors.text} />
          <AppText variant="body" muted style={{ textAlign: 'center' }}>
            {phase.method === 'device' ? t('health.labsImport.reading.device') : t('health.labsImport.reading.claude')}
          </AppText>
        </Card>
      ) : null}

      {phase.step === 'failed' ? (
        <Card testID="labs-import-failed">
          <AppText variant="body" testID="labs-import-error">
            {t(failureKey(phase.failure))}
          </AppText>
          <Button label={t('health.labsImport.retry')} variant="secondary" onPress={reset} testID="labs-import-retry" />
        </Card>
      ) : null}

      {phase.step === 'review' ? (
        <ReviewList
          rows={phase.rows}
          dropped={phase.dropped}
          invalid={invalid}
          notice={notice}
          saving={saving}
          onChange={updateRow}
          onDay={setDay}
          onSave={() => void save(phase.rows)}
          onReset={reset}
        />
      ) : null}
    </HealthPage>
  );
}

interface ReviewListProps {
  rows: readonly ReviewRow[];
  dropped: number;
  invalid: Record<string, LabField[]>;
  notice: string | null;
  saving: boolean;
  onChange: (id: string, change: (row: ReviewRow) => ReviewRow) => void;
  onDay: (day: string) => void;
  onSave: () => void;
  onReset: () => void;
}

function ReviewList({ rows, dropped, invalid, notice, saving, onChange, onDay, onSave, onReset }: ReviewListProps) {
  const { t } = useT();
  const { colors } = useTheme();
  const [showOthers, setShowOthers] = useState(false);
  const selected = rows.filter((row) => row.selected).length;
  const day = sharedDay(rows);
  const known = rows.filter((row) => row.matchedAs !== null);
  const others = rows.filter((row) => row.matchedAs === null);
  const folded = known.length > 0 && others.length > 0;
  if (!showOthers && others.some((row) => invalid[row.id] !== undefined)) setShowOthers(true);
  const card = (row: ReviewRow) => <ReviewCard key={row.id} row={row} invalid={invalid[row.id] ?? []} onChange={(change) => onChange(row.id, change)} />;
  return (
    <View style={{ gap: spacing.lg }} testID="labs-import-review">
      <Card>
        <AppText variant="cardTitle">{t('health.labsImport.review.title')}</AppText>
        <AppText variant="body" testID="labs-import-count">
          {rows.length === 1 ? t('health.labsImport.review.countOne') : t('health.labsImport.review.count', { count: rows.length })}
        </AppText>
        <AppText variant="label" muted>
          {t('health.labsImport.review.body')}
        </AppText>
        {dropped > 0 ? (
          <AppText variant="caption" muted testID="labs-import-dropped">
            {t('health.labsImport.review.dropped', { count: dropped })}
          </AppText>
        ) : null}
        <Field
          label={t('health.labsImport.review.date')}
          hint={day === '' ? t('health.labsImport.review.noDate') : t('health.labsImport.review.dateHint')}
          error={day === ''}
          value={day}
          onChangeText={onDay}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="YYYY-MM-DD"
          testID="labs-import-day"
        />
      </Card>
      {folded ? known.map(card) : rows.map(card)}
      {folded ? (
        <Card testID="labs-import-others">
          <AppText variant="bodyStrong">{others.length === 1 ? t('health.labsImport.review.othersOne') : t('health.labsImport.review.others', { count: others.length })}</AppText>
          <AppText variant="label" muted>
            {t('health.labsImport.review.othersBody')}
          </AppText>
          <Button
            label={showOthers ? t('health.labsImport.review.othersHide') : t('health.labsImport.review.othersShow')}
            variant="secondary"
            onPress={() => setShowOthers(!showOthers)}
            testID="labs-import-others-toggle"
          />
        </Card>
      ) : null}
      {folded && showOthers ? others.map(card) : null}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <ParityBadge level="D" />
          <AppText variant="caption" muted style={{ flex: 1 }}>
            {t('health.labsImport.review.enteredNote')}
          </AppText>
        </View>
        {notice !== null ? (
          <AppText variant="body" color={colors.negative} testID="labs-import-notice">
            {notice}
          </AppText>
        ) : null}
        <Button label={t('health.labsImport.review.save', { count: selected })} disabled={saving || selected === 0} onPress={onSave} testID="labs-import-save" />
        <Button label={t('health.labsImport.review.again')} variant="tertiary" disabled={saving} onPress={onReset} testID="labs-import-again" />
      </Card>
    </View>
  );
}

interface ReviewCardProps {
  row: ReviewRow;
  invalid: readonly LabField[];
  onChange: (change: (row: ReviewRow) => ReviewRow) => void;
}

function ReviewCard({ row, invalid, onChange }: ReviewCardProps) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);
  const has = (field: LabField): boolean => invalid.includes(field);
  const patch = (change: Partial<LabDraft>): void => onChange((current) => ({ ...current, draft: { ...current.draft, ...change } }));
  const { draft } = row;
  const catalogueUnits = isBiomarkerId(draft.biomarker) ? BIOMARKER_UNITS[draft.biomarker] : null;
  const suffix = draft.unit === '' ? undefined : draft.unit;
  const prefix = `labs-import-${row.id}`;
  const shown = language === 'nl' ? row.printedValue.replace('.', ',') : row.printedValue;

  return (
    <Card testID={prefix}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong">{row.printedName}</AppText>
          <AppText variant="caption" muted testID={`${prefix}-status`}>
            {draft.biomarker === ''
              ? t('health.labsImport.review.unmatched')
              : row.matchedAs !== null && row.matchedAs === draft.biomarker
                ? t('health.labsImport.review.matched', { marker: markerName({ kind: 'catalogue', id: row.matchedAs }, t) })
                : t('health.labsImport.review.changed')}
          </AppText>
          <AppText variant="caption" muted numeric testID={`${prefix}-printed`}>
            {t('health.labsImport.review.printed', { value: shown, unit: row.printedUnit })}
          </AppText>
        </View>
        <Toggle label={t('health.labsImport.review.select')} value={row.selected} onChange={(selected) => onChange((current) => ({ ...current, selected }))} testID={`${prefix}-select`} />
      </View>

      {row.ambiguous ? (
        <AppText variant="caption" color={colors.warning} testID={`${prefix}-ambiguous`}>
          {t('health.labsImport.review.ambiguous', { value: row.printedValue })}
        </AppText>
      ) : null}

      {row.censored !== null ? (
        <AppText variant="caption" color={colors.warning} testID={`${prefix}-censored`}>
          {t('health.labsImport.review.censored', { value: shown })}
        </AppText>
      ) : null}

      {picking || has('biomarker') || (row.selected && row.draft.biomarker === '') ? (
        <View style={{ gap: 6 }}>
          <AppText variant="capSmall" muted>
            {t('health.labsUpload.field.biomarker')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {BIOMARKER_IDS.map((id) => (
              <Pill key={id} label={markerName({ kind: 'catalogue', id }, t)} selected={draft.biomarker === id} onPress={() => onChange((current) => remapRow(current, id))} testID={`${prefix}-pick-${id}`} />
            ))}
            <Pill label={t('health.labs.marker.custom')} selected={draft.biomarker === CUSTOM_PICK} onPress={() => onChange((current) => remapRow(current, CUSTOM_PICK))} testID={`${prefix}-pick-custom`} />
          </View>
          {has('biomarker') && draft.biomarker !== CUSTOM_PICK ? (
            <AppText variant="caption" color={colors.negative} testID={`${prefix}-biomarker-error`}>
              {t('health.labsUpload.field.biomarker')}
            </AppText>
          ) : null}
        </View>
      ) : (
        <Button label={t('health.labsImport.review.change')} variant="tertiary" onPress={() => setPicking(true)} testID={`${prefix}-change`} />
      )}

      {draft.biomarker === CUSTOM_PICK ? (
        <Field
          label={t('health.labsUpload.field.customName')}
          hint={t('health.labsUpload.field.customNameHint', { max: LAB_LIMITS.nameLength })}
          error={has('biomarker')}
          value={draft.customName}
          onChangeText={(customName) => patch({ customName })}
          maxLength={LAB_LIMITS.nameLength}
          testID={`${prefix}-name`}
        />
      ) : null}

      {catalogueUnits !== null ? (
        <View style={{ gap: 6 }}>
          <AppText variant="capSmall" color={has('unit') ? colors.negative : colors.textMuted}>
            {t('health.labsUpload.field.unit')}
          </AppText>
          <Segmented testID={`${prefix}-unit`} value={draft.unit} onChange={(unit) => patch({ unit })} options={catalogueUnits.map((unit) => ({ value: unit.label, label: unit.label }))} />
        </View>
      ) : (
        <Field
          label={t('health.labsUpload.field.unit')}
          hint={t('health.labsUpload.field.customUnitHint')}
          error={has('unit')}
          value={draft.unit}
          onChangeText={(unit) => patch({ unit })}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={LAB_LIMITS.unitLength}
          testID={`${prefix}-custom-unit`}
        />
      )}

      <Field label={t('health.labsUpload.field.value')} error={has('value')} suffix={suffix} value={draft.value} onChangeText={(value) => patch({ value })} keyboardType="decimal-pad" testID={`${prefix}-value`} />
      <Field
        label={t('health.labsUpload.field.date')}
        hint={has('day') ? t('health.labsUpload.field.dateHint') : undefined}
        error={has('day')}
        value={draft.day}
        onChangeText={(day) => patch({ day })}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="YYYY-MM-DD"
        testID={`${prefix}-day`}
      />
      <Field label={t('health.labsUpload.field.refLow')} error={has('refLow')} suffix={suffix} value={draft.refLow} onChangeText={(refLow) => patch({ refLow })} keyboardType="decimal-pad" testID={`${prefix}-low`} />
      <Field
        label={t('health.labsUpload.field.refHigh')}
        hint={has('refLow') || has('refHigh') ? t('health.labsUpload.field.rangeHint') : undefined}
        error={has('refHigh')}
        suffix={suffix}
        value={draft.refHigh}
        onChangeText={(refHigh) => patch({ refHigh })}
        keyboardType="decimal-pad"
        testID={`${prefix}-high`}
      />
    </Card>
  );
}
