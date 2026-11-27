import { router } from 'expo-router';
import { View } from 'react-native';

import { achievements, effectiveMaxHr, formatMonthYear, levelOf, LOAD_DAY_MIN, lifetimeStats } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { wearStreak } from '@/data/derived';
import { bodyAgeSummary, SLEEP_STREAK_MIN, streaks, type BodyAgeSummary } from '@/data/profileSummary';
import type { Language } from '@/data/types';
import { initialOf } from '@/data/userData';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { formatHeight, formatWeight, useUnits } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { Chip, type ChipTone } from '@/ui/Chip';
import { MetricName } from '@/ui/explain/MetricName';
import { HexBadge } from '@/ui/HexBadge';
import { Icon, type IconName } from '@/ui/Icon';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { GridTile, StatGrid } from '@/ui/StatGrid';
import { radius, spacing, useTheme } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';

function compact(value: number, language: Language): string {
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 1, language)}M`;
  if (value >= 10_000) return `${formatNumber(Math.round(value / 1000), 0, language)}k`;
  return formatNumber(value, 0, language);
}

function bodyAgeChip(t: TFunction, summary: BodyAgeSummary, language: Language): { label: string; tone: ChipTone } | null {
  if (summary.kind !== 'value' || summary.bound !== 'exact' || summary.ageYears === null) return null;
  const diff = summary.ageYears - summary.value;
  if (Math.abs(diff) < 0.05) return { label: t('profile.bodyAge.same'), tone: 'neutral' };
  const years = formatNumber(Math.abs(diff), 1, language);
  return diff > 0 ? { label: t('profile.bodyAge.younger', { years }), tone: 'positive' } : { label: t('profile.bodyAge.older', { years }), tone: 'warning' };
}

function bodyAgeValue(summary: BodyAgeSummary, language: Language): string | null {
  if (summary.kind !== 'value') return null;
  const value = formatNumber(summary.value, 1, language);
  return summary.bound === 'below' ? `<${value}` : summary.bound === 'above' ? `>${value}` : value;
}

function birthDateText(date: string, language: Language): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function ProfileScreen() {
  const { days, userData, profile, device, labResults } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const units = useUnits();
  const initial = initialOf(userData.name);
  const stats = lifetimeStats(days);
  const list = achievements(days);
  const level = levelOf(list);
  const runs = streaks(days);
  const bodyAge = bodyAgeSummary(days, labResults, profile, userData.sex);
  const fmt = (v: number): string => formatNumber(v, 0, language);
  const none = t('profile.notSet');
  const since = stats.memberSince ? t('profile.since', { month: formatMonthYear(stats.memberSince, language) }) : null;
  const band = device.model ? t('profile.band', { model: device.model }) : null;
  const subtitle = [since, band].filter((part): part is string => part !== null).join(' · ');
  const height = userData.heightCm === null ? null : formatHeight(userData.heightCm, units, language);
  const weight = userData.weightKg === null ? null : formatWeight(userData.weightKg, units, language);
  const year = new Date().getFullYear();
  const lastIndex = Math.max(0, days.length - 1);

  const streakRow = (icon: IconName, color: string, label: string, value: number, testID: string) => (
    <ListRow
      key={testID}
      title={label}
      leading={<Icon name={icon} color={color} size={22} />}
      right={
        <Num size={24} testID={`${testID}-value`}>
          {fmt(value)}
        </Num>
      }
      testID={testID}
    />
  );

  return (
    <Screen
      tint="community"
      testID="profile-screen"
      header={
        <>
          <TopBar title={t('profile.title')} right={<IconButton icon="edit" label={t('profile.edit')} onPress={() => router.push('/profile/edit')} testID="profile-edit" />} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <View style={{ width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
              {initial ? (
                <AppText variant="h2" testID="profile-initial">
                  {initial}
                </AppText>
              ) : (
                <Icon name="user" color={colors.textSoft} size={32} />
              )}
            </View>
            <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
              <AppText variant="title" testID="profile-name">
                {userData.name ?? t('profile.noName')}
              </AppText>
              {subtitle !== '' ? (
                <AppText variant="label" soft testID="profile-since">
                  {subtitle}
                </AppText>
              ) : null}
            </View>
            <HexBadge earned accessibilityLabel={t('profile.level.label', { level: level.level })} testID="profile-level-badge">
              <Num size={22} color={colors.gold}>
                {String(level.level)}
              </Num>
            </HexBadge>
          </View>
        </>
      }>
      <StatGrid>
        <GridTile
          label={t('profile.bodyAge.title')}
          value={bodyAgeValue(bodyAge, language)}
          missing={bodyAge.kind === 'missing' ? t(`profile.bodyAge.missing.${bodyAge.reason}`) : undefined}
          chip={bodyAgeChip(t, bodyAge, language)}
          caption={bodyAge.kind === 'value' ? t(`profile.bodyAge.source.${bodyAge.source}`) : undefined}
          href="/health/body-age"
          testID="profile-body-age"
        />
        <GridTile
          label={t('profile.level.title')}
          value={String(level.level)}
          chip={{ label: level.toNext === null ? t('profile.level.top') : level.toNext === 1 ? t('profile.level.toNext.one', { next: level.level + 1 }) : t('profile.level.toNext.other', { points: level.toNext, next: level.level + 1 }), tone: 'gold' }}
          caption={t('profile.level.points', { points: level.points, max: level.maxPoints, unlocked: level.unlocked, total: level.total })}
          header={<MetricName target={{ term: 'level', index: lastIndex, shown: { value: String(level.level), unit: null, reason: null } }} testID="profile-level-name" />}
          testID="profile-level"
        />
      </StatGrid>

      <CapHeader title={t('profile.streaks.title')} />
      <ListGroup>
        {streakRow('flame', colors.metric.streak, t('profile.streak.load', { threshold: LOAD_DAY_MIN }), runs.loadDays, 'streak-load')}
        {streakRow('flame', colors.metric.readinessHigh, t('profile.streak.readiness'), runs.highReadiness, 'streak-readiness')}
        {streakRow('flame', colors.purple, t('profile.streak.sleep', { min: SLEEP_STREAK_MIN }), runs.sleepScore, 'streak-sleep')}
        {streakRow('band', colors.textMuted, t('profile.streak.data'), wearStreak(days), 'profile-streak')}
      </ListGroup>
      <AppText variant="caption" muted>
        {t('profile.streaks.note')}
      </AppText>

      <CapHeader title={t('profile.lifetime')} />
      <StatGrid>
        <GridTile label={t('profile.nights')} value={fmt(stats.nights)} testID="life-nights" />
        <GridTile label={t('profile.workouts')} value={fmt(stats.workouts)} testID="life-workouts" />
        <GridTile label={t('metric.steps')} value={compact(stats.steps, language)} accessibilityLabel={`${t('metric.steps')} ${fmt(stats.steps)}`} testID="life-steps" />
        <GridTile
          label={t('profile.hoursWorn')}
          value={stats.wornS === null ? null : fmt(Math.round(stats.wornS / 3600))}
          missing={t('profile.hoursWornMissing')}
          header={<MetricName target={{ term: 'wearTime', index: lastIndex, shown: null }} label={t('profile.hoursWorn')} testID="life-worn-name" />}
          testID="life-worn"
        />
      </StatGrid>
      <AppText variant="caption" muted>
        {t('profile.lifetimeNote', { days: stats.daysTracked })}
      </AppText>

      <ListGroup>
        <ListRow
          title={t('profile.achievements')}
          subtitle={t('profile.achievementsUnlocked', { unlocked: level.unlocked, total: level.total })}
          href="/profile/achievements"
          icon={{ icon: 'trophy', color: colors.gold, background: colors.goldSoft }}
          testID="profile-achievements"
        />
      </ListGroup>

      <ListGroup title={t('profile.body')}>
        <ListRow title={t('profile.height')} value={height === null ? none : `${height.value} ${height.unit}`.trim()} href="/profile/edit" testID="profile-row-height" />
        <ListRow title={t('profile.weight')} value={weight === null ? none : `${weight.value} ${weight.unit}`} href="/profile/edit" testID="profile-row-weight" />
        <ListRow title={t('profile.sex')} value={userData.sex === null ? none : t(`profile.sex.${userData.sex}`)} href="/profile/edit" />
        <ListRow
          title={t('profile.birthDate')}
          value={profile.birthDate ? birthDateText(profile.birthDate, language) : profile.birthYear === null ? none : String(profile.birthYear)}
          href="/profile/edit"
          testID="profile-row-birth"
        />
        <ListRow
          title={t('profile.maxHr')}
          value={
            profile.maxHeartRate !== null
              ? `${profile.maxHeartRate} ${t('unit.bpm')}`
              : profile.birthYear !== null
                ? t('profile.maxHrFromAge', { value: Math.round(effectiveMaxHr(profile, year)) })
                : none
          }
          href="/profile/edit"
        />
        <ListRow
          title={t('profile.restingHr')}
          value={profile.restingHeartRate ? `${profile.restingHeartRate} ${t('unit.bpm')}` : t('profile.restingHrMeasured')}
          href="/profile/edit"
          testID="profile-row-rest"
        />
        <ListRow title={t('profile.zones.title')} value={profile.zoneMode === 'custom' ? t('profile.zones.custom') : t('profile.zones.auto')} href="/profile/edit" testID="profile-row-zones" />
        <ListRow title={t('profile.stepsGoal')} value={userData.stepsGoal === null ? none : fmt(userData.stepsGoal)} href="/profile/edit" />
      </ListGroup>

      <Section title={t('profile.goals')}>
        {userData.goals.length === 0 ? (
          <AppText variant="body" muted testID="profile-no-goals">
            {t('profile.noGoals')}
          </AppText>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {userData.goals.map((goal) => (
              <Chip key={goal} tone="info" label={t(`profile.goal.${goal}`)} />
            ))}
          </View>
        )}
      </Section>

    </Screen>
  );
}
