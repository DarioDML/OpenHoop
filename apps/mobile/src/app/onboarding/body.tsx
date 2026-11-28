import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { birthDateParts, parseBirthFields } from '@/data/profile';
import type { Units } from '@/data/types';
import type { Sex } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { todayIsoDate } from '@/lib/dates';
import { heightIn, heightToCm, heightUnit, weightIn, weightToKg, weightUnit } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { Field, Segmented } from '@/ui/controls';
import { useLayout } from '@/ui/layout';
import { BirthDateField, type BirthPart } from '@/ui/manage/BirthDateField';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { checkMeasure, checkProfile, defaultMaxHr, measureLimits, parseDecimal } from '@/ui/manage/validation';
import { spacing, useTheme } from '@/ui/theme';

type SexChoice = Sex | 'none';

function oneDecimal(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function heightText(cm: number | null, units: Units): string {
  return cm === null ? '' : oneDecimal(heightIn(cm, units));
}

function weightText(kg: number | null, units: Units): string {
  return kg === null ? '' : oneDecimal(weightIn(kg, units));
}

interface TypedMeasure {
  text: string;
  units: Units;
  stored: boolean;
}

type Convert = (value: number, units: Units) => number;

function shownText(measure: TypedMeasure, units: Units, toMetric: Convert, fromMetric: Convert): string {
  if (measure.units === units) return measure.text;
  const value = parseDecimal(measure.text);
  return Number.isNaN(value) ? measure.text : oneDecimal(fromMetric(toMetric(value, measure.units), units));
}

export default function BodyScreen() {
  const { t } = useT();
  const { narrow } = useLayout();
  const { colors } = useTheme();
  const { profile, settings, userData, updateProfile, updateSettings, updateUserData } = useAppData();
  const born = birthDateParts(profile.birthDate);
  const [units, setUnits] = useState<Units>(settings.units);
  const [height, setHeight] = useState<TypedMeasure>({ text: heightText(userData.heightCm, settings.units), units: settings.units, stored: true });
  const [weight, setWeight] = useState<TypedMeasure>({ text: weightText(userData.weightKg, settings.units), units: settings.units, stored: true });
  const [birth, setBirth] = useState<Record<BirthPart, string>>({
    day: born ? String(born.day).padStart(2, '0') : '',
    month: born ? String(born.month).padStart(2, '0') : '',
    year: profile.birthYear?.toString() ?? '',
  });
  const [maxHr, setMaxHr] = useState(profile.maxHeartRate?.toString() ?? '');
  const [sex, setSex] = useState<SexChoice>(userData.sex ?? 'none');
  const [invalid, setInvalid] = useState(false);
  const [birthInvalid, setBirthInvalid] = useState(false);

  const today = todayIsoDate();
  const year = Number(today.slice(0, 4));
  const fallbackMaxHr = defaultMaxHr(birth.year, year);
  const limits = measureLimits(units);
  const heightShown = shownText(height, units, heightToCm, heightIn);
  const weightShown = shownText(weight, units, weightToKg, weightIn);

  const switchUnits = (next: Units): void => {
    if (next === units) return;
    setUnits(next);
    setInvalid(false);
    void updateSettings({ units: next });
  };

  const next = async (): Promise<void> => {
    const birthCheck = parseBirthFields(birth.day, birth.month, birth.year, today);
    const profileCheck = checkProfile(birth.year, maxHr, year);
    const heightCheck = checkMeasure(height.text, measureLimits(height.units).height);
    const weightCheck = checkMeasure(weight.text, measureLimits(weight.units).weight);
    if (!birthCheck.ok || !profileCheck.ok || !heightCheck.ok || !weightCheck.ok) {
      setInvalid(true);
      setBirthInvalid(!birthCheck.ok);
      return;
    }
    const heightCm = height.stored ? userData.heightCm : heightCheck.value === null ? null : Math.round(heightToCm(heightCheck.value, height.units) * 10) / 10;
    const weightKg = weight.stored ? userData.weightKg : weightCheck.value === null ? null : Math.round(weightToKg(weightCheck.value, weight.units) * 100) / 100;
    try {
      await updateProfile({ birthYear: birthCheck.birthYear, birthDate: birthCheck.birthDate, maxHeartRate: profileCheck.maxHeartRate });
      if (!(await updateUserData({ heightCm, weightKg, sex: sex === 'none' ? null : sex }))) return;
    } catch {
      return;
    }
    router.push('/onboarding/goals');
  };

  const touch = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setInvalid(false);
  };

  const typed = (setter: (value: TypedMeasure) => void) => (text: string) => {
    setter({ text, units, stored: false });
    setInvalid(false);
  };

  return (
    <OnboardingPage
      screen="body"
      title={t('onboarding.body.title')}
      subtitle={t('onboarding.body.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => void next() }}>
      <Segmented<Units>
        testID="units-switch"
        value={units}
        onChange={switchUnits}
        options={[
          { value: 'metric', label: t('onboarding.body.metric'), testID: 'units-metric' },
          { value: 'imperial', label: t('onboarding.body.imperial'), testID: 'units-imperial' },
        ]}
      />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label={t('onboarding.body.height')} suffix={heightUnit(units)} value={heightShown} onChangeText={typed(setHeight)} keyboardType="decimal-pad" maxLength={5} testID="height-input" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label={t('onboarding.body.weight')} suffix={weightUnit(units)} value={weightShown} onChangeText={typed(setWeight)} keyboardType="decimal-pad" maxLength={5} testID="weight-input" />
        </View>
      </View>
      <BirthDateField
        label={t('onboarding.body.birthDate')}
        day={birth.day}
        month={birth.month}
        year={birth.year}
        onChange={(part, value) => {
          setBirth((current) => ({ ...current, [part]: value }));
          setInvalid(false);
          setBirthInvalid(false);
        }}
        partLabels={{ day: t('onboarding.body.birthDay'), month: t('onboarding.body.birthMonth'), year: t('onboarding.body.birthYear') }}
        placeholders={{ day: t('onboarding.body.placeholderDay'), month: t('onboarding.body.placeholderMonth'), year: t('onboarding.body.placeholderYear') }}
        hint={t('onboarding.body.birthHint')}
        error={birthInvalid}
      />
      <View style={{ gap: 6 }}>
        <AppText variant="capSmall" muted>
          {t('onboarding.body.sex')}
        </AppText>
        <Segmented<SexChoice>
          testID="sex-choice"
          value={sex}
          onChange={setSex}
          wrap
          columns={narrow ? 2 : undefined}
          options={[
            { value: 'male', label: t('onboarding.body.male'), testID: 'sex-male' },
            { value: 'female', label: t('onboarding.body.female'), testID: 'sex-female' },
            { value: 'other', label: t('onboarding.body.other'), testID: 'sex-other' },
            { value: 'none', label: t('onboarding.body.none'), testID: 'sex-none' },
          ]}
        />
        <AppText variant="label" muted>
          {t('onboarding.body.sexNote')}
        </AppText>
      </View>
      <Field
        label={t('settings.maxHr')}
        value={maxHr}
        onChangeText={touch(setMaxHr)}
        keyboardType="number-pad"
        maxLength={3}
        hint={fallbackMaxHr === null ? t('settings.maxHrHintNoYear') : t('settings.maxHrHint', { value: fallbackMaxHr })}
        testID="max-hr-input"
      />
      {invalid ? (
        <AppText variant="label" color={colors.negative} testID="body-invalid">
          {t('onboarding.body.invalid', {
            heightMin: limits.height.min,
            heightMax: limits.height.max,
            heightUnit: heightUnit(units),
            weightMin: limits.weight.min,
            weightMax: limits.weight.max,
            weightUnit: weightUnit(units),
          })}
        </AppText>
      ) : null}
    </OnboardingPage>
  );
}
