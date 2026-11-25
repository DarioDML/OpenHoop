import type { BodyMeasurement } from '@openhoop/core';

import { computeTrend, parseBodyRange, leanMassKg, newestChanged, newestMeasurement, shiftIsoDay, validateBodyDraft } from '@/data/bodyComposition';

const TODAY = '2026-11-25';

function entry(id: number, day: string, weightKg: number, bodyFatPct: number | null = null): BodyMeasurement {
  return { id, day, weightKg, bodyFatPct, createdAt: id };
}

describe('validateBodyDraft', () => {
  it('accepts a weight with an optional body fat', () => {
    expect(validateBodyDraft({ day: TODAY, weight: '80,5', bodyFat: '' }, TODAY)).toEqual({
      ok: true,
      value: { day: TODAY, weightKg: 80.5, bodyFatPct: null },
    });
    expect(validateBodyDraft({ day: ' 2026-11-01 ', weight: '72', bodyFat: '18.25' }, TODAY)).toEqual({
      ok: true,
      value: { day: '2026-11-01', weightKg: 72, bodyFatPct: 18.25 },
    });
  });

  it('enforces the weight range 25 to 300 kg', () => {
    for (const weight of ['24.9', '300.5', '301', '0', '', 'abc', '-70', '1e2']) {
      expect(validateBodyDraft({ day: TODAY, weight, bodyFat: '' }, TODAY)).toEqual({ ok: false, invalid: ['weight'] });
    }
    expect(validateBodyDraft({ day: TODAY, weight: '25', bodyFat: '' }, TODAY).ok).toBe(true);
    expect(validateBodyDraft({ day: TODAY, weight: '300', bodyFat: '' }, TODAY).ok).toBe(true);
  });

  it('enforces the body fat range 2 to 70 percent', () => {
    for (const bodyFat of ['1.9', '70.5', '71', 'x']) {
      expect(validateBodyDraft({ day: TODAY, weight: '80', bodyFat }, TODAY)).toEqual({ ok: false, invalid: ['bodyFat'] });
    }
    expect(validateBodyDraft({ day: TODAY, weight: '80', bodyFat: '2' }, TODAY).ok).toBe(true);
    expect(validateBodyDraft({ day: TODAY, weight: '80', bodyFat: '70' }, TODAY).ok).toBe(true);
  });

  it('rejects dates in the future, malformed or impossible dates', () => {
    for (const day of ['2026-11-26', '2027-01-01', '2026-02-30', '25-11-2026', '', 'today', '2014-12-31']) {
      expect(validateBodyDraft({ day, weight: '80', bodyFat: '' }, TODAY)).toEqual({ ok: false, invalid: ['day'] });
    }
  });

  it('reports every invalid field', () => {
    expect(validateBodyDraft({ day: '2030-01-01', weight: '5', bodyFat: '99' }, TODAY)).toEqual({
      ok: false,
      invalid: ['day', 'weight', 'bodyFat'],
    });
  });
});

describe('shiftIsoDay', () => {
  it('moves across month and year boundaries', () => {
    expect(shiftIsoDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftIsoDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftIsoDay('2026-11-25', -30)).toBe('2026-10-26');
    expect(shiftIsoDay('2024-03-01', -1)).toBe('2024-02-29');
  });
});

describe('newest entry', () => {
  it('orders by day, then by id', () => {
    expect(newestMeasurement([])).toBeNull();
    expect(newestMeasurement([entry(1, '2026-11-20', 80), entry(3, '2026-11-10', 81), entry(2, '2026-11-20', 79)])?.id).toBe(2);
  });

  it('reports a change only when the newest entry differs', () => {
    const a = entry(1, '2026-11-10', 80);
    const b = entry(2, '2026-11-20', 79);
    expect(newestChanged([a], [a, b])).toEqual(b);
    expect(newestChanged([a, b], [entry(1, '2026-11-05', 82), b])).toBeNull();
    expect(newestChanged([a, b], [a, entry(2, '2026-11-20', 78)])?.weightKg).toBe(78);
    expect(newestChanged([a, b], [a])).toEqual(a);
    expect(newestChanged([a], [])).toBeNull();
    expect(newestChanged([], [a])).toEqual(a);
  });
});

describe('computeTrend', () => {
  const entries = [
    entry(1, '2025-12-01', 90, 25),
    entry(2, '2026-09-01', 84, 22),
    entry(3, '2026-10-20', 82.4),
    entry(4, '2026-11-01', 81, 20),
    entry(5, '2026-11-20', 80.2),
    entry(6, '2026-11-20', 80, null),
  ];

  it('covers only the chosen window and keeps one point per day', () => {
    const t30 = computeTrend(entries, 30, TODAY);
    expect(t30.points.map((p) => p.day)).toEqual(['2026-11-01', '2026-11-20']);
    expect(t30.points[1]?.weightKg).toBe(80);
    expect(computeTrend(entries, 90, TODAY).points.map((p) => p.day)).toEqual(['2026-09-01', '2026-10-20', '2026-11-01', '2026-11-20']);
    expect(computeTrend(entries, 365, TODAY).points).toHaveLength(5);
  });

  it('computes the change from the first to the last point of the window', () => {
    expect(computeTrend(entries, 30, TODAY).changeKg).toBeCloseTo(-1, 10);
    expect(computeTrend(entries, 90, TODAY).changeKg).toBeCloseTo(-4, 10);
    expect(computeTrend(entries, 365, TODAY).changeKg).toBeCloseTo(-10, 10);
  });

  it('has no change with fewer than two points and no latest without entries', () => {
    const single = computeTrend([entry(1, '2026-11-20', 80)], 30, TODAY);
    expect(single.changeKg).toBeNull();
    expect(single.latest?.weightKg).toBe(80);
    const none = computeTrend([], 30, TODAY);
    expect(none).toMatchObject({ points: [], latest: null, changeKg: null, changeBodyFatPct: null, leanMass: null, firstDay: null, lastDay: null });
  });

  it('keeps the latest entry even when it is outside the window', () => {
    const old = computeTrend([entry(1, '2026-01-10', 85)], 30, TODAY);
    expect(old.points).toEqual([]);
    expect(old.latest?.day).toBe('2026-01-10');
  });

  it('ignores entries dated after today', () => {
    expect(computeTrend([entry(1, '2026-12-01', 80)], 30, TODAY).points).toEqual([]);
  });

  it('derives lean mass only from an entry that has body fat', () => {
    const t = computeTrend(entries, 365, TODAY);
    expect(t.leanMass?.day).toBe('2026-11-01');
    expect(t.leanMass?.kg).toBeCloseTo(81 * 0.8, 10);
    expect(t.leanMass?.fromNewest).toBe(false);
    expect(computeTrend([entry(1, '2026-11-20', 80, 25)], 30, TODAY).leanMass).toEqual({ kg: 60, day: '2026-11-20', fromNewest: true });
    expect(computeTrend([entry(1, '2026-11-20', 80)], 30, TODAY).leanMass).toBeNull();
  });

  it('computes the body fat change from entries that have body fat', () => {
    expect(computeTrend(entries, 365, TODAY).changeBodyFatPct).toBeCloseTo(-5, 10);
    expect(computeTrend(entries, 30, TODAY).changeBodyFatPct).toBeNull();
  });
});

describe('leanMassKg', () => {
  it('subtracts the fat share from the weight', () => {
    expect(leanMassKg(100, 20)).toBe(80);
    expect(leanMassKg(70, 30)).toBeCloseTo(49, 10);
  });
});

describe('parseBodyRange', () => {
  it('accepts the known ranges and falls back to 90 days', () => {
    expect(parseBodyRange('30')).toBe(30);
    expect(parseBodyRange('365')).toBe(365);
    expect(parseBodyRange('7')).toBe(90);
  });
});
