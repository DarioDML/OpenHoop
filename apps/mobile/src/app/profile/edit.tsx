import { isZoneFloors, ZONE_EDGES_PERCENT, type ZoneFloors } from '@openhoop/analytics';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { parseDecimal, parseWholeNumber } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import {
  autoFloors,
  BIRTH_YEAR_MIN,
  birthDateOf,
  birthDateParts,
  MAX_HR_LIMITS,
  RESTING_HR_LIMITS,
  roundedFloors,
  zoneRanges,
  zoneReference,
  type ZoneReference,
} from '@/data/profile';
import type { Profile, Units, ZoneMode } from '@/data/types';
import { GOALS, type Goal, type Sex } from '@/data/userData';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { todayIsoDate } from '@/lib/dates';
import { heightIn, heightToCm, heightUnit, useUnits, weightIn, weightToKg, weightUnit } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { Field, Segmented } from '@/ui/controls';
import { CapHeader } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';

type SaveState = 'idle' | 'saved' | 'invalid' | 'zonesInvalid';
type SexChoice = Sex | 'unset';

const HEIGHT_CM = { min: 80, max: 250 } as const;
const WEIGHT_KG = { min: 25, max: 300 } as const;
const STEPS = { min: 1000, max: 50000 } as const;

function inRange(value: number | null, min: number, max: number): boolean {
  return value === null || (value >= min && value <= max);
}

function filled(text: string): boolean {
  return text.trim() !== '';
}

function heightText(cm: number | null, units: Units): string {
  return cm === null ? '' : String(Math.round(heightIn(cm, units)));
}

function weightText(kg: number | null, units: Units): string {
  if (kg === null) return '';
  return String(Math.round(weightIn(kg, units) * 10) / 10);
}

function unitLimits(units: Units): { height: { min: number; max: number }; weight: { min: number; max: number } } {
  return {
    height: { min: Math.ceil(heightIn(HEIGHT_CM.min, units)), max: Math.floor(heightIn(HEIGHT_CM.max, units)) },
    weight: { min: Math.ceil(weightIn(WEIGHT_KG.min, units)), max: Math.floor(weightIn(WEIGHT_KG.max, units)) },
  };
}

type BirthResult = { ok: true; birthYear: number | null; birthDate: string | null } | { ok: false };

function parseBirth(dayText: string, monthText: string, yearText: string, today: string): BirthResult {
  if (!filled(dayText) && !filled(monthText) && !filled(yearText)) return { ok: true, birthYear: null, birthDate: null };
  const year = parseWholeNumber(yearText);
  const currentYear = Number(today.slice(0, 4));
  if (year === null || year < BIRTH_YEAR_MIN || year > currentYear) return { ok: false };
  if (!filled(dayText) && !filled(monthText)) return { ok: true, birthYear: year, birthDate: null };
  const day = parseWholeNumber(dayText);
  const month = parseWholeNumber(monthText);
  if (day === null || month === null) return { ok: false };
  const date = birthDateOf(year, month, day, today);
  return date === null ? { ok: false } : { ok: true, birthYear: year, birthDate: date };
}

function parseFloors(texts: readonly string[]): ZoneFloors | null {
  const values = texts.map((text) => parseWholeNumber(text));
  if (values.some((v) => v === null)) return null;
  const numbers = values.filter((v): v is number => v !== null);
  return isZoneFloors(numbers) ? numbers : null;
}

function floorTexts(floors: ZoneFloors | null): string[] {
  return floors === null ? ['', '', '', '', ''] : roundedFloors(floors).map(String);
}

function sourceText(t: TFunction, reference: ZoneReference): { rest: string; max: string } {
  return {
    rest: t(`profile.zones.rest.${reference.restSource}`),
    max: t(`profile.zones.max.${reference.maxSource}`),
  };
}

export default function EditProfileScreen() {
  const { userData, profile, days, updateUserData, updateProfile } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const units = useUnits();
  const born = birthDateParts(profile.birthDate);
  const [name, setName] = useState(userData.name ?? '');
  const [sex, setSex] = useState<SexChoice>(userData.sex ?? 'unset');
  const [goals, setGoals] = useState<Goal[]>(userData.goals);
  const [height, setHeight] = useState(heightText(userData.heightCm, units));
  const [weight, setWeight] = useState(weightText(userData.weightKg, units));
  const [stepsGoal, setStepsGoal] = useState(userData.stepsGoal?.toString() ?? '');
  const [birthDay, setBirthDay] = useState(born ? String(born.day) : '');
  const [birthMonth, setBirthMonth] = useState(born ? String(born.month) : '');
  const [birthYear, setBirthYear] = useState(profile.birthYear?.toString() ?? '');
  const [maxHr, setMaxHr] = useState(profile.maxHeartRate?.toString() ?? '');
  const [restHr, setRestHr] = useState(profile.restingHeartRate?.toString() ?? '');
  const [zoneMode, setZoneMode] = useState<ZoneMode>(profile.zoneMode ?? 'auto');
  const [floors, setFloors] = useState<string[]>(floorTexts(profile.zoneFloors ?? null));
  const [state, setState] = useState<SaveState>('idle');
  const touch = <T,>(set: (value: T) => void) => (value: T): void => {
    set(value);
    setState('idle');
  };

  const today = todayIsoDate();
  const nowS = Math.floor(Date.now() / 1000);
  const birth = parseBirth(birthDay, birthMonth, birthYear, today);
  const typedMax = parseWholeNumber(maxHr);
  const typedRest = parseWholeNumber(restHr);
  const draft: Profile = {
    ...profile,
    birthYear: birth.ok ? birth.birthYear : profile.birthYear,
    birthDate: birth.ok ? birth.birthDate : (profile.birthDate ?? null),
    maxHeartRate: typedMax !== null && inRange(typedMax, MAX_HR_LIMITS.min, MAX_HR_LIMITS.max) ? typedMax : null,
    restingHeartRate: typedRest !== null && inRange(typedRest, RESTING_HR_LIMITS.min, RESTING_HR_LIMITS.max) ? typedRest : null,
  };
  const reference = zoneReference(days, draft, nowS);
  const auto = autoFloors(reference);
  const custom = parseFloors(floors);
  const shownFloors = zoneMode === 'custom' ? custom : auto;
  const ranges = shownFloors === null ? null : zoneRanges(shownFloors, reference.max);
  const limits = unitLimits(units);
  const sources = sourceText(t, reference);
  const defaultMax = Math.round(reference.max);

  const chooseMode = (mode: ZoneMode): void => {
    if (mode === 'custom' && parseFloors(floors) === null && auto !== null) setFloors(floorTexts(auto));
    setZoneMode(mode);
    setState('idle');
  };

  const toggleGoal = (goal: Goal): void => {
    setGoals((current) => (current.includes(goal) ? current.filter((g) => g !== goal) : [...current, goal]));
    setState('idle');
  };

  const save = async (): Promise<void> => {
    const metric = units === 'metric';
    const heightValue = filled(height) ? (metric ? parseWholeNumber(height) : parseDecimal(height)) : null;
    const weightValue = filled(weight) ? parseDecimal(weight) : null;
    const heightCm = height === heightText(userData.heightCm, units) ? userData.heightCm : heightValue === null ? null : Math.round(heightToCm(heightValue, units));
    const weightKg = weight === weightText(userData.weightKg, units) ? userData.weightKg : weightValue === null ? null : Math.round(weightToKg(weightValue, units) * 100) / 100;
    const goal = filled(stepsGoal) ? parseWholeNumber(stepsGoal) : null;
    const hr = filled(maxHr) ? parseWholeNumber(maxHr) : null;
    const rest = filled(restHr) ? parseWholeNumber(restHr) : null;
    const valid =
      birth.ok &&
      (!filled(height) || heightValue !== null) &&
      (!filled(weight) || weightValue !== null) &&
      (!filled(stepsGoal) || goal !== null) &&
      (!filled(maxHr) || hr !== null) &&
      (!filled(restHr) || rest !== null) &&
      inRange(heightCm, HEIGHT_CM.min, HEIGHT_CM.max) &&
      inRange(weightKg, WEIGHT_KG.min, WEIGHT_KG.max) &&
      inRange(goal, STEPS.min, STEPS.max) &&
      inRange(hr, MAX_HR_LIMITS.min, MAX_HR_LIMITS.max) &&
      inRange(rest, RESTING_HR_LIMITS.min, RESTING_HR_LIMITS.max) &&
      (hr === null || rest === null || hr > rest);
    if (!valid) {
      setState('invalid');
      return;
    }
    if (zoneMode === 'custom' && (custom === null || custom[4] >= reference.max)) {
      setState('zonesInvalid');
      return;
    }
    const trimmed = name.trim().slice(0, 40);
    try {
      const stored = await updateUserData({ name: trimmed === '' ? null : trimmed, heightCm, weightKg, sex: sex === 'unset' ? null : sex, stepsGoal: goal, goals });
      if (!stored) {
        setState('idle');
        return;
      }
      await updateProfile({
        birthYear: birth.birthYear,
        birthDate: birth.birthDate,
        maxHeartRate: hr,
        restingHeartRate: rest,
        zoneMode,
        zoneFloors: zoneMode === 'custom' ? custom : (profile.zoneFloors ?? null),
      });
    } catch {
      setState('idle');
      return;
    }
    setState('saved');
  };

  const pair = (left: ReactNode, right: ReactNode) => (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
    </View>
  );

  return (
    <Screen
      tint="community"
      testID="edit-profile"
      header={<TopBar title={t('profile.edit')} right={<IconButton icon="check" label={t('common.save')} onPress={() => void save()} testID="profile-save" />} />}>
      <CapHeader title={t('profile.about')} />
      <Card style={{ gap: spacing.lg }}>
        <Field label={t('profile.name')} value={name} onChangeText={touch(setName)} maxLength={40} testID="profile-name-input" />
        <View style={{ gap: spacing.sm }}>
          <AppText variant="capSmall" muted>
            {t('profile.sex')}
          </AppText>
          <Segmented<SexChoice>
            testID="profile-sex"
            value={sex}
            onChange={touch(setSex)}
            options={[
              { value: 'female', label: t('profile.sex.female') },
              { value: 'male', label: t('profile.sex.male') },
              { value: 'other', label: t('profile.sex.other') },
            ]}
          />
        </View>
        <View style={{ gap: spacing.sm }}>
          <AppText variant="capSmall" muted>
            {t('profile.goals')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {GOALS.map((goal) => (
              <Pill key={goal} label={t(`profile.goal.${goal}`)} selected={goals.includes(goal)} onPress={() => toggleGoal(goal)} testID={`profile-goal-${goal}`} />
            ))}
          </View>
        </View>
      </Card>

      <CapHeader title={t('profile.body')} />
      {pair(
        <Field label={t('profile.height')} suffix={heightUnit(units)} value={height} onChangeText={touch(setHeight)} keyboardType={units === 'metric' ? 'number-pad' : 'decimal-pad'} maxLength={5} testID="profile-height-input" />,
        <Field label={t('profile.weight')} suffix={weightUnit(units)} value={weight} onChangeText={touch(setWeight)} keyboardType="decimal-pad" maxLength={6} testID="profile-weight-input" />,
      )}
      <Field label={t('profile.stepsGoal')} value={stepsGoal} onChangeText={touch(setStepsGoal)} keyboardType="number-pad" maxLength={5} hint={t('profile.stepsGoalHint')} testID="profile-steps-input" />

      <CapHeader title={t('profile.birthDate')} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field label={t('profile.birth.day')} value={birthDay} onChangeText={touch(setBirthDay)} keyboardType="number-pad" maxLength={2} testID="profile-birth-day" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('profile.birth.month')} value={birthMonth} onChangeText={touch(setBirthMonth)} keyboardType="number-pad" maxLength={2} testID="profile-birth-month" />
        </View>
        <View style={{ flex: 1.4 }}>
          <Field label={t('profile.birth.year')} value={birthYear} onChangeText={touch(setBirthYear)} keyboardType="number-pad" maxLength={4} testID="profile-birth-input" />
        </View>
      </View>
      <AppText variant="caption" muted>
        {t('profile.birth.hint')}
      </AppText>

      <CapHeader title={t('profile.zones.title')} />
      {pair(
        <Field
          label={t('profile.zones.maxHr')}
          suffix={t('unit.bpm')}
          value={maxHr}
          onChangeText={touch(setMaxHr)}
          keyboardType="number-pad"
          maxLength={3}
          placeholder={String(defaultMax)}
          testID="profile-maxhr-input"
        />,
        <Field
          label={t('profile.zones.restingHr')}
          suffix={t('unit.bpm')}
          value={restHr}
          onChangeText={touch(setRestHr)}
          keyboardType="number-pad"
          maxLength={3}
          placeholder={reference.measuredRest === null ? undefined : String(Math.round(reference.measuredRest))}
          testID="profile-resthr-input"
        />,
      )}
      <AppText variant="caption" muted testID="profile-hr-sources">
        {t('profile.zones.sources', { max: defaultMax, maxSource: sources.max, rest: Math.round(reference.rest), restSource: sources.rest })}
      </AppText>
      <Segmented<ZoneMode>
        testID="zone-mode"
        value={zoneMode}
        onChange={chooseMode}
        options={[
          { value: 'auto', label: t('profile.zones.auto') },
          { value: 'custom', label: t('profile.zones.custom') },
        ]}
      />
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 4, paddingHorizontal: spacing.lg }} testID="zone-table">
        {([4, 3, 2, 1, 0] as const).map((i, row) => {
          const range = ranges?.[i] ?? null;
          const zone = i + 1;
          const low = ZONE_EDGES_PERCENT[i];
          const high = ZONE_EDGES_PERCENT[i + 1] ?? 100;
          return (
            <View
              key={zone}
              testID={`zone-row-${zone}`}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, paddingVertical: spacing.sm }, row < 4 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null]}>
              <View style={{ width: 12, height: 28, borderRadius: 4, backgroundColor: colors.zones[i] }} />
              <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                <AppText variant="body" style={{ fontWeight: '500' }}>
                  {t('profile.zones.zone', { zone })}
                </AppText>
                <AppText variant="label" muted>
                  {zoneMode === 'auto' ? t('profile.zones.hrr', { low, high }) : t('profile.zones.startsAt')}
                </AppText>
              </View>
              {zoneMode === 'custom' ? (
                <View style={{ width: 96 }}>
                  <Field
                    label={t('profile.zones.floorLabel', { zone })}
                    value={floors[i] ?? ''}
                    onChangeText={(text) => {
                      setFloors((current) => current.map((v, k) => (k === i ? text : v)));
                      setState('idle');
                    }}
                    keyboardType="number-pad"
                    maxLength={3}
                    suffix={t('unit.bpm')}
                    testID={`zone-floor-${zone}`}
                  />
                </View>
              ) : null}
              {range !== null ? (
                <Num size={20} unit={t('unit.bpm')} unitSize={9} unitColor={colors.textMuted} testID={`zone-range-${zone}`}>
                  {range.high === null ? `${range.low}+` : `${range.low}–${range.high}`}
                </Num>
              ) : (
                <AppText variant="label" muted testID={`zone-range-${zone}`}>
                  {t('profile.zones.noRange')}
                </AppText>
              )}
            </View>
          );
        })}
      </View>
      <AppText variant="caption" muted testID="zone-note">
        {zoneMode === 'auto' ? t('profile.zones.noteAuto') : t('profile.zones.noteCustom')}
      </AppText>
      {state === 'invalid' ? (
        <AppText variant="label" color={colors.negative} testID="profile-invalid">
          {t('profile.invalidUnits', {
            heightMin: limits.height.min,
            heightMax: limits.height.max,
            heightUnit: heightUnit(units),
            weightMin: limits.weight.min,
            weightMax: limits.weight.max,
            weightUnit: weightUnit(units),
          })}
        </AppText>
      ) : null}
      {state === 'zonesInvalid' ? (
        <AppText variant="label" color={colors.negative} testID="profile-zones-invalid">
          {t('profile.zones.invalid')}
        </AppText>
      ) : null}
      {state === 'saved' ? (
        <AppText variant="label" color={colors.positive} testID="profile-saved" accessibilityLiveRegion="polite">
          {t('common.saved')}
        </AppText>
      ) : null}
    </Screen>
  );
}
