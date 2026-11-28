import { behaviourStats, dayMark, earliestAnswer, weeklyCounts } from '@/data/journalTrends';

const journal = {
  '2026-11-20': { read: true },
  '2026-11-21': { read: true },
  '2026-11-22': { read: false },
  '2026-11-23': { read: true },
  '2026-11-24': { read: true, alcohol: 2 },
  '2026-11-25': { read: true, alcohol: 0 },
  '2026-10-30': { read: true },
  '2026-10-31': { read: true },
  '2026-11-01': { read: true },
  '2026-11-02': { read: true },
};

describe('behaviour trends', () => {
  it('counts the streak up to today, waiting for today to be logged', () => {
    expect(behaviourStats(journal, 'read', '2026-11-26')).toEqual({ streak: 3, thisMonth: 7, best: 4, logged: 9, answered: 10 });
    expect(behaviourStats(journal, 'read', '2026-11-25').streak).toBe(3);
    expect(behaviourStats({ ...journal, '2026-11-26': { read: false } }, 'read', '2026-11-26').streak).toBe(0);
    expect(behaviourStats({ ...journal, '2026-11-26': { read: true } }, 'read', '2026-11-26').streak).toBe(4);
  });

  it('treats a count above zero as a yes', () => {
    expect(behaviourStats(journal, 'alcohol', '2026-11-26')).toEqual({ streak: 0, thisMonth: 1, best: 1, logged: 1, answered: 2 });
    expect(dayMark(journal, 'alcohol', '2026-11-24')).toBe('yes');
    expect(dayMark(journal, 'alcohol', '2026-11-25')).toBe('no');
    expect(dayMark(journal, 'alcohol', '2026-11-23')).toBe('none');
  });

  it('ignores answers after today', () => {
    expect(behaviourStats({ ...journal, '2026-11-30': { read: true } }, 'read', '2026-11-26').logged).toBe(9);
  });

  it('counts yes days per ISO week, ending with the current week', () => {
    expect(weeklyCounts(journal, 'read', '2026-11-26', 4)).toEqual([
      { weekStart: '2026-11-02', week: 45, count: 1, answered: 1 },
      { weekStart: '2026-11-09', week: 46, count: 0, answered: 0 },
      { weekStart: '2026-11-16', week: 47, count: 2, answered: 3 },
      { weekStart: '2026-11-23', week: 48, count: 3, answered: 3 },
    ]);
  });

  it('finds the first logged day for month navigation', () => {
    expect(earliestAnswer(journal, 'read')).toBe('2026-10-30');
    expect(earliestAnswer(journal, 'sauna')).toBeNull();
  });
});
