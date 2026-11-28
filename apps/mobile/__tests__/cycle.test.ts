import type { PeriodEntry, SymptomEntry } from '@openhoop/core';

import {
  applyDayFlow,
  buildTimeline,
  computeCycleStats,
  cyclePhases,
  cycleWheel,
  dayFlow,
  fertileWindow,
  latestDeviation,
  tempFitsPhase,
  dayOfCycle,
  daysBetween,
  estimateNextPeriod,
  groupSymptomsByDay,
  nightlySeries,
  parseTimelineRange,
  pregnancyProgress,
  validateDueDay,
  validatePeriodDraft,
  validateSymptomDraft,
} from '@/data/cycle';
import { createFixtureDays } from '@/data/fixtureSource';

import { FIXTURE_NOW } from './support/appData';

function period(id: number, startDay: string, endDay: string | null = null, flow: 1 | 2 | 3 = 2): PeriodEntry {
  return { id, startDay, endDay, flow, createdAt: id };
}

const TODAY = '2026-11-25';

describe('daysBetween', () => {
  it('counts calendar days across month and year ends', () => {
    expect(daysBetween('2026-11-25', '2026-11-25')).toBe(0);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-11-25', '2026-11-20')).toBe(-5);
  });
});

describe('computeCycleStats', () => {
  it('has no averages without periods', () => {
    const stats = computeCycleStats([]);
    expect(stats).toMatchObject({ averageCycleDays: null, averagePeriodDays: null, periodCount: 0, lastStartDay: null, cycleCount: 0 });
  });

  it('needs two period starts for one cycle length', () => {
    const stats = computeCycleStats([period(1, '2026-10-01', '2026-10-05')]);
    expect(stats.averageCycleDays).toBeNull();
    expect(stats.averagePeriodDays).toBe(5);
  });

  it('averages the cycle lengths between period starts and the completed period lengths', () => {
    const stats = computeCycleStats([
      period(1, '2026-08-01', '2026-08-05'),
      period(2, '2026-08-29', '2026-09-02'),
      period(3, '2026-09-28', '2026-10-03'),
      period(4, '2026-10-26', null),
    ]);
    expect(stats.cycleLengths).toEqual([28, 30, 28]);
    expect(stats.averageCycleDays).toBe(28.7);
    expect(stats.shortestCycleDays).toBe(28);
    expect(stats.longestCycleDays).toBe(30);
    expect(stats.averagePeriodDays).toBe(5.3);
    expect(stats.periodCount).toBe(4);
    expect(stats.lastStartDay).toBe('2026-10-26');
  });

  it('skips gaps that are too long or too short to be one cycle and counts them', () => {
    const stats = computeCycleStats([period(1, '2026-01-01'), period(2, '2026-04-01'), period(3, '2026-04-12'), period(4, '2026-07-01')]);
    expect(stats.cycleLengths).toEqual([]);
    expect(stats.skippedGaps).toBe(3);
    expect(stats.averageCycleDays).toBeNull();
  });

  it('uses only the most recent six cycles and sorts unordered input', () => {
    const starts = ['2026-01-01', '2026-01-29', '2026-02-26', '2026-03-26', '2026-04-23', '2026-05-21', '2026-06-18', '2026-07-26'];
    const shuffled = [...starts].reverse().map((startDay, index) => period(index + 1, startDay));
    const stats = computeCycleStats(shuffled);
    expect(stats.cycleLengths).toEqual([28, 28, 28, 28, 28, 38]);
    expect(stats.cycleCount).toBe(6);
  });

  it('ignores period lengths that are implausible', () => {
    const stats = computeCycleStats([period(1, '2026-10-01', '2026-10-04'), period(2, '2026-10-29', '2026-11-28')]);
    expect(stats.averagePeriodDays).toBe(4);
  });
});

describe('estimateNextPeriod', () => {
  it('says why there is no estimate', () => {
    expect(estimateNextPeriod(computeCycleStats([]), TODAY)).toEqual({ ok: false, reason: 'no-data' });
    expect(estimateNextPeriod(computeCycleStats([period(1, '2026-10-01'), period(2, '2026-10-29')]), TODAY)).toEqual({ ok: false, reason: 'needs-history' });
  });

  it('adds the average cycle length to the latest period start', () => {
    const stats = computeCycleStats([period(1, '2026-09-01'), period(2, '2026-09-29'), period(3, '2026-10-29')]);
    const estimate = estimateNextPeriod(stats, TODAY);
    expect(estimate).toEqual({
      ok: true,
      day: '2026-11-27',
      daysUntil: 2,
      averageCycleDays: 29,
      cyclesUsed: 2,
      earliestDay: '2026-11-26',
      latestDay: '2026-11-28',
    });
  });

  it('reports a negative distance when the estimate has passed', () => {
    const stats = computeCycleStats([period(1, '2026-08-01'), period(2, '2026-08-29'), period(3, '2026-09-26')]);
    const estimate = estimateNextPeriod(stats, TODAY);
    expect(estimate.ok && estimate.day).toBe('2026-10-24');
    expect(estimate.ok && estimate.daysUntil).toBe(-32);
  });
});

describe('dayOfCycle', () => {
  it('counts the start day as day 1 and hides stale values', () => {
    const stats = computeCycleStats([period(1, '2026-11-20')]);
    expect(dayOfCycle(stats, TODAY)).toBe(6);
    expect(dayOfCycle(computeCycleStats([period(1, '2026-08-01')]), TODAY)).toBeNull();
    expect(dayOfCycle(computeCycleStats([]), TODAY)).toBeNull();
  });
});

describe('validatePeriodDraft', () => {
  const draft = (start: string, end = '', flow: 1 | 2 | 3 = 2) => ({ start, end, flow });

  it('accepts a start day alone as an ongoing period', () => {
    expect(validatePeriodDraft(draft(' 2026-11-20 '), TODAY, [], null)).toEqual({ ok: true, value: { startDay: '2026-11-20', endDay: null, flow: 2 } });
  });

  it('accepts an end on or after the start', () => {
    expect(validatePeriodDraft(draft('2026-11-20', '2026-11-20'), TODAY, [], null).ok).toBe(true);
    expect(validatePeriodDraft(draft('2026-11-20', '2026-11-24', 3), TODAY, [], null)).toEqual({
      ok: true,
      value: { startDay: '2026-11-20', endDay: '2026-11-24', flow: 3 },
    });
  });

  it('rejects dates in the future, malformed dates and an end before the start', () => {
    expect(validatePeriodDraft(draft('2026-11-26'), TODAY, [], null)).toEqual({ ok: false, invalid: ['start'] });
    expect(validatePeriodDraft(draft('nope'), TODAY, [], null)).toEqual({ ok: false, invalid: ['start'] });
    expect(validatePeriodDraft(draft('2026-02-30'), TODAY, [], null)).toEqual({ ok: false, invalid: ['start'] });
    expect(validatePeriodDraft(draft('2026-11-20', '2026-11-19'), TODAY, [], null)).toEqual({ ok: false, invalid: ['end'] });
    expect(validatePeriodDraft(draft('2026-11-20', '2026-11-26'), TODAY, [], null)).toEqual({ ok: false, invalid: ['end'] });
    expect(validatePeriodDraft(draft('2026-10-01', '2026-10-16'), TODAY, [], null)).toEqual({ ok: false, invalid: ['end'] });
  });

  it('flags both fields when the start is bad and an end is entered', () => {
    expect(validatePeriodDraft(draft('2027-01-01', '2026-11-20'), TODAY, [], null)).toEqual({ ok: false, invalid: ['start', 'end'] });
  });

  it('rejects overlap with another period but not with the one being edited', () => {
    const existing = [period(1, '2026-11-10', '2026-11-14')];
    expect(validatePeriodDraft(draft('2026-11-12', '2026-11-16'), TODAY, existing, null)).toEqual({ ok: false, invalid: ['overlap'] });
    expect(validatePeriodDraft(draft('2026-11-08', '2026-11-10'), TODAY, existing, null)).toEqual({ ok: false, invalid: ['overlap'] });
    expect(validatePeriodDraft(draft('2026-11-15', '2026-11-18'), TODAY, existing, null).ok).toBe(true);
    expect(validatePeriodDraft(draft('2026-11-10', '2026-11-15'), TODAY, existing, 1).ok).toBe(true);
  });
});

describe('validateSymptomDraft', () => {
  it('needs a symptom and a past or present day', () => {
    expect(validateSymptomDraft({ day: TODAY, symptom: 'cramps', intensity: 2 }, TODAY)).toEqual({
      ok: true,
      value: { day: TODAY, symptom: 'cramps', intensity: 2 },
    });
    expect(validateSymptomDraft({ day: '2026-11-26', symptom: null, intensity: 1 }, TODAY)).toEqual({ ok: false, invalid: ['day', 'symptom'] });
    expect(validateSymptomDraft({ day: '2010-01-01', symptom: 'mood', intensity: 1 }, TODAY)).toEqual({ ok: false, invalid: ['day'] });
  });
});

describe('groupSymptomsByDay', () => {
  it('groups by day, newest day first', () => {
    const entry = (id: number, day: string): SymptomEntry => ({ id, day, symptom: 'mood', intensity: 1, createdAt: id });
    const groups = groupSymptomsByDay([entry(1, '2026-11-01'), entry(2, '2026-11-03'), entry(3, '2026-11-01')]);
    expect(groups.map((group) => group.day)).toEqual(['2026-11-03', '2026-11-01']);
    expect(groups[1]?.entries.map((e) => e.id)).toEqual([1, 3]);
  });
});

describe('pregnancy', () => {
  it('accepts a due date from two weeks ago up to full term ahead and nothing else', () => {
    expect(validateDueDay('2027-03-01', TODAY)).toEqual({ ok: true, dueDay: '2027-03-01' });
    expect(validateDueDay('2026-11-11', TODAY).ok).toBe(true);
    expect(validateDueDay('2026-11-10', TODAY).ok).toBe(false);
    expect(validateDueDay('2027-09-01', TODAY).ok).toBe(true);
    expect(validateDueDay('2027-09-02', TODAY).ok).toBe(false);
    expect(validateDueDay('soon', TODAY).ok).toBe(false);
  });

  it('counts completed weeks and days from the due date', () => {
    expect(pregnancyProgress({ dueDay: '2027-03-01' }, TODAY)).toMatchObject({ stage: 'ongoing', weeks: 26, days: 2, daysToDue: 96, gestationalDays: 184 });
    expect(pregnancyProgress({ dueDay: '2026-11-25' }, TODAY)).toMatchObject({ stage: 'ongoing', weeks: 40, days: 0, daysToDue: 0 });
  });

  it('marks dates before week 0 and after week 42 instead of inventing a week', () => {
    expect(pregnancyProgress({ dueDay: '2027-09-01' }, TODAY)).toMatchObject({ stage: 'ongoing', weeks: 0, days: 0 });
    expect(pregnancyProgress({ dueDay: '2027-09-05' }, TODAY)).toMatchObject({ stage: 'before', weeks: 0, days: 0 });
    expect(pregnancyProgress({ dueDay: '2026-11-11' }, TODAY)).toMatchObject({ stage: 'ongoing', weeks: 42, days: 0 });
    expect(pregnancyProgress({ dueDay: '2026-11-10' }, TODAY).stage).toBe('beyond');
  });
});

describe('timeline and nightly series', () => {
  const days = createFixtureDays(FIXTURE_NOW);

  it('covers exactly the range, oldest first, ending today', () => {
    const timeline = buildTimeline(days, [], TODAY, 30);
    expect(timeline).toHaveLength(30);
    expect(timeline[0]?.day).toBe('2026-10-27');
    expect(timeline[29]?.day).toBe(TODAY);
  });

  it('marks logged period days and keeps the skin temperature deviation per day', () => {
    const timeline = buildTimeline(days, [period(1, '2026-11-20', '2026-11-22', 3), period(2, '2026-11-25')], TODAY, 30);
    const flowDays = timeline.filter((day) => day.flow !== null).map((day) => [day.day, day.flow]);
    expect(flowDays).toEqual([
      ['2026-11-20', 3],
      ['2026-11-21', 3],
      ['2026-11-22', 3],
      ['2026-11-25', 2],
    ]);
    const measured = days.find((record) => record.day === '2026-11-24');
    expect(timeline.find((day) => day.day === '2026-11-24')?.deviationC).toBe(measured?.skinTempDeviationC.value ?? null);
  });

  it('leaves days without a record empty instead of filling them', () => {
    const timeline = buildTimeline([], [], TODAY, 30);
    expect(timeline.every((day) => day.deviationC === null && day.flow === null)).toBe(true);
    expect(nightlySeries([], 'hrv', TODAY, 7).every((point) => point.value === null)).toBe(true);
  });

  it('builds a nightly series for one metric over the range', () => {
    const series = nightlySeries(days, 'restingHr', TODAY, 14);
    expect(series).toHaveLength(14);
    expect(series[13]?.day).toBe(TODAY);
    const record = days.find((d) => d.day === series[12]?.day);
    expect(series[12]?.value).toBe(record?.restingHr.value ?? null);
  });
});

describe('parseTimelineRange', () => {
  it('falls back to 90 days', () => {
    expect(parseTimelineRange('30')).toBe(30);
    expect(parseTimelineRange('7')).toBe(90);
  });
});

describe('cycle phases (estimates)', () => {
  it('splits a cycle into period, follicular, ovulation and a 14-day second half', () => {
    expect(cyclePhases(28, 5)).toEqual([
      { phase: 'menstrual', from: 1, to: 5 },
      { phase: 'follicular', from: 6, to: 12 },
      { phase: 'ovulation', from: 13, to: 15 },
      { phase: 'luteal', from: 16, to: 28 },
    ]);
    expect(cyclePhases(16, 12)[0]).toEqual({ phase: 'menstrual', from: 1, to: 8 });
  });

  it('places today on the wheel from the logs, or on a typical cycle until there is history', () => {
    const logged = computeCycleStats([period(1, '2026-09-01', '2026-09-05'), period(2, '2026-09-29', '2026-10-03'), period(3, '2026-10-29', '2026-11-02')]);
    expect(cycleWheel(logged, '2026-11-12')).toMatchObject({ day: 15, length: 29, typicalLength: false, phase: 'ovulation', daysLeftInPhase: 1, overdue: false });
    expect(cycleWheel(logged, TODAY)).toMatchObject({ day: 28, phase: 'luteal', daysLeftInPhase: 1 });
    expect(cycleWheel(logged, '2026-12-01')).toMatchObject({ day: 34, overdue: true, daysLeftInPhase: 0 });
    const one = computeCycleStats([period(4, '2026-11-09')]);
    expect(cycleWheel(one, TODAY)).toMatchObject({ day: 17, length: 28, typicalLength: true, phase: 'luteal', daysLeftInPhase: 11 });
    expect(cycleWheel(computeCycleStats([]), TODAY)).toBeNull();
  });

  it('counts the fertile window back from the next estimated period', () => {
    const next = estimateNextPeriod(computeCycleStats([period(1, '2026-09-01'), period(2, '2026-09-29'), period(3, '2026-10-27')]), TODAY);
    expect(fertileWindow(next)).toEqual({ from: '2026-11-05', to: '2026-11-11' });
    expect(fertileWindow({ ok: false, reason: 'no-data' })).toBeNull();
  });

  it('takes the newest skin temperature only from recent nights', () => {
    const days = createFixtureDays(FIXTURE_NOW);
    const latest = latestDeviation(days, TODAY, 3);
    expect(latest === null || latest.day >= '2026-11-22').toBe(true);
    expect(latestDeviation(days, '2030-01-01', 3)).toBeNull();
  });

  it('says whether the temperature fits the usual pattern of the phase', () => {
    expect(tempFitsPhase('luteal', 0.3)).toBe('typical');
    expect(tempFitsPhase('luteal', -0.2)).toBe('different');
    expect(tempFitsPhase('follicular', -0.1)).toBe('typical');
    expect(tempFitsPhase('menstrual', 0.4)).toBe('different');
    expect(tempFitsPhase('ovulation', 0.4)).toBeNull();
  });
});

describe('flow for one day', () => {
  const ongoing = period(5, '2026-11-23', null, 2);
  const done = period(6, '2026-10-20', '2026-10-24', 1);

  it('reads the flow of the period that covers the day', () => {
    expect(dayFlow([ongoing, done], TODAY, TODAY)).toBe(2);
    expect(dayFlow([ongoing, done], '2026-10-22', TODAY)).toBe(1);
    expect(dayFlow([ongoing, done], '2026-11-01', TODAY)).toBe(0);
  });

  it('starts a period, extends one that ended the day before, or changes its flow', () => {
    expect(applyDayFlow([], TODAY, 3, TODAY)).toEqual({ kind: 'insert', input: { startDay: TODAY, endDay: null, flow: 3 } });
    expect(applyDayFlow([], '2026-11-10', 1, TODAY)).toEqual({ kind: 'insert', input: { startDay: '2026-11-10', endDay: '2026-11-10', flow: 1 } });
    expect(applyDayFlow([done], '2026-10-25', 1, TODAY)).toEqual({ kind: 'update', id: 6, input: { startDay: '2026-10-20', endDay: '2026-10-25', flow: 1 } });
    expect(applyDayFlow([done], '2026-10-19', 2, TODAY)).toEqual({ kind: 'update', id: 6, input: { startDay: '2026-10-19', endDay: '2026-10-24', flow: 2 } });
    expect(applyDayFlow([ongoing], TODAY, 3, TODAY)).toEqual({ kind: 'update', id: 5, input: { startDay: '2026-11-23', endDay: null, flow: 3 } });
    expect(applyDayFlow([ongoing], TODAY, 2, TODAY)).toEqual({ kind: 'none' });
  });

  it('ends or removes a period when the day has no flow, and leaves the middle of one alone', () => {
    expect(applyDayFlow([ongoing], TODAY, 0, TODAY)).toEqual({ kind: 'update', id: 5, input: { startDay: '2026-11-23', endDay: '2026-11-24', flow: 2 } });
    expect(applyDayFlow([ongoing], '2026-11-23', 0, TODAY)).toEqual({ kind: 'update', id: 5, input: { startDay: '2026-11-24', endDay: null, flow: 2 } });
    expect(applyDayFlow([ongoing], '2026-11-24', 0, TODAY)).toEqual({ kind: 'inside' });
    expect(applyDayFlow([period(7, TODAY)], TODAY, 0, TODAY)).toEqual({ kind: 'delete', id: 7 });
    expect(applyDayFlow([done], '2026-10-24', 0, TODAY)).toEqual({ kind: 'update', id: 6, input: { startDay: '2026-10-20', endDay: '2026-10-23', flow: 1 } });
    expect(applyDayFlow([done], '2026-10-20', 0, TODAY)).toEqual({ kind: 'update', id: 6, input: { startDay: '2026-10-21', endDay: '2026-10-24', flow: 1 } });
    expect(applyDayFlow([done], '2026-10-22', 0, TODAY)).toEqual({ kind: 'inside' });
    expect(applyDayFlow([done], '2026-11-01', 0, TODAY)).toEqual({ kind: 'none' });
    expect(applyDayFlow([], '2026-12-01', 2, TODAY)).toEqual({ kind: 'invalid' });
  });
});
