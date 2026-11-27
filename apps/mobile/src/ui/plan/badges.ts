import { HIGH_LOAD_MIN, HIGH_READINESS_MIN, STEPS_BADGE_MIN, type Achievement, type AchievementGroup } from '@/data/activityDerived';
import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import type { IconName } from '@/ui/Icon';

export const BADGE_ICON: Readonly<Record<AchievementGroup, IconName>> = {
  streak: 'flame',
  nights: 'moon',
  workouts: 'pulse',
  steps10k: 'steps',
  highLoad: 'load',
  readyStreak: 'heart',
};

function thresholds(language: Language): { steps: string; stepsShort: string; load: number; readiness: number } {
  return {
    steps: formatNumber(STEPS_BADGE_MIN, 0, language),
    stepsShort: `${formatNumber(STEPS_BADGE_MIN / 1000, 0, language)}K`,
    load: HIGH_LOAD_MIN,
    readiness: HIGH_READINESS_MIN,
  };
}

export function badgeName(t: TFunction, a: Achievement, language: Language): string {
  const params = { count: a.target, ...thresholds(language) };
  return a.target === 1 ? t(`profile.badge.${a.group}.one`, params) : t(`profile.badge.${a.group}.other`, params);
}

export function badgeDescription(t: TFunction, a: Achievement, language: Language): string {
  return t(`profile.ach.${a.group}`, { count: a.target, ...thresholds(language) });
}

export function badgePoints(t: TFunction, a: Achievement): string {
  return a.tier === 1 ? t('profile.badge.points.one') : t('profile.badge.points.other', { points: a.tier });
}
