import type { DayRecord } from '@openhoop/core';

import { createFixtureDays } from '@/data/fixtureSource';
import {
  anchorFromHistory,
  defaultPreDays,
  generateFromSaved,
  generatePlan,
  normalizeShiftH,
  parseTripForm,
  sameSavedPlan,
  stepsNeeded,
  zoneShiftH,
  type JetLagPlan,
  type JetLagTrip,
  type SleepAnchor,
  type TripForm,
} from '@/data/jetLag';
import { defaultUserData, parseUserData, serializeUserData, type SavedJetLagPlan } from '@/data/userData';
import { formatMinutes } from '@/data/dailyDerived';
import { isValidTimeZone, wallClockToEpoch, zoneOffsetS } from '@/lib/timeZones';

import { FIXTURE_NOW } from './support/appData';

const ANCHOR: SleepAnchor = { bedMinutes: 23 * 60, wakeMinutes: 7 * 60, source: 'entered' };

function trip(overrides: Partial<JetLagTrip>): JetLagTrip {
  return { departureDate: '2026-03-10', departureMinutes: 10 * 60, homeZone: 'Europe/Brussels', destZone: 'Asia/Tokyo', preDays: null, ...overrides };
}

function planOf(tripInput: JetLagTrip, anchor: SleepAnchor = ANCHOR): JetLagPlan {
  const result = generatePlan(tripInput, anchor);
  if (!result.ok) throw new Error(`plan failed: ${result.problem}`);
  return result.plan;
}

function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('missing value');
  return value;
}

function clock(point: { minutes: number }): string {
  return formatMinutes(point.minutes);
}

describe('time zone helpers', () => {
  it('validates IANA names with Intl', () => {
    expect(isValidTimeZone('Europe/Brussels')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('reads offsets with DST', () => {
    expect(zoneOffsetS('Europe/Brussels', Date.UTC(2026, 0, 15) / 1000)).toBe(3_600);
    expect(zoneOffsetS('Europe/Brussels', Date.UTC(2026, 6, 15) / 1000)).toBe(7_200);
    expect(zoneOffsetS('Asia/Kolkata', Date.UTC(2026, 6, 15) / 1000)).toBe(19_800);
  });

  it('moves a wall clock time that does not exist forward and takes the first of a repeated one', () => {
    expect(wallClockToEpoch('Europe/Brussels', '2026-03-29', 150)).toBe(Date.UTC(2026, 2, 29, 1, 30) / 1000);
    expect(wallClockToEpoch('Europe/Brussels', '2026-10-25', 150)).toBe(Date.UTC(2026, 9, 25, 0, 30) / 1000);
    expect(wallClockToEpoch('Europe/Brussels', '2026-01-15', 150)).toBe(Date.UTC(2026, 0, 15, 1, 30) / 1000);
  });
});

describe('zone shift', () => {
  it('takes the shorter way round the clock', () => {
    expect(normalizeShiftH(8)).toBe(8);
    expect(normalizeShiftH(13)).toBe(-11);
    expect(normalizeShiftH(-13)).toBe(11);
    expect(normalizeShiftH(12)).toBe(-12);
    expect(normalizeShiftH(24)).toBe(0);
    expect(normalizeShiftH(5.5)).toBe(5.5);
  });

  it('needs more steps going east than west', () => {
    expect(stepsNeeded(6)).toBe(6);
    expect(stepsNeeded(-6)).toBe(4);
    expect(stepsNeeded(-1)).toBe(1);
    expect(stepsNeeded(0)).toBe(0);
    expect(defaultPreDays(8)).toBe(3);
    expect(defaultPreDays(2)).toBe(2);
    expect(defaultPreDays(-1)).toBe(1);
  });
});

describe('generatePlan', () => {
  it('shifts one hour per day earlier going east and shows both clocks', () => {
    const plan = planOf(trip({}));
    expect(plan.direction).toBe('east');
    expect(plan.zoneShiftH).toBe(8);
    expect(plan.ratePerDay).toBe(1);
    expect(plan.preDays).toBe(3);
    expect(plan.days.map((d) => d.offset)).toEqual([-3, -2, -1, 0, 1, 2, 3, 4]);
    expect(plan.days.map((d) => d.phase)).toEqual(['before', 'before', 'before', 'travel', 'after', 'after', 'after', 'after']);
    expect(plan.days.map((d) => d.shiftH)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const first = plan.days[0];
    const last = plan.days[plan.days.length - 1];
    if (!first || !last) throw new Error('no days');
    expect(first.bed.home.date).toBe('2026-03-07');
    expect(clock(first.bed.home)).toBe('22:00');
    expect(clock(first.wake.home)).toBe('06:00');
    expect(first.bed.dest.date).toBe('2026-03-08');
    expect(clock(first.bed.dest)).toBe('06:00');
    expect(first.adapted).toBe(false);

    expect(clock(last.bed.home)).toBe('15:00');
    expect(clock(last.bed.dest)).toBe('23:00');
    expect(last.bed.dest.date).toBe('2026-03-14');
    expect(clock(last.wake.dest)).toBe('07:00');
    expect(last.adapted).toBe(true);
    expect(last.seek).toBeNull();
    expect(last.avoid).toBeNull();
  });

  it('seeks light after waking and avoids it in the evening when going east', () => {
    const day = planOf(trip({})).days[0];
    if (!day || !day.seek || !day.avoid) throw new Error('no windows');
    expect(day.seek.start.epochS).toBe(day.wake.epochS);
    expect(day.seek.end.epochS - day.seek.start.epochS).toBe(3 * 3_600);
    expect(day.avoid.end.epochS).toBe(day.bed.epochS);
    expect(day.avoid.start.epochS).toBe(day.bed.epochS - 3 * 3_600);
  });

  it('shifts 1.5 hours per day later going west and swaps the light windows', () => {
    const plan = planOf(trip({ departureDate: '2026-06-10', destZone: 'America/New_York' }));
    expect(plan.direction).toBe('west');
    expect(plan.zoneShiftH).toBe(-6);
    expect(plan.ratePerDay).toBe(1.5);
    expect(plan.days.map((d) => d.shiftH)).toEqual([-1.5, -3, -4.5, -6, -6]);

    const first = plan.days[0];
    if (!first || !first.seek || !first.avoid) throw new Error('no windows');
    expect(clock(first.bed.home)).toBe('00:30');
    expect(first.bed.home.date).toBe('2026-06-08');
    expect(clock(first.bed.dest)).toBe('18:30');
    expect(clock(first.wake.home)).toBe('08:30');
    expect(first.seek.end.epochS).toBe(first.bed.epochS);
    expect(first.avoid.start.epochS).toBe(first.wake.epochS);

    const arrival = plan.days[plan.days.length - 1];
    expect(arrival?.adapted).toBe(true);
    expect(clock(must(arrival).bed.dest)).toBe('23:00');
  });

  it('honours the number of days to pre-adjust', () => {
    const none = planOf(trip({ preDays: 0 }));
    expect(none.preDays).toBe(0);
    expect(none.days[0]?.phase).toBe('travel');
    expect(none.days[0]?.shiftH).toBe(1);
    expect(none.days.length).toBe(8);

    const capped = planOf(trip({ destZone: 'Europe/Athens', preDays: 7 }));
    expect(capped.preDays).toBe(1);
  });

  it('keeps one night after arrival when the shift is done before departure', () => {
    const plan = planOf(trip({ destZone: 'Europe/Athens', preDays: 1 }));
    expect(plan.zoneShiftH).toBe(1);
    expect(plan.days.map((d) => d.offset)).toEqual([-1, 0, 1]);
    expect(plan.days.map((d) => d.adapted)).toEqual([true, true, true]);
  });

  it('returns no days when there is no time difference', () => {
    for (const destZone of ['Europe/Amsterdam', 'Europe/Brussels']) {
      const plan = planOf(trip({ destZone }));
      expect(plan.direction).toBe('none');
      expect(plan.zoneShiftH).toBe(0);
      expect(plan.days).toEqual([]);
    }
    const utc = planOf(trip({ homeZone: 'UTC', destZone: 'Atlantic/Reykjavik' }));
    expect(utc.direction).toBe('none');
  });

  it('crosses the date line: Honolulu to Auckland is a one hour delay, a day ahead', () => {
    const plan = planOf(trip({ departureDate: '2026-01-10', homeZone: 'Pacific/Honolulu', destZone: 'Pacific/Auckland' }));
    expect(plan.direction).toBe('west');
    expect(plan.zoneShiftH).toBe(-1);
    expect(plan.departure.home.date).toBe('2026-01-10');
    expect(plan.departure.dest.date).toBe('2026-01-11');
    expect(clock(plan.departure.dest)).toBe('09:00');
    const first = plan.days[0];
    expect(first?.bed.home.date).toBe('2026-01-10');
    expect(clock(must(first).bed.home)).toBe('00:00');
    expect(first?.bed.dest.date).toBe('2026-01-10');
    expect(clock(must(first).bed.dest)).toBe('23:00');
  });

  it('treats a 25 hour difference over the date line as one hour east', () => {
    const plan = planOf(trip({ departureDate: '2026-01-10', homeZone: 'Pacific/Pago_Pago', destZone: 'Pacific/Kiritimati' }));
    expect(plan.direction).toBe('east');
    expect(plan.zoneShiftH).toBe(1);
    expect(plan.departure.dest.date).not.toBe(plan.departure.home.date);
  });

  it('goes the shorter way for half hour zones and large differences', () => {
    const india = planOf(trip({ departureDate: '2026-01-10', destZone: 'Asia/Kolkata' }));
    expect(india.zoneShiftH).toBe(4.5);
    expect(india.days.map((d) => d.shiftH).slice(-2)).toEqual([4, 4.5]);
    const auckland = planOf(trip({ departureDate: '2026-01-10', destZone: 'Pacific/Auckland' }));
    expect(auckland.zoneShiftH).toBe(-12);
    expect(auckland.direction).toBe('west');
  });

  it('flags a clock change in the home zone inside the plan', () => {
    const plan = planOf(trip({ departureDate: '2026-03-30', destZone: 'America/New_York' }));
    expect(plan.zoneShiftH).toBe(-6);
    const byOffset = new Map(plan.days.map((d) => [d.offset, d]));
    expect(byOffset.get(-2)?.clockChange).toEqual({ home: false, dest: false });
    expect(byOffset.get(-1)?.clockChange).toEqual({ home: true, dest: false });
    expect(byOffset.get(0)?.clockChange).toEqual({ home: false, dest: false });
  });

  it('adapts to a clock change at the destination during the plan', () => {
    const plan = planOf(trip({ departureDate: '2026-03-09', destZone: 'America/New_York' }));
    expect(plan.zoneShiftH).toBe(-5);
    const changed = plan.days.filter((d) => d.clockChange.dest);
    expect(changed.map((d) => d.offset)).toEqual([-1]);
    expect(plan.days[0]?.shiftH).toBe(-1.5);
    const last = plan.days[plan.days.length - 1];
    expect(last?.shiftH).toBe(-5);
    expect(last?.adapted).toBe(true);
    expect(clock(must(last).bed.dest)).toBe('23:00');
  });

  it('keeps the direction when a clock change moves the difference across twelve hours', () => {
    const plan = planOf(trip({ departureDate: '2026-04-07', homeZone: 'Europe/London', destZone: 'Pacific/Auckland' }));
    expect(plan.direction).toBe('east');
    expect(plan.zoneShiftH).toBe(11);
    const first = must(plan.days[0]);
    expect(first.offset).toBe(-3);
    expect(first.shiftH).toBe(1);
    expect(first.adapted).toBe(false);
    expect(first.seek).not.toBeNull();
    expect(plan.days.map((d) => d.shiftH)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('keeps the night length when bed and wake shift together', () => {
    const plan = planOf(trip({}));
    for (const day of plan.days) expect(day.wake.epochS - day.bed.epochS).toBe(8 * 3_600);
  });

  it('puts a bedtime after midnight on the next calendar day', () => {
    const plan = planOf(trip({ preDays: 0 }), { bedMinutes: 30, wakeMinutes: 8 * 60, source: 'sleep-data' });
    const day = plan.days[0];
    expect(clock(must(day).bed.home)).toBe('23:30');
    expect(day?.bed.home.date).toBe('2026-03-10');
    expect(clock(must(day).wake.home)).toBe('07:00');
    expect(day?.wake.home.date).toBe('2026-03-11');
  });

  it('rejects bad input', () => {
    const problem = (t: JetLagTrip, a: SleepAnchor = ANCHOR) => {
      const result = generatePlan(t, a);
      return result.ok ? null : result.problem;
    };
    expect(problem(trip({ homeZone: 'Nowhere/Land' }))).toBe('invalid-zone');
    expect(problem(trip({ departureDate: '2026-02-30' }))).toBe('invalid-date');
    expect(problem(trip({ departureMinutes: 1440 }))).toBe('invalid-time');
    expect(problem(trip({ preDays: 8 }))).toBe('invalid-days');
    expect(problem(trip({ preDays: 1.5 }))).toBe('invalid-days');
    expect(problem(trip({}), { ...ANCHOR, wakeMinutes: ANCHOR.bedMinutes })).toBe('invalid-anchor');
  });

  it('reads the shift at the instant of departure', () => {
    const summer = wallClockToEpoch('Europe/Brussels', '2026-07-01', 600);
    const winter = wallClockToEpoch('Europe/Brussels', '2026-12-01', 600);
    expect(zoneShiftH('Europe/Brussels', 'Asia/Tokyo', summer ?? 0)).toBe(7);
    expect(zoneShiftH('Europe/Brussels', 'Asia/Tokyo', winter ?? 0)).toBe(8);
  });
});

describe('anchorFromHistory', () => {
  const days = createFixtureDays(FIXTURE_NOW);

  it('uses typical wake time and the sleep need from the pipeline', () => {
    const anchor = anchorFromHistory(days);
    expect(anchor).not.toBeNull();
    if (anchor === null) return;
    expect(anchor.nights).toBeGreaterThanOrEqual(3);
    expect(anchor.bedMinutes).toBeGreaterThanOrEqual(0);
    expect(anchor.bedMinutes).toBeLessThan(1440);
    expect(anchor.wakeMinutes).toBeGreaterThanOrEqual(0);
    expect(anchor.wakeMinutes).toBeLessThan(1440);
    expect(anchor.bedMinutes).not.toBe(anchor.wakeMinutes);
  });

  it('declines without history or without a sleep need', () => {
    expect(anchorFromHistory([])).toBeNull();
    const last = days[days.length - 1];
    if (!last) throw new Error('no fixture day');
    const noNeed: DayRecord = { ...last, sleep: { ...last.sleep, need: { ...last.sleep.need, value: null } } };
    expect(anchorFromHistory([...days.slice(0, -1), noNeed])).toBeNull();
    const noSleep: DayRecord[] = days.map((d) => ({ ...d, sleep: { ...d.sleep, periods: [] } }));
    expect(anchorFromHistory(noSleep)).toBeNull();
  });
});

describe('parseTripForm', () => {
  const form: TripForm = {
    departureDate: '2026-03-10',
    departureTime: '10:00',
    homeZone: 'Europe/Brussels',
    destZone: 'Asia/Tokyo',
    preDays: null,
    bedTime: '23:00',
    wakeTime: '07:00',
    anchorSource: 'entered',
  };

  it('turns valid text into a saved plan', () => {
    const result = parseTripForm(form);
    expect(result).toEqual({
      ok: true,
      saved: { departureDate: '2026-03-10', departureMinutes: 600, homeZone: 'Europe/Brussels', destZone: 'Asia/Tokyo', preDays: null, bedMinutes: 1380, wakeMinutes: 420, anchorSource: 'entered' },
    });
  });

  it('names the first problem', () => {
    const problem = (overrides: Partial<TripForm>) => {
      const result = parseTripForm({ ...form, ...overrides });
      return result.ok ? null : result.problem;
    };
    expect(problem({ departureDate: '10-03-2026' })).toBe('invalid-date');
    expect(problem({ departureTime: '25:00' })).toBe('invalid-time');
    expect(problem({ destZone: null })).toBe('missing-zone');
    expect(problem({ bedTime: '' })).toBe('invalid-bed');
    expect(problem({ wakeTime: 'soon' })).toBe('invalid-wake');
    expect(problem({ wakeTime: '23:00' })).toBe('same-bed-wake');
  });

  it('regenerates the same plan from the saved form', () => {
    const result = parseTripForm(form);
    if (!result.ok) throw new Error('form invalid');
    const regenerated = generateFromSaved(result.saved);
    expect(regenerated).toEqual({ ok: true, plan: planOf(trip({})) });
  });

  it('compares saved plans', () => {
    const result = parseTripForm(form);
    if (!result.ok) throw new Error('form invalid');
    expect(sameSavedPlan(result.saved, { ...result.saved })).toBe(true);
    expect(sameSavedPlan(result.saved, { ...result.saved, preDays: 2 })).toBe(false);
    expect(sameSavedPlan(null, null)).toBe(true);
    expect(sameSavedPlan(result.saved, null)).toBe(false);
  });
});

describe('saved plan in userData', () => {
  const saved: SavedJetLagPlan = {
    departureDate: '2026-03-10',
    departureMinutes: 600,
    homeZone: 'Europe/Brussels',
    destZone: 'Asia/Tokyo',
    preDays: 2,
    bedMinutes: 1380,
    wakeMinutes: 420,
    anchorSource: 'sleep-data',
  };

  it('defaults to no plan and round-trips a valid one', () => {
    expect(defaultUserData().jetLagPlan).toBeNull();
    expect(parseUserData(null).jetLagPlan).toBeNull();
    expect(parseUserData(serializeUserData({ ...defaultUserData(), jetLagPlan: saved })).jetLagPlan).toEqual(saved);
    expect(parseUserData(serializeUserData({ ...defaultUserData(), jetLagPlan: { ...saved, preDays: null } })).jetLagPlan?.preDays).toBeNull();
  });

  it('drops a stored plan that fails validation', () => {
    const bad: Array<Record<string, unknown>> = [
      { ...saved, homeZone: 'Mars/Olympus' },
      { ...saved, destZone: 42 },
      { ...saved, departureDate: '2026-02-30' },
      { ...saved, departureMinutes: 1440 },
      { ...saved, departureMinutes: 1.5 },
      { ...saved, preDays: 8 },
      { ...saved, preDays: 'two' },
      { ...saved, bedMinutes: 420 },
      { ...saved, wakeMinutes: -1 },
      { ...saved, anchorSource: 'guess' },
    ];
    for (const plan of bad) expect(parseUserData(JSON.stringify({ jetLagPlan: plan })).jetLagPlan).toBeNull();
    expect(parseUserData(JSON.stringify({ jetLagPlan: 'x' })).jetLagPlan).toBeNull();
  });
});
