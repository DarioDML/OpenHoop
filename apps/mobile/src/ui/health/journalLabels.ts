import type { JournalCategory, JournalQuestion } from '@/data/journalQuestions';
import type { TFunction } from '@/i18n/useT';
import type { IconName } from '@/ui/Icon';

const CATEGORY_ICONS: Readonly<Record<JournalCategory, IconName>> = {
  nutrition: 'apple',
  sleep: 'moon',
  body: 'thermometer',
  activity: 'run',
  mind: 'wind',
  health: 'health',
  supplements: 'pill',
  lifestyle: 'community',
  environment: 'sun',
};

const QUESTION_ICONS: Readonly<Record<string, IconName>> = {
  alcohol: 'glass',
  'caffeine-late': 'coffee',
  caffeine: 'coffee',
  'energy-drink': 'coffee',
  'screens-bed': 'monitor',
  'screen-time': 'monitor',
  'read-before-sleep': 'bed',
  sauna: 'thermometer',
  melatonin: 'pill',
  'late-meal': 'clock',
  'evening-workout': 'dumbbell',
  'morning-workout': 'dumbbell',
  'strength-training': 'dumbbell',
  nap: 'bed',
  'high-stress': 'pulse',
  water: 'drop',
  outdoors: 'sun',
  running: 'run',
  cycling: 'bike',
  swimming: 'swim',
  yoga: 'yoga',
  hiking: 'mountain',
  'long-walk': 'walk',
  'dog-walk': 'walk',
  travelling: 'plane',
  flight: 'plane',
  'jet-lag': 'plane',
  meditation: 'wind',
  breathwork: 'wind',
};

export function categoryIcon(category: JournalCategory): IconName {
  return CATEGORY_ICONS[category];
}

export function questionIcon(question: JournalQuestion): IconName {
  return QUESTION_ICONS[question.id] ?? CATEGORY_ICONS[question.category];
}

export function questionText(t: TFunction, question: JournalQuestion): string {
  return question.labelKey === question.nameKey ? t('journal.askFormat', { name: t(question.nameKey) }) : t(question.labelKey);
}

export function behaviourLabel(t: TFunction, question: JournalQuestion): string {
  return t(question.nameKey);
}
