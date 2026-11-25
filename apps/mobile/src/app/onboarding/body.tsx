import { router } from 'expo-router';
import { useState } from 'react';

import { useAppData } from '@/data/context';
import type { Sex } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Field, Segmented } from '@/ui/controls';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { checkMeasure, checkProfile, defaultMaxHr, HEIGHT_RANGE, WEIGHT_RANGE } from '@/ui/manage/validation';
import { useTheme } from '@/ui/theme';

type SexChoice = Sex | 'none';

export default function BodyScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { profile, userData, updateProfile, updateUserData } = useAppData();
  const [height, setHeight] = useState(userData.heightCm?.toString() ?? '');
  const [weight, setWeight] = useState(userData.weightKg?.toString() ?? '');
  const [birthYear, setBirthYear] = useState(profile.birthYear?.toString() ?? '');
  const [maxHr, setMaxHr] = useState(profile.maxHeartRate?.toString() ?? '');
  const [sex, setSex] = useState<SexChoice>(userData.sex ?? 'none');
  const [invalid, setInvalid] = useState(false);

  const year = new Date().getFullYear();
  const fallbackMaxHr = defaultMaxHr(birthYear, year);

  const next = async (): Promise<void> => {
    const profileCheck = checkProfile(birthYear, maxHr, year);
    const heightCheck = checkMeasure(height, HEIGHT_RANGE);
    const weightCheck = checkMeasure(weight, WEIGHT_RANGE);
    if (!profileCheck.ok || !heightCheck.ok || !weightCheck.ok) {
      setInvalid(true);
      return;
    }
    try {
      await updateProfile({ birthYear: profileCheck.birthYear, maxHeartRate: profileCheck.maxHeartRate });
      if (!(await updateUserData({ heightCm: heightCheck.value, weightKg: weightCheck.value, sex: sex === 'none' ? null : sex }))) return;
    } catch {
      return;
    }
    router.push('/onboarding/goals');
  };

  const touch = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setInvalid(false);
  };

  return (
    <OnboardingPage
      step={3}
      title={t('onboarding.body.title')}
      subtitle={t('onboarding.body.subtitle')}
      primary={{ label: t('common.continue'), onPress: () => void next() }}>
      <Field label={t('onboarding.body.height')} suffix="cm" value={height} onChangeText={touch(setHeight)} keyboardType="decimal-pad" maxLength={5} testID="height-input" />
      <Field label={t('onboarding.body.weight')} suffix="kg" value={weight} onChangeText={touch(setWeight)} keyboardType="decimal-pad" maxLength={5} testID="weight-input" />
      <Field label={t('settings.birthYear')} value={birthYear} onChangeText={touch(setBirthYear)} keyboardType="number-pad" maxLength={4} testID="birth-year-input" />
      <Field
        label={t('settings.maxHr')}
        value={maxHr}
        onChangeText={touch(setMaxHr)}
        keyboardType="number-pad"
        maxLength={3}
        hint={fallbackMaxHr === null ? t('settings.maxHrHintNoYear') : t('settings.maxHrHint', { value: fallbackMaxHr })}
        testID="max-hr-input"
      />
      <AppText variant="capSmall" muted>
        {t('onboarding.body.sex')}
      </AppText>
      <Segmented<SexChoice>
        value={sex}
        onChange={setSex}
        options={[
          { value: 'male', label: t('onboarding.body.male') },
          { value: 'female', label: t('onboarding.body.female') },
          { value: 'other', label: t('onboarding.body.other') },
          { value: 'none', label: t('onboarding.body.none') },
        ]}
      />
      <AppText variant="caption" muted>
        {t('onboarding.body.sexNote')}
      </AppText>
      {invalid ? (
        <AppText variant="label" color={colors.negative} testID="body-invalid">
          {t('onboarding.body.invalid')}
        </AppText>
      ) : null}
    </OnboardingPage>
  );
}
