import { allTranslations, translate } from '@/i18n';
import { DEFAULT_JOURNAL_QUESTIONS, JOURNAL_CATEGORIES, JOURNAL_QUESTIONS, MAX_ACTIVE_QUESTIONS, activeQuestions, findQuestion, searchQuestions, trackedQuestions, withQuestion, CATALOGUE_PREVIEW, catalogueGroups } from '@/data/journalQuestions';
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

describe('catalogueGroups', () => {
  const entries = JOURNAL_QUESTIONS.map((question) => ({ question, label: question.id }));
  const nutrition = JOURNAL_QUESTIONS.filter((q) => q.category === 'nutrition');

  it('gives every category its own short group with the active ones kept', () => {
    const groups = catalogueGroups(entries, '', ['alcohol', 'fish'], new Set());
    expect(groups.map((g) => g.category)).toEqual([...JOURNAL_CATEGORIES]);
    const food = groups.find((g) => g.category === 'nutrition');
    expect(food?.items.length).toBe(CATALOGUE_PREVIEW);
    expect(food?.items.map((e) => e.question.id)).toEqual(expect.arrayContaining(['alcohol', 'fish']));
    expect(food?.total).toBe(nutrition.length);
    expect(food?.hidden).toBe(nutrition.length - CATALOGUE_PREVIEW);
  });

  it('keeps catalogue order inside a group', () => {
    const food = catalogueGroups(entries, '', ['fish'], new Set()).find((g) => g.category === 'nutrition');
    const order = nutrition.map((q) => q.id);
    const shown = food?.items.map((e) => order.indexOf(e.question.id)) ?? [];
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
  });

  it('shows every active behaviour even past the preview', () => {
    const active = nutrition.slice(0, CATALOGUE_PREVIEW + 2).map((q) => q.id);
    const food = catalogueGroups(entries, '', active, new Set()).find((g) => g.category === 'nutrition');
    expect(food?.items.length).toBe(CATALOGUE_PREVIEW + 2);
  });

  it('opens a group fully when expanded or when searching', () => {
    expect(catalogueGroups(entries, '', [], new Set(['nutrition'])).find((g) => g.category === 'nutrition')?.hidden).toBe(0);
    const search = catalogueGroups(entries, 'f', [], new Set());
    expect(search.every((g) => g.hidden === 0)).toBe(true);
  });
});
