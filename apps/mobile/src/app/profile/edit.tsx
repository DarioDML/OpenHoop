import { useState } from 'react';

import { parseDecimal, parseWholeNumber } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import type { Sex } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field, Segmented } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

type SaveState = 'idle' | 'saved' | 'invalid';
type SexChoice = Sex | 'unset';

function inRange(value: number | null, min: number, max: number): boolean {
  return value === null || (value >= min && value <= max);
}

export default function EditProfileScreen() {
  const { userData, profile, updateUserData, updateProfile } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [name, setName] = useState(userData.name ?? '');
  const [height, setHeight] = useState(userData.heightCm?.toString() ?? '');
  const [weight, setWeight] = useState(userData.weightKg?.toString() ?? '');
  const [sex, setSex] = useState<SexChoice>(userData.sex ?? 'unset');
  const [stepsGoal, setStepsGoal] = useState(userData.stepsGoal?.toString() ?? '');
  const [birthYear, setBirthYear] = useState(profile.birthYear?.toString() ?? '');
  const [maxHr, setMaxHr] = useState(profile.maxHeartRate?.toString() ?? '');
  const [state, setState] = useState<SaveState>('idle');
  const touch = (): void => setState('idle');

  const year = new Date().getFullYear();
  const parsedYear = birthYear.trim() === '' ? null : parseWholeNumber(birthYear);
  const defaultMaxHr = parsedYear !== null ? Math.round(208 - 0.7 * (year - parsedYear)) : null;

  const save = async (): Promise<void> => {
    const filled = (text: string): boolean => text.trim() !== '';
    const heightCm = filled(height) ? parseWholeNumber(height) : null;
    const weightKg = filled(weight) ? parseDecimal(weight) : null;
    const goal = filled(stepsGoal) ? parseWholeNumber(stepsGoal) : null;
    const by = filled(birthYear) ? parseWholeNumber(birthYear) : null;
    const hr = filled(maxHr) ? parseWholeNumber(maxHr) : null;
    const valid =
      (!filled(height) || heightCm !== null) &&
      (!filled(weight) || weightKg !== null) &&
      (!filled(stepsGoal) || goal !== null) &&
      (!filled(birthYear) || by !== null) &&
      (!filled(maxHr) || hr !== null) &&
      inRange(heightCm, 80, 250) &&
      inRange(weightKg, 25, 300) &&
      inRange(goal, 1000, 50000) &&
      inRange(by, 1900, year) &&
      inRange(hr, 120, 230);
    if (!valid) {
      setState('invalid');
      return;
    }
    const trimmed = name.trim().slice(0, 40);
    try {
      const stored = await updateUserData({ name: trimmed === '' ? null : trimmed, heightCm, weightKg, sex: sex === 'unset' ? null : sex, stepsGoal: goal });
      if (!stored) {
        setState('idle');
        return;
      }
      await updateProfile({ birthYear: by, maxHeartRate: hr });
    } catch {
      setState('idle');
      return;
    }
    setState('saved');
  };

  return (
    <Screen
      tint="neutral"
      testID="edit-profile"
      header={<TopBar title={t('profile.edit')} />}
      footer={<Button label={state === 'saved' ? t('common.saved') : t('common.save')} onPress={() => void save()} testID="profile-save" />}>
      <Section title={t('profile.about')}>
        <Card style={{ gap: spacing.lg }}>
          <Field label={t('profile.name')} value={name} onChangeText={(v) => { setName(v); touch(); }} maxLength={40} testID="profile-name-input" />
          <AppText variant="label" muted>
            {t('profile.sex')}
          </AppText>
          <Segmented<SexChoice>
            testID="profile-sex"
            value={sex}
            onChange={(v) => { setSex(v); touch(); }}
            options={[
              { value: 'female', label: t('profile.sex.female') },
              { value: 'male', label: t('profile.sex.male') },
              { value: 'other', label: t('profile.sex.other') },
            ]}
          />
        </Card>
      </Section>
      <Section title={t('profile.body')}>
        <Card style={{ gap: spacing.lg }}>
          <Field label={t('profile.height')} suffix="cm" value={height} onChangeText={(v) => { setHeight(v); touch(); }} keyboardType="number-pad" maxLength={3} testID="profile-height-input" />
          <Field label={t('profile.weight')} suffix="kg" value={weight} onChangeText={(v) => { setWeight(v); touch(); }} keyboardType="decimal-pad" maxLength={6} testID="profile-weight-input" />
          <Field label={t('profile.stepsGoal')} value={stepsGoal} onChangeText={(v) => { setStepsGoal(v); touch(); }} keyboardType="number-pad" maxLength={5} hint={t('profile.stepsGoalHint')} testID="profile-steps-input" />
        </Card>
      </Section>
      <Section title={t('profile.heartRate')}>
        <Card style={{ gap: spacing.lg }}>
          <Field label={t('settings.birthYear')} value={birthYear} onChangeText={(v) => { setBirthYear(v); touch(); }} keyboardType="number-pad" maxLength={4} testID="profile-birth-input" />
          <Field
            label={t('settings.maxHr')}
            value={maxHr}
            onChangeText={(v) => { setMaxHr(v); touch(); }}
            keyboardType="number-pad"
            maxLength={3}
            hint={defaultMaxHr === null ? t('settings.maxHrHintNoYear') : t('settings.maxHrHint', { value: defaultMaxHr })}
            testID="profile-maxhr-input"
          />
        </Card>
      </Section>
      {state === 'invalid' ? (
        <AppText variant="label" color={colors.negative} testID="profile-invalid">
          {t('profile.invalid')}
        </AppText>
      ) : null}
    </Screen>
  );
}
