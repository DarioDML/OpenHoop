import type { DayRecord } from '@openhoop/core';

import { createFixtureDays } from '@/data/fixtureSource';
import { defaultLoadBuzzPrefs, type LoadBuzzPrefs, type LoadBuzzThreshold } from '@/data/loadBuzz';
import { LOAD_BUZZ_RETRY_MS, LoadBuzzRunner, type LoadBuzzDays } from '@/data/loadBuzzRunner';
import { aimAt } from '@/data/loadDerived';

import { FIXTURE_NOW } from './support/appData';

const TZ = 3_600;
const fixture = createFixtureDays(FIXTURE_NOW);

function withLoad(value: number | null, soFar: number | null = null): DayRecord[] {
  const last = fixture[fixture.length - 1];
  if (last === undefined) throw new Error('fixture');
  return [...fixture.slice(0, -1), { ...last, load: { ...last.load, value, reason: value === null ? 'low-coverage' : null }, loadSoFar: soFar }];
}

interface Fake {
  runner: LoadBuzzRunner;
  buzzes: LoadBuzzThreshold[];
  saves: LoadBuzzDays[];
  state: { connected: boolean; syncing: boolean; nowMs: number; buzzOk: boolean; saveOk: boolean; prefs: LoadBuzzPrefs; days: DayRecord[] };
  release: () => void;
}

function fake(days: DayRecord[], hold = false): Fake {
  const last = days[days.length - 1];
  if (last === undefined) throw new Error('fixture');
  const state = {
    connected: true,
    syncing: false,
    nowMs: (last.start + 12 * 3_600) * 1000,
    buzzOk: true,
    saveOk: true,
    prefs: { ...defaultLoadBuzzPrefs(), atTarget: true, overTop: true },
    days,
  };
  const buzzes: LoadBuzzThreshold[] = [];
  const saves: LoadBuzzDays[] = [];
  let release = (): void => undefined;
  const gate = hold ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();
  const runner = new LoadBuzzRunner({
    connected: () => state.connected,
    syncing: () => state.syncing,
    days: () => state.days,
    prefs: () => state.prefs,
    buzz: async (kind) => {
      buzzes.push(kind);
      await gate;
      return state.buzzOk;
    },
    save: async (dayKeys) => {
      saves.push(dayKeys);
      if (state.saveOk) state.prefs = { ...state.prefs, ...dayKeys };
      return state.saveOk;
    },
    nowMs: () => state.nowMs,
    tzOffsetS: () => TZ,
  });
  return { runner, buzzes, saves, state, release: () => release() };
}

const days = withLoad(20.5);
const today = days[days.length - 1]?.day ?? '';

describe('LoadBuzzRunner', () => {
  it('buzzes through the band once and stores the day per threshold', async () => {
    const f = fake(days);
    await f.runner.check(f.runner.todayLoad());
    expect(f.buzzes).toEqual(['top']);
    expect(f.saves).toEqual([{ lastTarget: today, lastTop: today }]);
    await f.runner.check(f.runner.todayLoad());
    expect(f.buzzes).toEqual(['top']);
  });

  it('only buzzes while the band is already connected and no sync runs', async () => {
    const f = fake(days);
    f.state.connected = false;
    await f.runner.check(20.5);
    f.state.connected = true;
    f.state.syncing = true;
    await f.runner.check(20.5);
    expect(f.buzzes).toEqual([]);
    f.state.syncing = false;
    await f.runner.check(20.5);
    expect(f.buzzes).toEqual(['top']);
  });

  it('backs off for a minute when the band refuses the buzz and saves nothing', async () => {
    const f = fake(days);
    f.state.buzzOk = false;
    await f.runner.check(20.5);
    expect(f.saves).toEqual([]);
    f.state.buzzOk = true;
    await f.runner.check(20.5);
    expect(f.buzzes).toEqual(['top']);
    f.state.nowMs += LOAD_BUZZ_RETRY_MS - 1;
    await f.runner.check(20.5);
    expect(f.buzzes).toEqual(['top']);
    f.state.nowMs += 1;
    await f.runner.check(20.5);
    expect(f.buzzes).toEqual(['top', 'top']);
    expect(f.state.prefs.lastTop).toBe(today);
  });

  it('treats a failed save as a failure, so it backs off instead of buzzing on every tick', async () => {
    const f = fake(days);
    f.state.saveOk = false;
    await f.runner.check(20.5);
    await f.runner.check(20.5);
    expect(f.buzzes).toEqual(['top']);
    expect(f.state.prefs.lastTop).toBeNull();
    f.state.saveOk = true;
    f.state.nowMs += LOAD_BUZZ_RETRY_MS;
    await f.runner.check(20.5);
    expect(f.buzzes).toEqual(['top', 'top']);
    expect(f.state.prefs.lastTop).toBe(today);
  });

  it('backs off when the band action throws', async () => {
    const f = fake(days);
    let calls = 0;
    const runner = new LoadBuzzRunner({
      connected: () => true,
      syncing: () => false,
      days: () => days,
      prefs: () => f.state.prefs,
      buzz: () => {
        calls++;
        return Promise.reject(new Error('gone'));
      },
      save: async () => true,
      nowMs: () => f.state.nowMs,
      tzOffsetS: () => TZ,
    });
    await expect(runner.check(20.5)).resolves.toBeUndefined();
    await runner.check(20.5);
    expect(calls).toBe(1);
    f.state.nowMs += LOAD_BUZZ_RETRY_MS;
    await runner.check(20.5);
    expect(calls).toBe(2);
  });

  it('runs one buzz at a time', async () => {
    const f = fake(days, true);
    const first = f.runner.check(20.5);
    const second = f.runner.check(20.5);
    expect(second).toBe(first);
    f.release();
    await first;
    expect(f.buzzes).toEqual(['top']);
  });

  it('buzzes at the lower end of the target from the load so far', async () => {
    const list = withLoad(null);
    const aim = aimAt(list, list.length - 1);
    const open = withLoad(null, (aim?.low ?? 0) + 0.1);
    const f = fake(open);
    f.state.prefs = { ...f.state.prefs, overTop: false };
    expect(f.runner.todayLoad()).toBeCloseTo((aim?.low ?? 0) + 0.1, 6);
    await f.runner.check(f.runner.todayLoad());
    expect(f.buzzes).toEqual(['target']);
    expect(f.saves).toEqual([{ lastTarget: today, lastTop: null }]);
  });

  it('passes live loads on and ignores values that are not numbers', async () => {
    const f = fake(days);
    expect(f.runner.live(Number.NaN)).toBeNull();
    expect(f.runner.live(null)).toBeNull();
    expect(f.buzzes).toEqual([]);
    expect(f.runner.live(20.5)).toBe(20.5);
    await f.runner.check(20.5);
    expect(f.buzzes).toEqual(['top']);
  });
});
