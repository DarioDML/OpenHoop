import { View } from 'react-native';

import { achievements, formatMonthYear, lifetimeStats } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { wearStreak } from '@/data/derived';
import { initialOf } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

export default function ProfileScreen() {
  const { days, userData, profile } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const initial = initialOf(userData.name);
  const stats = lifetimeStats(days);
  const streak = wearStreak(days);
  const list = achievements(days);
  const unlocked = list.filter((a) => a.unlocked).length;
  const fmt = (v: number): string => formatNumber(v, 0, language);
  const none = t('profile.notSet');

  return (
    <Screen
      tint="neutral"
      testID="profile-screen"
      header={
        <>
          <TopBar title={t('profile.title')} />
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 88, height: 88, borderRadius: radius.pill, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              {initial ? (
                <AppText variant="h1" color={colors.accent} testID="profile-initial">
                  {initial}
                </AppText>
              ) : (
                <Icon name="user" color={colors.accent} size={40} />
              )}
            </View>
            <AppText variant="h2" testID="profile-name">
              {userData.name ?? t('profile.noName')}
            </AppText>
            {stats.memberSince ? (
              <AppText variant="label" soft testID="profile-since">
                {t('profile.since', { month: formatMonthYear(stats.memberSince, language) })}
              </AppText>
            ) : null}
          </View>
        </>
      }>
      <ListGroup title={t('profile.body')}>
        <ListRow title={t('profile.height')} value={userData.heightCm === null ? none : `${fmt(userData.heightCm)} cm`} href="/profile/edit" />
        <ListRow title={t('profile.weight')} value={userData.weightKg === null ? none : `${formatNumber(userData.weightKg, 1, language)} kg`} href="/profile/edit" />
        <ListRow title={t('profile.sex')} value={userData.sex === null ? none : t(`profile.sex.${userData.sex}`)} href="/profile/edit" />
        <ListRow title={t('profile.birthYear')} value={profile.birthYear === null ? none : String(profile.birthYear)} href="/profile/edit" />
        <ListRow title={t('profile.maxHr')} value={profile.maxHeartRate === null ? none : `${profile.maxHeartRate} ${t('unit.bpm')}`} href="/profile/edit" />
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

      <Section title={t('profile.streaks')}>
        <Card>
          <AppText variant="body" testID="profile-streak">
            {t('profile.streak', { count: streak })}
          </AppText>
        </Card>
      </Section>

      <Section title={t('profile.lifetime')}>
        <StatRow>
          <StatTile label={t('profile.nights')} value={fmt(stats.nights)} testID="life-nights" />
          <StatTile label={t('profile.workouts')} value={fmt(stats.workouts)} testID="life-workouts" />
          <StatTile label={t('metric.steps')} value={fmt(stats.steps)} testID="life-steps" />
        </StatRow>
        <AppText variant="caption" muted>
          {t('profile.lifetimeNote', { days: stats.daysTracked })}
        </AppText>
      </Section>

      <ListGroup>
        <ListRow
          title={t('profile.achievements')}
          value={t('profile.achievementsCount', { unlocked, total: list.length })}
          href="/profile/achievements"
          icon={{ icon: 'trophy', color: colors.accent, background: colors.accentSoft }}
          testID="profile-achievements"
        />
        <ListRow title={t('profile.edit')} href="/profile/edit" icon={{ icon: 'edit', color: colors.accent, background: colors.accentSoft }} testID="profile-edit" />
      </ListGroup>
    </Screen>
  );
}
