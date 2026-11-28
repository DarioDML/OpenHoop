import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { emptyCuffDraft, validateCuffDraft, type CuffDraft, type CuffField } from '@/data/cuff';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS } from '@/lib/dates';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field } from '@/ui/controls';
import { Callout } from '@/ui/health/Callout';
import { HealthPage } from '@/ui/health/HealthPage';
import { Icon } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { radius, spacing, useTheme } from '@/ui/theme';

function nowS(): number {
  return Math.floor(Date.now() / 1000);
}

function tzNow(): number {
  return deviceTzOffsetS(new Date(Date.now()));
}

function offsetAt(unixS: number): number {
  return deviceTzOffsetS(new Date(unixS * 1000));
}

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/health/blood-pressure');
}

interface StepProps {
  index: number;
  text: string;
  done: boolean;
  onPress?: () => void;
  testID: string;
}

function Step({ index, text, done, onPress, testID }: StepProps): ReactElement {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      disabled={onPress === undefined}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 44 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: done ? colors.positive : 'transparent',
          borderWidth: done ? 0 : 2,
          borderColor: colors.text,
        }}>
        {done ? <Icon name="check" color={colors.primaryOn} size={16} strokeWidth={2.6} /> : <AppText variant="bodyStrong">{String(index)}</AppText>}
      </View>
      <AppText variant="body" color={done ? colors.textMuted : colors.text} style={{ flex: 1 }}>
        {text}
      </AppText>
    </Pressable>
  );
}

export default function BpCalibrationScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const layout = useLayout();
  const { saveCuffReading, updateUserData, userData } = useAppData();
  const [draft, setDraft] = useState<CuffDraft>(() => emptyCuffDraft(nowS(), tzNow()));
  const [invalid, setInvalid] = useState<CuffField[]>([]);
  const [steps, setSteps] = useState<[boolean, boolean]>([false, false]);
  const [saving, setSaving] = useState(false);
  const has = (field: CuffField): boolean => invalid.includes(field);
  const typed = draft.systolic.trim() !== '' && draft.diastolic.trim() !== '';

  const patch = (change: Partial<CuffDraft>): void => {
    setDraft((current) => ({ ...current, ...change }));
    setInvalid([]);
  };

  const save = async (): Promise<void> => {
    const result = validateCuffDraft(draft, nowS(), offsetAt);
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    setSaving(true);
    const saved = await saveCuffReading(result.value);
    if (saved && !userData.cuffLog) await updateUserData({ cuffLog: true });
    setSaving(false);
    if (saved) leave();
  };

  const pair = (left: ReactElement, right: ReactElement): ReactElement =>
    layout.narrow ? (
      <View style={{ gap: spacing.md }}>
        {left}
        {right}
      </View>
    ) : (
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>{left}</View>
        <View style={{ flex: 1 }}>{right}</View>
      </View>
    );

  const error = has('order') ? t('health.bpCalibration.error.order') : invalid.length > 0 ? t('health.bpCalibration.error.fields') : null;

  return (
    <HealthPage title={t('health.bpCalibration.title')} tint="heart" testID="health-bp-calibration">
      <Card testID="cuff-steps" style={{ gap: spacing.sm }}>
        <Step index={1} text={t('health.bpCalibration.step1')} done={steps[0]} onPress={() => setSteps(([a, b]) => [!a, b])} testID="cuff-step-1" />
        <Step index={2} text={t('health.bpCalibration.step2')} done={steps[1]} onPress={() => setSteps(([a, b]) => [a, !b])} testID="cuff-step-2" />
        <Step index={3} text={t('health.bpCalibration.step3')} done={typed} testID="cuff-step-3" />
      </Card>

      {pair(
        <Field
          label={t('health.bpCalibration.systolic')}
          suffix="mmHg"
          error={has('systolic') || has('order')}
          value={draft.systolic}
          onChangeText={(systolic) => patch({ systolic })}
          keyboardType="number-pad"
          maxLength={3}
          testID="cuff-input-systolic"
        />,
        <Field
          label={t('health.bpCalibration.diastolic')}
          suffix="mmHg"
          error={has('diastolic') || has('order')}
          value={draft.diastolic}
          onChangeText={(diastolic) => patch({ diastolic })}
          keyboardType="number-pad"
          maxLength={3}
          testID="cuff-input-diastolic"
        />,
      )}
      <Field
        label={t('health.bpCalibration.pulse')}
        suffix="bpm"
        error={has('pulse')}
        value={draft.pulse}
        onChangeText={(pulse) => patch({ pulse })}
        keyboardType="number-pad"
        maxLength={3}
        testID="cuff-input-pulse"
      />
      {pair(
        <Field
          label={t('health.bpCalibration.day')}
          error={has('day')}
          value={draft.day}
          onChangeText={(day) => patch({ day })}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="YYYY-MM-DD"
          testID="cuff-input-day"
        />,
        <Field
          label={t('health.bpCalibration.time')}
          error={has('time')}
          value={draft.time}
          onChangeText={(time) => patch({ time })}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="HH:MM"
          testID="cuff-input-time"
        />,
      )}
      <AppText variant="caption" color={error === null ? colors.textMuted : colors.negative} testID="cuff-hint">
        {error ?? t('health.bpCalibration.hint')}
      </AppText>
      <Button label={t('health.bpCalibration.save')} onPress={() => void save()} disabled={saving} testID="cuff-save" />

      <Callout icon="info" tone="neutral" title={t('health.bpCalibration.ownTitle')} body={t('health.bpCalibration.ownBody')} testID="cuff-own" />
      <AppText variant="caption" muted testID="not-offered">
        {t('health.bpCalibration.notOffered')}
      </AppText>
    </HealthPage>
  );
}
