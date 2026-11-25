import { createFixtureDays } from '@/data/fixtureSource';
import { addDays, baselineAt, daysInWeek, percentFromBaseline, rangeStatus, wearStreak, weekStart } from '@/data/derived';
import { defaultUserData, initialOf, parseUserData, serializeUserData } from '@/data/userData';
import type * as JournalQuestions from '@/data/journalQuestions';

const days = createFixtureDays(new Date('2026-11-25T12:00:00Z'));

describe('baselines', () => {
  it('excludes the day itself and needs enough nights', () => {
    expect(baselineAt(days, 2, 'hrv')).toBeNull();
    const last = days.length - 1;
    const baseline = baselineAt(days, last, 'hrv');
    expect(baseline).not.toBeNull();
    expect(baseline?.count).toBeLessThanOrEqual(30);
    expect(baseline && baseline.low < baseline.mean && baseline.mean < baseline.high).toBe(true);
  });

  it('classifies values against the range', () => {
    const baseline = { mean: 60, low: 55, high: 65, count: 10 };
    expect(rangeStatus(60, baseline)).toBe('within');
    expect(rangeStatus(70, baseline)).toBe('above');
    expect(rangeStatus(50, baseline)).toBe('below');
    expect(rangeStatus(null, baseline)).toBeNull();
    expect(percentFromBaseline(54, baseline)).toBeCloseTo(-10);
  });
});

describe('calendar helpers', () => {
  it('finds the Monday of a week and spans 7 days', () => {
    expect(weekStart('2026-11-25')).toBe('2026-11-23');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(daysInWeek(days, '2026-11-25')).toHaveLength(7);
  });

  it('counts the wear streak up to the newest day', () => {
    expect(wearStreak(days)).toBeGreaterThan(0);
    expect(wearStreak([])).toBe(0);
  });
});

describe('user data codec', () => {
  it('round-trips and falls back on bad input', () => {
    const data = { ...defaultUserData(), name: '  Sam ', heightCm: 180, goals: ['sleep' as const] };
    const parsed = parseUserData(serializeUserData(data));
    expect(parsed.name).toBe('Sam');
    expect(parsed.heightCm).toBe(180);
    expect(parsed.goals).toEqual(['sleep']);
    expect(parseUserData('not json')).toEqual(defaultUserData());
    expect(parseUserData(JSON.stringify({ heightCm: 9999, goals: ['nope'], journal: { bad: {} } }))).toMatchObject({ heightCm: null, goals: [], journal: {} });
  });

  it('makes an initial without hardcoding a name', () => {
    expect(initialOf(null)).toBeNull();
    expect(initialOf('élise')).toBe('É');
  });
});

describe('journal question selection', () => {
  it('keeps an explicitly empty selection apart from the defaults', () => {
    const { activeQuestions, DEFAULT_JOURNAL_QUESTIONS } = jest.requireActual<typeof JournalQuestions>('@/data/journalQuestions');
    expect(activeQuestions(null)).toHaveLength(DEFAULT_JOURNAL_QUESTIONS.length);
    expect(activeQuestions([])).toHaveLength(0);
    expect(parseUserData(JSON.stringify({ journalQuestions: [] })).journalQuestions).toEqual([]);
    expect(parseUserData('{}').journalQuestions).toBeNull();
  });
});
