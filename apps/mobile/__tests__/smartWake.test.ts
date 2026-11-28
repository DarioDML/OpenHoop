import { DEFAULT_ALARM_PLAN } from '@/data/alarm';
import { CHECK_EVERY_S, GOAL_WINDOW_S, REARM_AFTER_S, rearmDue, smartWakeDecision, wakeJob, windowStart, type RecentEpoch, type SmartWakeInput } from '@/data/smartWake';

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

describe('wakeJob', () => {
  const plan = { ...DEFAULT_ALARM_PLAN, enabled: true, days: [1, 2, 3, 4, 5] };
  const armed = { wakeAt: WAKE, armedAt: WAKE - 3600 * 8, confirmed: true, rangEarlyAt: null };
  const now = WAKE - 3600 * 6;

  it('wakes the phone after an exact ring to set the next alarm', () => {
    expect(wakeJob(plan, armed, now, true)).toEqual({ kind: 'rearm', at: WAKE + REARM_AFTER_S });
  });

  it('checks the night first for a smart alarm, and re-arms once it rang early', () => {
    expect(wakeJob({ ...plan, mode: 'window', windowMin: 30 }, armed, now, true)).toEqual({ kind: 'smart', at: WAKE - 1800 });
    expect(wakeJob({ ...plan, mode: 'goal' }, { ...armed, rangEarlyAt: WAKE - 600 }, now, true)).toEqual({ kind: 'rearm', at: WAKE + REARM_AFTER_S });
  });

  it('schedules nothing without the scheduler, an armed alarm or an enabled plan', () => {
    expect(wakeJob(plan, armed, now, false)).toBeNull();
    expect(wakeJob(plan, null, now, true)).toBeNull();
    expect(wakeJob({ ...plan, enabled: false }, armed, now, true)).toBeNull();
    expect(wakeJob(plan, { ...armed, confirmed: false }, now, true)).toBeNull();
    expect(wakeJob(plan, armed, WAKE + 10, true)).toBeNull();
  });

  it('knows when a passed alarm needs the next one', () => {
    expect(rearmDue(plan, armed, WAKE + 200)).toBe(true);
    expect(rearmDue(plan, armed, WAKE - 200)).toBe(false);
    expect(rearmDue({ ...plan, enabled: false }, armed, WAKE + 200)).toBe(false);
  });
});
