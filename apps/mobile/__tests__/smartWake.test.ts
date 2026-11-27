import { CHECK_EVERY_S, GOAL_WINDOW_S, smartWakeDecision, windowStart, type RecentEpoch, type SmartWakeInput } from '@/data/smartWake';

const WAKE = 1_800_000_000;
const base: SmartWakeInput = { mode: 'window', wakeAt: WAKE, windowMin: 30, nowS: WAKE - 20 * 60, recent: null, awake: false, asleepS: null, needS: null };
const epoch = (t: number, wake: number, light: number): RecentEpoch => ({ t, wake, light });

describe('smartWakeDecision', () => {
  it('waits for the start of the window', () => {
    expect(smartWakeDecision({ ...base, nowS: WAKE - 3600 })).toEqual({ kind: 'check', at: WAKE - 1800 });
    expect(windowStart('goal', WAKE, 30)).toBe(WAKE - GOAL_WINDOW_S);
  });

  it('rings at a light moment in the window', () => {
    const now = base.nowS;
    expect(smartWakeDecision({ ...base, recent: [epoch(now - 60, 0.2, 0.5), epoch(now - 30, 0.1, 0.6)] })).toEqual({ kind: 'ring', reason: 'light' });
  });

  it('keeps checking during deep or REM sleep and leaves the last minutes to the band', () => {
    const now = base.nowS;
    expect(smartWakeDecision({ ...base, recent: [epoch(now - 60, 0.05, 0.2), epoch(now - 30, 0.05, 0.25)] })).toEqual({ kind: 'check', at: now + CHECK_EVERY_S });
    expect(smartWakeDecision({ ...base, nowS: WAKE - 200 })).toEqual({ kind: 'check', at: WAKE - 120 });
    expect(smartWakeDecision({ ...base, nowS: WAKE - 100 })).toEqual({ kind: 'band' });
  });

  it('ignores stale or too few epochs', () => {
    const now = base.nowS;
    expect(smartWakeDecision({ ...base, recent: [epoch(now - 3600, 0.9, 0.1), epoch(now - 3570, 0.9, 0.1)] }).kind).toBe('check');
    expect(smartWakeDecision({ ...base, recent: [epoch(now - 30, 0.9, 0.1)] }).kind).toBe('check');
  });

  it('rings in the window when the band says the wearer is already awake', () => {
    expect(smartWakeDecision({ ...base, awake: true })).toEqual({ kind: 'ring', reason: 'awake' });
    expect(smartWakeDecision({ ...base, awake: true, nowS: WAKE - 3600 }).kind).toBe('check');
  });

  it('rings once the sleep need is met in goal mode', () => {
    const goal: SmartWakeInput = { ...base, mode: 'goal', nowS: WAKE - 3600, needS: 8 * 3600 };
    expect(smartWakeDecision({ ...goal, asleepS: 7.5 * 3600 }).kind).toBe('check');
    expect(smartWakeDecision({ ...goal, asleepS: 8 * 3600 })).toEqual({ kind: 'ring', reason: 'goal' });
    expect(smartWakeDecision({ ...goal, asleepS: 9 * 3600, needS: null }).kind).toBe('check');
  });
});
