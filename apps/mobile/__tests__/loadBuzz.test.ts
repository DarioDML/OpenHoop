import { createFixtureDays } from '@/data/fixtureSource';
import { hudFor, IDLE_SESSION, liveReducer } from '@/data/liveSession';
import { defaultLoadBuzzPrefs, loadBuzzDecision, parseLoadBuzzPrefs, setLoadBuzz, type LoadBuzzPrefs } from '@/data/loadBuzz';
import { defaultUserData, parseUserData, serializeUserData } from '@/data/userData';

import { FIXTURE_NOW } from './support/appData';

const NOW_S = Date.UTC(2026, 10, 27, 15) / 1000;
const TZ = 3_600;
const TODAY = '2026-11-27';
const AIM = { low: 7.6, high: 15.6 };
const ON: LoadBuzzPrefs = { atTarget: true, overTop: true, lastTarget: null, lastTop: null };

function decide(prefs: LoadBuzzPrefs, load: number | null, day: string | null = TODAY, aim: typeof AIM | null = AIM) {
  return loadBuzzDecision({ prefs, load, aim, day, nowS: NOW_S, tzOffsetS: TZ });
}

describe('load buzz preferences', () => {
  it('defaults both switches off and parses stored values safely', () => {
    expect(defaultLoadBuzzPrefs()).toEqual({ atTarget: false, overTop: false, lastTarget: null, lastTop: null });
    expect(parseLoadBuzzPrefs(undefined)).toEqual(defaultLoadBuzzPrefs());
    expect(parseLoadBuzzPrefs({ atTarget: true, overTop: 'yes', lastTarget: TODAY, lastTop: '27-11-2026' })).toEqual({
      atTarget: true,
      overTop: false,
      lastTarget: TODAY,
      lastTop: null,
    });
  });

  it('keeps the switches and last-buzzed days in user data', () => {
    const data = { ...defaultUserData(), loadBuzz: { ...ON, lastTarget: TODAY } };
    expect(parseUserData(serializeUserData(data)).loadBuzz).toEqual({ ...ON, lastTarget: TODAY });
    expect(parseUserData(JSON.stringify({ loadBuzz: 4 })).loadBuzz).toEqual(defaultLoadBuzzPrefs());
    expect(parseUserData(null).loadBuzz).toEqual(defaultLoadBuzzPrefs());
  });
});

describe('loadBuzzDecision', () => {
  it('does nothing below the target or without a target', () => {
    expect(decide(ON, 7.5)).toBeNull();
    expect(decide(ON, 9, TODAY, null)).toBeNull();
    expect(decide(ON, null)).toBeNull();
    expect(decide(ON, Number.NaN)).toBeNull();
  });

  it('buzzes once when the load first reaches the lower end of the target', () => {
    const decision = decide(ON, 7.6);
    expect(decision).toEqual({ thresholds: ['target'], kind: 'target', next: { ...ON, lastTarget: TODAY } });
    expect(decide(decision?.next ?? ON, 9)).toBeNull();
  });

  it('buzzes again on a new day', () => {
    expect(decide({ ...ON, lastTarget: '2026-11-26' }, 8)?.thresholds).toEqual(['target']);
  });

  it('only runs for the open day by the clock', () => {
    expect(decide(ON, 9, '2026-11-26')).toBeNull();
    expect(loadBuzzDecision({ prefs: ON, load: 9, aim: AIM, day: '2026-11-28', nowS: NOW_S, tzOffsetS: 9 * TZ })?.thresholds).toEqual(['target']);
  });

  it('warns once when the load passes the top of the target', () => {
    const decision = decide({ ...ON, lastTarget: TODAY }, 15.7);
    expect(decision).toEqual({ thresholds: ['top'], kind: 'top', next: { ...ON, lastTarget: TODAY, lastTop: TODAY } });
    expect(decide(decision?.next ?? ON, 18)).toBeNull();
    expect(decide({ ...ON, lastTarget: TODAY }, 15.6)).toBeNull();
  });

  it('marks both thresholds with one buzz when a sync jumps past the top', () => {
    const decision = decide(ON, 17);
    expect(decision?.thresholds).toEqual(['target', 'top']);
    expect(decision?.kind).toBe('top');
    expect(decision?.next).toEqual({ ...ON, lastTarget: TODAY, lastTop: TODAY });
  });

  it('respects each switch on its own', () => {
    expect(decide({ ...ON, atTarget: false }, 9)).toBeNull();
    expect(decide({ ...ON, atTarget: false }, 17)?.thresholds).toEqual(['top']);
    expect(decide({ ...ON, overTop: false }, 17)?.thresholds).toEqual(['target']);
    expect(decide(defaultLoadBuzzPrefs(), 17)).toBeNull();
  });
});

describe('setLoadBuzz', () => {
  it('does not buzz for a threshold that was already passed when the switch goes on', () => {
    const off = defaultLoadBuzzPrefs();
    expect(setLoadBuzz(off, 'target', true, 9, AIM, TODAY)).toEqual({ ...off, atTarget: true, lastTarget: TODAY });
    expect(setLoadBuzz(off, 'target', true, 5, AIM, TODAY)).toEqual({ ...off, atTarget: true });
    expect(setLoadBuzz(off, 'top', true, 16, AIM, TODAY)).toEqual({ ...off, overTop: true, lastTop: TODAY });
    expect(setLoadBuzz(off, 'top', true, null, AIM, TODAY)).toEqual({ ...off, overTop: true });
    expect(setLoadBuzz({ ...ON, lastTarget: TODAY }, 'target', false, 9, AIM, TODAY)).toEqual({ ...ON, atTarget: false, lastTarget: TODAY });
  });
});

describe('live day load', () => {
  it('projects from the load so far on an open day', () => {
    const day = createFixtureDays(FIXTURE_NOW).at(-1);
    if (day === undefined) throw new Error('fixture');
    const open = { ...day, load: { ...day.load, value: null, reason: 'low-coverage' }, loadSoFar: 4 };
    let session = liveReducer(IDLE_SESSION, { kind: 'start', at: day.end });
    for (let i = 0; i < 300; i++) session = liveReducer(session, { kind: 'beat', at: day.end + i, hr: 160 });
    const hud = hudFor(session, day.end + 300, 160, { rest: 60, max: 190 }, open);
    expect(hud.projectedDayLoad).toBeGreaterThan(4);
  });
});
