import { allTranslations, translate } from '@/i18n';
import {
  DEFAULT_JOURNAL_QUESTIONS,
  JOURNAL_CATEGORIES,
  JOURNAL_QUESTIONS,
  MAX_ACTIVE_QUESTIONS,
  activeQuestions,
  findQuestion,
  searchQuestions,
  trackedQuestions,
  withQuestion,
} from '@/data/journalQuestions';
import { parseUserData } from '@/data/userData';
import { questionIcon, questionText } from '@/ui/health/journalLabels';

const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]): string => translate('en', key, params);

describe('journal behaviour catalogue', () => {
  it('has well over a hundred unique behaviours with ids the stored journal accepts', () => {
    const ids = JOURNAL_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(140);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it('names every behaviour in English and Dutch', () => {
    for (const q of JOURNAL_QUESTIONS) {
      for (const key of [q.labelKey, q.nameKey, ...(q.unitKey ? [q.unitKey] : [])]) {
        expect(allTranslations.en[key]).toBeTruthy();
        expect(allTranslations.nl[key]).toBeTruthy();
      }
    }
    const names = JOURNAL_QUESTIONS.map((q) => allTranslations.en[q.nameKey]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives count questions a unit and a maximum', () => {
    for (const q of JOURNAL_QUESTIONS.filter((item) => item.kind === 'count')) {
      expect(q.unitKey).toBeDefined();
      expect(q.max).toBeGreaterThan(0);
    }
  });

  it('fills every category and keeps the defaults in the catalogue', () => {
    for (const category of JOURNAL_CATEGORIES) expect(JOURNAL_QUESTIONS.filter((q) => q.category === category).length).toBeGreaterThanOrEqual(5);
    expect(activeQuestions(null).map((q) => q.id)).toEqual([...DEFAULT_JOURNAL_QUESTIONS]);
  });

  it('adds and removes behaviours in catalogue order', () => {
    const added = withQuestion(null, 'cold-plunge', true);
    expect(added).toEqual([...DEFAULT_JOURNAL_QUESTIONS, 'cold-plunge']);
    expect(withQuestion(added, 'alcohol', false)).toEqual(['caffeine-late', 'screens-bed', 'read-before-sleep', 'sauna', 'melatonin', 'cold-plunge']);
    expect(withQuestion(['meditation'], 'alcohol', true)).toEqual(['alcohol', 'meditation']);
  });

  it('never stores more than the maximum number of behaviours', () => {
    const many = JOURNAL_QUESTIONS.slice(0, MAX_ACTIVE_QUESTIONS).map((q) => q.id);
    const extra = JOURNAL_QUESTIONS[MAX_ACTIVE_QUESTIONS + 3];
    if (!extra) throw new Error('catalogue too small');
    expect(withQuestion(many, extra.id, true)).toEqual(many);
    expect(withQuestion(many, many[0] ?? '', false)).toHaveLength(MAX_ACTIVE_QUESTIONS - 1);
  });

  it('keeps a long selection through a save and reload', () => {
    const many = JOURNAL_QUESTIONS.slice(0, 40).map((q) => q.id);
    expect(parseUserData(JSON.stringify({ journalQuestions: many })).journalQuestions).toEqual(many);
  });

  it('searches names without caring about case or accents', () => {
    const entries = JOURNAL_QUESTIONS.map((question) => ({ question, label: translate('nl', question.nameKey) }));
    expect(searchQuestions(entries, 'CAFEINE').map((e) => e.question.id)).toContain('caffeine');
    expect(searchQuestions(entries, '  ').length).toBe(entries.length);
    expect(searchQuestions(entries, 'zzzz')).toEqual([]);
  });

  it('tracks answered behaviours even after they leave the active list', () => {
    const tracked = trackedQuestions(['alcohol'], { '2026-11-20': { 'cold-plunge': true, unknown: true } });
    expect(tracked.map((q) => q.id)).toEqual(['alcohol', 'cold-plunge']);
  });

  it('asks new behaviours as a question and keeps the original wording for the first ones', () => {
    const plunge = findQuestion('cold-plunge');
    const alcohol = findQuestion('alcohol');
    if (!plunge || !alcohol) throw new Error('missing behaviour');
    expect(questionText(t, plunge)).toBe('Cold plunge?');
    expect(questionText(t, alcohol)).toBe('Any alcohol?');
    expect(questionIcon(alcohol)).toBe('glass');
    expect(questionIcon(plunge)).toBe('thermometer');
  });
});
