import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STRESS_WINDOW_S, parseStressDay, stressLevel, stressSummary } from '@openhoop/analytics';
import type { Profile } from '@openhoop/analytics';
import { Session, openStore, recomputeDays, syncHistory } from '@openhoop/core';
import type { Clock, DayRecord, Store } from '@openhoop/core';
import { openNodeDriver } from '@openhoop/core/node';
import { SimBand } from '../src/index';

const NOW_S = Date.UTC(2027, 0, 15, 12, 0, 0) / 1000;
const DAY_S = 86_400;
const TZ_S = 3_600;
const HISTORY_DAYS = 7;
const POST_WORKOUT_S = 1_800;
const PROFILE: Profile = { maxHr: 190, birthYear: null, restingHr: null };

describe('stress on a week of the simulated band', () => {
  let store: Store;
  let days: DayRecord[];

  beforeAll(async () => {
    store = await openStore(openNodeDriver(':memory:'));
    const device = await store.upsertDevice({
      bleId: 'sim:7',
      name: 'WHOOP SIM',
      model: '5.0',
      firmware: '50.38.1.0',
      serial: 'SIM-7',
      ownerSince: NOW_S - 365 * DAY_S,
      configSnapshot: null,
    });
    const band = new SimBand({ seed: 7, now: () => NOW_S, historyDays: HISTORY_DAYS, liveIntervalMs: 20 });
    const [found] = await band.scan(1000);
    if (found === undefined) throw new Error('simulated band not found');
    await band.connect(found.id);
    await band.bond();
    const clock: Clock = {
      now: () => NOW_S * 1000,
      schedule: (ms, fn) => {
        const handle = setTimeout(fn, Math.max(1, ms));
        return () => clearTimeout(handle);
      },
    };
    const session = new Session(band, { clock });
    await session.open();
    try {
      const result = await syncHistory(session, store, { deviceId: device.id, idleTimeoutMs: 15_000 });
      if (result.stoppedBy !== 'complete') throw new Error(`sync stopped by ${result.stoppedBy}`);
    } finally {
      await session.close();
    }
    days = await recomputeDays(store, { deviceId: device.id, from: 0, to: NOW_S + DAY_S, profile: PROFILE, tzOffsetS: TZ_S });
  }, 240_000);

  afterAll(async () => {
    await store.driver.close();
  });

  it('stores a valid stress day on every record, calibrating until three days have a baseline', () => {
    expect(days.length).toBeGreaterThanOrEqual(HISTORY_DAYS);
    const parsed = days.map((d) => parseStressDay(d.stress));
    expect(parsed.every((s) => s !== null)).toBe(true);
    const firstScored = parsed.findIndex((s) => s?.reason === null);
    expect(firstScored).toBeGreaterThanOrEqual(3);
    expect(parsed.slice(0, firstScored).every((s) => s?.reason === 'needs-history' || s?.reason === 'low-coverage')).toBe(true);
    const complete = days.filter((d) => d.end - d.start >= 20 * 3_600).slice(4);
    expect(complete.length).toBeGreaterThanOrEqual(2);
    for (const day of complete) expect(day.stress?.reason).toBeNull();
  });

  it('never scores a window during sleep, a workout or the half hour after it', () => {
    for (const day of days) {
      for (const w of day.stress?.windows ?? []) {
        const end = w.t + STRESS_WINDOW_S;
        for (const p of day.sleep.periods) expect(end <= p.onset || w.t > p.offset).toBe(true);
        for (const workout of day.workouts) expect(end <= workout.start || w.t > workout.end + POST_WORKOUT_S).toBe(true);
      }
    }
    expect(days.some((d) => d.workouts.length > 0)).toBe(true);
  });

  it('reads the calm simulated physiology as mostly low, with HRV where beat intervals exist', () => {
    const totals = { low: 0, medium: 0, high: 0 };
    let withHrv = 0;
    let scored = 0;
    for (const day of days) {
      const stress = parseStressDay(day.stress);
      if (stress === null || stress.reason !== null) continue;
      const summary = stressSummary(stress);
      totals.low += summary.seconds.low;
      totals.medium += summary.seconds.medium;
      totals.high += summary.seconds.high;
      expect(summary.latest).not.toBeNull();
      for (const w of stress.windows) {
        if (w.score === null) continue;
        scored++;
        if (w.rmssd !== null) withHrv++;
        expect(['low', 'medium', 'high']).toContain(stressLevel(w.score));
      }
    }
    const total = totals.low + totals.medium + totals.high;
    expect(total).toBeGreaterThan(0);
    expect(totals.low / total).toBeGreaterThan(0.6);
    expect(withHrv).toBeGreaterThan(0);
    expect(withHrv).toBeLessThan(scored);
  });
});
