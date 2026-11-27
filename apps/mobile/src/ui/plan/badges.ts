import type { Achievement, AchievementGroup } from '@/data/activityDerived';
import type { TFunction } from '@/i18n/useT';
import type { IconName } from '@/ui/Icon';

export const BADGE_ICON: Readonly<Record<AchievementGroup, IconName>> = {
  streak: 'flame',
  nights: 'moon',
  workouts: 'pulse',
  steps10k: 'steps',
  highLoad: 'load',
  readyStreak: 'heart',
};

export function badgeName(t: TFunction, a: Achievement): string {
  return a.target === 1 ? t(`profile.badge.${a.group}.one`) : t(`profile.badge.${a.group}.other`, { count: a.target });
}

export function badgeDescription(t: TFunction, a: Achievement): string {
  return t(`profile.ach.${a.group}`, { count: a.target });
}

export function badgePoints(t: TFunction, a: Achievement): string {
  return a.tier === 1 ? t('profile.badge.points.one') : t('profile.badge.points.other', { points: a.tier });
}
