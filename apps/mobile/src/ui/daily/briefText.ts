import type { DayRecord } from '@openhoop/core';

import { loadTargetBand } from '@/data/activityDerived';
import { addDays, baselineAt, percentFromBaseline, rangeStatus, visibleReadiness } from '@/data/derived';
import { isWatchedHabit } from '@/data/eveningReview';
import { compareBehaviour } from '@/data/healthDerived';
import { activeQuestions } from '@/data/journalQuestions';
import type { JournalAnswer } from '@/data/userData';
import type { TranslationKey } from '@/i18n';
import { readinessNightsLeft } from '@/data/progress';
import { formatHm, formatMinutes, planBedtime } from '@/data/dailyDerived';
import type { TFunction } from '@/i18n/useT';
import { readinessBand } from '@/ui/theme';
import { formatDuration, formatNumber } from '@/lib/format';
import type { Language } from '@/data/types';

export interface BriefLine {
  id: string;
  text: string;
}

export interface Bedtime {
  bed: string;
  wake: string;
  need: string;
}

export function tonightBedtime(days: readonly DayRecord[], index: number): Bedtime | null {
  const day = days[index];
  const need = day?.sleep.need.value ?? null;
  if (!day || need === null) return null;
  const plan = planBedtime(days, index, need);
  if (!plan) return null;
  return { bed: formatMinutes(plan.bedMinutes), wake: formatMinutes(plan.wakeMinutes), need: formatHm(need) };
}

export function briefLines(t: TFunction, language: Language, days: readonly DayRecord[], index: number): BriefLine[] {
  const day = days[index];
  if (!day) return [];
  const lines: BriefLine[] = [];

  const readiness = visibleReadiness(day).value;
  const band = readinessBand(readiness);
  const nightsLeft = readinessNightsLeft(days, index);
  if (readiness !== null && band !== null) {
    lines.push({ id: 'readiness', text: t('brief.readiness', { band: t(`readiness.${band}`), value: Math.round(readiness) }) });
  } else if (nightsLeft !== null) {
    lines.push({ id: 'readiness', text: nightsLeft === 1 ? t('brief.readinessHiddenOne') : t('brief.readinessHidden', { count: nightsLeft }) });
  }

  const hrv = day.hrv.value;
  if (hrv !== null) {
    const baseline = baselineAt(days, index, 'hrv');
    const status = rangeStatus(hrv, baseline);
    const pct = percentFromBaseline(hrv, baseline);
    const value = formatNumber(hrv, 0, language);
    if (baseline && status && pct !== null) {
      lines.push({
        id: 'hrv',
        text: t(`brief.hrv.${status}`, {
          value,
          pct: Math.abs(Math.round(pct)),
          low: formatNumber(baseline.low, 0, language),
          high: formatNumber(baseline.high, 0, language),
        }),
      });
    } else {
      lines.push({ id: 'hrv', text: t('brief.hrv.nobaseline', { value }) });
    }
  }

  const asleep = day.sleep.asleepS;
  if (asleep !== null) {
    const need = day.sleep.need.value;
    lines.push({
      id: 'sleep',
      text: need === null ? t('brief.sleepOnly', { asleep: formatDuration(t, asleep) }) : t('brief.sleep', { asleep: formatDuration(t, asleep), need: formatDuration(t, need) }),
    });
  }

  const debt = day.sleep.debt.value;
  if (debt !== null && debt >= 15 * 60) lines.push({ id: 'debt', text: t('brief.debt', { debt: formatDuration(t, debt) }) });

  const bedtime = tonightBedtime(days, index);
  if (bedtime) lines.push({ id: 'bedtime', text: t('brief.bedtime', { bed: bedtime.bed, wake: bedtime.wake, need: bedtime.need }) });

  return lines;
}

export type PlanTone = 'info' | 'purple' | 'warning' | 'positive' | 'neutral';

export interface PlanItem {
  id: string;
  title: string;
  reason: string;
  pill: { label: string; tone: PlanTone } | null;
}

export const BEHAVIOUR_MIN_DROP_PCT = 3;

export interface BehaviourLink {
  questionId: string;
  labelKey: TranslationKey;
  deltaPct: number;
  nWith: number;
  nWithout: number;
}

export const HABIT_RECENT_DAYS = 2;

export function loggedRecently(journal: Record<string, Record<string, JournalAnswer>>, questionId: string, today: string): boolean {
  for (let back = 0; back < HABIT_RECENT_DAYS; back++) {
    const answer = journal[addDays(today, -back)]?.[questionId];
    if (answer === true || (typeof answer === 'number' && answer > 0)) return true;
  }
  return false;
}

export function worstBehaviour(
  days: readonly DayRecord[],
  journal: Record<string, Record<string, JournalAnswer>>,
  selected: readonly string[] | null,
  today: string,
): BehaviourLink | null {
  let worst: BehaviourLink | null = null;
  for (const question of activeQuestions(selected)) {
    if (!isWatchedHabit(question.id) || !loggedRecently(journal, question.id, today)) continue;
    const result = compareBehaviour(days, journal, question.id, 'readiness');
    if (!result.enough || result.deltaPct === null || result.deltaPct > -BEHAVIOUR_MIN_DROP_PCT) continue;
    if (worst === null || result.deltaPct < worst.deltaPct) {
      worst = { questionId: question.id, labelKey: question.labelKey, deltaPct: result.deltaPct, nWith: result.nWith, nWithout: result.nWithout };
    }
  }
  return worst;
}

function readinessTitle(t: TFunction, band: 'high' | 'medium' | 'low' | null): string {
  if (band === 'high') return t('brief.plan.high');
  if (band === 'low') return t('brief.plan.low');
  if (band === 'medium') return t('brief.plan.medium');
  return t('brief.plan.calibrating');
}

export function morningPlan(
  t: TFunction,
  language: Language,
  days: readonly DayRecord[],
  index: number,
  journal: Record<string, Record<string, JournalAnswer>>,
  selectedQuestions: readonly string[] | null,
  targetsHidden = false,
): PlanItem[] {
  const day = days[index];
  if (!day) return [];
  const lines = briefLines(t, language, days, index);
  const text = (id: string): string | null => lines.find((line) => line.id === id)?.text ?? null;
  const items: PlanItem[] = [];

  const readinessText = text('readiness');
  const hrvText = text('hrv');
  if (readinessText !== null || hrvText !== null) {
    const readiness = visibleReadiness(day).value;
    const band = readinessText !== null && readiness !== null ? readinessBand(readiness) : null;
    const target = targetsHidden ? null : loadTargetBand(days.slice(0, index + 1));
    items.push({
      id: readinessText !== null ? 'readiness' : 'hrv',
      title: readinessText !== null ? readinessTitle(t, band) : t('brief.plan.hrv'),
      reason: [readinessText, hrvText].filter((part): part is string => part !== null).join(' '),
      pill: target === null ? null : { label: t('brief.pill.load', { low: formatNumber(target.low, 1, language), high: formatNumber(target.high, 1, language) }), tone: 'info' },
    });
  }

  const sleepText = text('sleep');
  if (sleepText !== null) {
    const debt = day.sleep.debt.value;
    const owing = debt !== null && debt >= 15 * 60;
    items.push({
      id: 'sleep',
      title: owing ? t('brief.plan.debt') : t('brief.plan.sleep'),
      reason: [sleepText, text('debt')].filter((part): part is string => part !== null).join(' '),
      pill:
        owing && debt !== null
          ? { label: t('brief.pill.debt', { debt: formatHm(debt) }), tone: 'warning' }
          : day.sleep.asleepS === null
            ? null
            : { label: t('brief.pill.asleep', { asleep: formatHm(day.sleep.asleepS) }), tone: 'purple' },
    });
  }

  const bedtime = tonightBedtime(days, index);
  const bedtimeText = text('bedtime');
  if (bedtime !== null && bedtimeText !== null) {
    items.push({
      id: 'bedtime',
      title: t('brief.plan.bed', { bed: bedtime.bed }),
      reason: bedtimeText,
      pill: { label: t('brief.pill.bedtime', { bed: bedtime.bed }), tone: 'purple' },
    });
  }

  const habit = worstBehaviour(days.slice(0, index + 1), journal, selectedQuestions, day.day);
  if (habit !== null) {
    const pct = formatNumber(Math.abs(habit.deltaPct), 0, language);
    items.push({
      id: 'habit',
      title: t('brief.plan.habit'),
      reason: t('brief.plan.habitReason', { question: t(habit.labelKey), pct, nWith: habit.nWith, nWithout: habit.nWithout }),
      pill: { label: t('brief.pill.habit', { pct }), tone: 'warning' },
    });
  }
  return items;
}

export function morningQuestion(t: TFunction, days: readonly DayRecord[], index: number): string {
  const day = days[index];
  if (!day) return t('brief.ask.today');
  const hrv = day.hrv.value;
  if (hrv !== null && rangeStatus(hrv, baselineAt(days, index, 'hrv')) === 'below') return t('brief.ask.hrvLow');
  const readiness = visibleReadiness(day).value;
  if (readiness !== null && readinessBand(readiness) === 'low') return t('brief.ask.readinessLow');
  return t('brief.ask.today');
}
