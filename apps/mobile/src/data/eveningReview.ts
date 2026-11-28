import type { DayRecord } from '@openhoop/core';

import { loadTargetBand } from './activityDerived';
import { activeQuestions, type JournalQuestion } from './journalQuestions';
import type { JournalAnswer } from './userData';

export type LoadMark = 'onTarget' | 'below' | 'above';

export interface LoadReview {
  value: number;
  low: number | null;
  high: number | null;
  mark: LoadMark | null;
  weekAverage: number | null;
}

export function loadReview(days: readonly DayRecord[], index: number, targetsHidden = false): LoadReview | null {
  const day = days[index];
  const value = day?.load.value ?? null;
  if (!day || value === null) return null;
  const band = targetsHidden ? null : loadTargetBand(days.slice(0, index + 1));
  const recent = days
    .slice(Math.max(0, index - 7), index)
    .map((d) => d.load.value)
    .filter((v): v is number => v !== null);
  const weekAverage = recent.length >= 3 ? recent.reduce((sum, v) => sum + v, 0) / recent.length : null;
  const mark: LoadMark | null = band === null ? null : value < band.low ? 'below' : value > band.high ? 'above' : 'onTarget';
  return { value, low: band?.low ?? null, high: band?.high ?? null, mark, weekAverage };
}

export interface StepsReview {
  steps: number;
  goal: number | null;
  met: boolean;
}

export function stepsReview(steps: number | null, goal: number | null): StepsReview | null {
  if (steps === null) return null;
  return { steps, goal, met: goal !== null && goal > 0 && steps >= goal };
}

export type JournalMark = 'late' | 'watch' | 'good';

export const JOURNAL_MARKS: Readonly<Record<string, JournalMark>> = {
  'caffeine-late': 'late',
  'late-meal': 'late',
  'screens-bed': 'late',
  alcohol: 'watch',
  'high-stress': 'watch',
  'read-before-sleep': 'good',
  outdoors: 'good',
  water: 'good',
};

export function isWatchedHabit(questionId: string): boolean {
  const mark = JOURNAL_MARKS[questionId];
  return mark === 'late' || mark === 'watch';
}

export interface JournalRow {
  question: JournalQuestion;
  answer: JournalAnswer;
  mark: JournalMark | null;
}

function answeredYes(answer: JournalAnswer | undefined): answer is JournalAnswer {
  return answer === true || (typeof answer === 'number' && answer > 0);
}

export function journalRows(journal: Record<string, Record<string, JournalAnswer>>, day: string, selected: readonly string[] | null): JournalRow[] {
  const answers = journal[day] ?? {};
  const rows: JournalRow[] = [];
  for (const question of activeQuestions(selected)) {
    const answer = answers[question.id];
    if (answeredYes(answer)) rows.push({ question, answer, mark: JOURNAL_MARKS[question.id] ?? null });
  }
  return rows;
}

export function answeredToday(journal: Record<string, Record<string, JournalAnswer>>, day: string): boolean {
  return Object.keys(journal[day] ?? {}).length > 0;
}

export type SummaryLead = 'solid' | 'light' | 'hard' | 'quiet';

export interface EveningSummary {
  lead: SummaryLead;
  watch: JournalRow[];
}

export function eveningSummary(load: LoadReview | null, steps: StepsReview | null, rows: readonly JournalRow[]): EveningSummary {
  const watch = rows.filter((row) => row.mark === 'late' || row.mark === 'watch');
  let lead: SummaryLead = 'quiet';
  if (load?.mark === 'onTarget') lead = 'solid';
  else if (load?.mark === 'below') lead = steps?.met === true ? 'solid' : 'light';
  else if (load?.mark === 'above') lead = 'hard';
  else if (steps?.met === true) lead = 'solid';
  return { lead, watch };
}

export const WIND_DOWN_SCREENS_MIN = 45;
export const ROOM_TEMPERATURE_C = 18;

export function screensOffMinutes(bedMinutes: number): number {
  return (((bedMinutes - WIND_DOWN_SCREENS_MIN) % 1440) + 1440) % 1440;
}
