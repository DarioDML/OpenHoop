import { LOAD_DAY_MIN } from '@/data/activityDerived';
import type { Language } from '@/data/types';
import type { PlanGoal, WeeklyPlan } from '@/data/weeklyPlan';
import type { TFunction } from '@/i18n/useT';
import type { IconName } from '@/ui/Icon';
import type { ColorTokens } from '@/ui/theme';

export const GOAL_ICON: Readonly<Record<PlanGoal, IconName>> = { loadDays: 'load', sleepScore: 'moon', strength: 'dumbbell', steps: 'steps' };

export function goalColors(colors: ColorTokens, goal: PlanGoal): { fg: string; bg: string } {
  return goal === 'sleepScore' ? { fg: colors.purple, bg: colors.purpleSoft } : { fg: colors.accent, bg: colors.accentSoft };
}

export function goalTarget(t: TFunction, plan: WeeklyPlan, goal: PlanGoal, fmt: (value: number) => string): string {
  if (goal === 'loadDays') return t('plan.goal.loadDays.target', { count: plan.loadDays, threshold: LOAD_DAY_MIN });
  if (goal === 'sleepScore') return t('plan.goal.sleepScore.target', { min: plan.sleepScoreMin, count: plan.sleepNights });
  if (goal === 'strength') return t('plan.goal.strength.target', { minutes: plan.strengthMinutes });
  return t('plan.goal.steps.target', { steps: fmt(plan.steps) });
}

function utcDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function formatDayRange(start: string, end: string, language: Language): string {
  const locale = language === 'nl' ? 'nl-NL' : 'en-GB';
  const a = utcDate(start);
  const b = utcDate(end);
  const month = (date: Date): string => date.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${b.getUTCDate()} ${month(b)}`;
  return `${a.getUTCDate()} ${month(a)} – ${b.getUTCDate()} ${month(b)}`;
}
