import type { Achievement } from '@/data/activityDerived';
import { defaultPlan } from '@/data/weeklyPlan';
import { translate, type TranslationKey, type TranslationParams } from '@/i18n';
import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';
import { badgeDescription } from '@/ui/plan/badges';
import { goalTarget, weekProgressText } from '@/ui/plan/goals';
import { tooFewText } from '@/ui/plan/reportParts';

function tr(language: Language): TFunction {
  return (key: TranslationKey, params?: TranslationParams) => translate(language, key, params);
}

const en = tr('en');
const nl = tr('nl');
const fmt = (v: number): string => String(v);

function badge(group: Achievement['group'], target: number): Achievement {
  return { id: `${group}-${target}`, group, tier: 1, target, current: 0, unlocked: false };
}

describe('plan and profile plurals', () => {
  it('says how many days are left in the plan week', () => {
    expect(weekProgressText(en, 6, 1)).toBe('Day 6 of 7 · 1 day left');
    expect(weekProgressText(en, 3, 4)).toBe('Day 3 of 7 · 4 days left');
    expect(weekProgressText(en, 7, 0)).toBe('Day 7 of 7 · last day');
    expect(weekProgressText(nl, 6, 1)).toBe('Dag 6 van 7 · nog 1 dag');
    expect(weekProgressText(nl, 7, 0)).toBe('Dag 7 van 7 · laatste dag');
  });

  it('uses the singular for a one-day or one-night target', () => {
    const plan = { ...defaultPlan(null), loadDays: 1, sleepNights: 1 };
    expect(goalTarget(en, plan, 'loadDays', fmt)).toBe('1 day with a load of 7 or more');
    expect(goalTarget(en, plan, 'sleepScore', fmt)).toBe(`${plan.sleepScoreMin}% or higher, 1 night`);
    expect(goalTarget(nl, { ...plan, loadDays: 3 }, 'loadDays', fmt)).toBe('3 dagen met een belasting van 7 of meer');
  });

  it('describes first-tier badges in the singular', () => {
    expect(badgeDescription(en, badge('workouts', 1), 'en')).toBe('1 workout recorded');
    expect(badgeDescription(en, badge('workouts', 10), 'en')).toBe('10 workouts recorded');
    expect(badgeDescription(nl, badge('nights', 1), 'nl')).toBe('1 nacht slaap vastgelegd');
  });

  it('says a report has only one day of data', () => {
    expect(tooFewText(en, 1)).toBe('There is only 1 day of data in this period. A report needs at least 3.');
    expect(tooFewText(en, 2)).toBe('There are only 2 days of data in this period. A report needs at least 3.');
  });
});
