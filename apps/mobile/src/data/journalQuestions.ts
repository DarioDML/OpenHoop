import type { TranslationKey } from '@/i18n';

export type JournalKind = 'yesno' | 'count';

export interface JournalQuestion {
  id: string;
  kind: JournalKind;
  labelKey: TranslationKey;
  unitKey?: TranslationKey;
  max?: number;
}

export const JOURNAL_QUESTIONS: readonly JournalQuestion[] = [
  { id: 'alcohol', kind: 'count', labelKey: 'journal.q.alcohol', unitKey: 'journal.unit.drinks', max: 20 },
  { id: 'caffeine-late', kind: 'yesno', labelKey: 'journal.q.caffeineLate' },
  { id: 'screens-bed', kind: 'yesno', labelKey: 'journal.q.screensBed' },
  { id: 'read-before-sleep', kind: 'yesno', labelKey: 'journal.q.readBeforeSleep' },
  { id: 'sauna', kind: 'yesno', labelKey: 'journal.q.sauna' },
  { id: 'melatonin', kind: 'yesno', labelKey: 'journal.q.melatonin' },
  { id: 'late-meal', kind: 'yesno', labelKey: 'journal.q.lateMeal' },
  { id: 'evening-workout', kind: 'yesno', labelKey: 'journal.q.eveningWorkout' },
  { id: 'nap', kind: 'yesno', labelKey: 'journal.q.nap' },
  { id: 'high-stress', kind: 'yesno', labelKey: 'journal.q.highStress' },
  { id: 'water', kind: 'count', labelKey: 'journal.q.water', unitKey: 'journal.unit.glasses', max: 20 },
  { id: 'outdoors', kind: 'yesno', labelKey: 'journal.q.outdoors' },
];

export const DEFAULT_JOURNAL_QUESTIONS: readonly string[] = ['alcohol', 'caffeine-late', 'screens-bed', 'read-before-sleep', 'sauna', 'melatonin'];

export function findQuestion(id: string): JournalQuestion | undefined {
  return JOURNAL_QUESTIONS.find((q) => q.id === id);
}

export function activeQuestions(selected: readonly string[]): JournalQuestion[] {
  const ids = selected.length > 0 ? selected : DEFAULT_JOURNAL_QUESTIONS;
  return ids.map(findQuestion).filter((q): q is JournalQuestion => q !== undefined);
}
