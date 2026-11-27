import {
  DEFAULT_ALARM_PLAN,
  alarmTask,
  confirmedAlarm,
  nextWakeAt,
  parseAlarmPlan,
  parseArmedAlarm,
  serializeAlarmPlan,
  serializeArmedAlarm,
  shiftMinutes,
  type AlarmPlan,
} from '@/data/alarm';

const local = (day: number, hour: number, minute: number, second = 0): Date => new Date(2026, 10, day, hour, minute, second);
const unix = (date: Date): number => Math.floor(date.getTime() / 1000);
const PLAN: AlarmPlan = { enabled: true, minutes: 7 * 60, mode: 'exact', windowMin: 30 };

describe('nextWakeAt', () => {
  it('takes the next occurrence of the time of day', () => {
    expect(nextWakeAt(7 * 60, local(26, 22, 0))).toBe(unix(local(27, 7, 0)));
    expect(nextWakeAt(23 * 60, local(26, 22, 0))).toBe(unix(local(26, 23, 0)));
  });

  it('moves to tomorrow when the time is less than a minute away', () => {
    expect(nextWakeAt(7 * 60, local(27, 6, 59, 30))).toBe(unix(local(28, 7, 0)));
  });
});

describe('alarmTask', () => {
  it('arms an enabled plan that the band does not hold yet', () => {
    expect(alarmTask(PLAN, null, local(26, 22, 0))).toEqual({ kind: 'arm', wakeAt: unix(local(27, 7, 0)) });
  });

  it('leaves a matching alarm alone, also in the last minute before it rings', () => {
    const armed = { wakeAt: unix(local(27, 7, 0)), armedAt: unix(local(26, 21, 0)), confirmed: true };
    expect(alarmTask(PLAN, armed, local(26, 22, 0))).toEqual({ kind: 'none' });
    expect(alarmTask(PLAN, armed, local(27, 6, 59, 30))).toEqual({ kind: 'none' });
  });

  it('re-arms for the next day once the alarm has passed, and after a time change', () => {
    const armed = { wakeAt: unix(local(27, 7, 0)), armedAt: unix(local(26, 21, 0)), confirmed: true };
    expect(alarmTask(PLAN, armed, local(27, 9, 0))).toEqual({ kind: 'arm', wakeAt: unix(local(28, 7, 0)) });
    expect(alarmTask({ ...PLAN, minutes: 6 * 60 + 30 }, armed, local(26, 22, 0))).toEqual({ kind: 'arm', wakeAt: unix(local(27, 6, 30)) });
  });

  it('treats an alarm that was sent but never confirmed as possibly armed', () => {
    const attempt = { wakeAt: unix(local(27, 7, 0)), armedAt: unix(local(26, 21, 0)), confirmed: false };
    expect(alarmTask(PLAN, attempt, local(26, 22, 0))).toEqual({ kind: 'arm', wakeAt: unix(local(27, 7, 0)) });
    expect(alarmTask({ ...PLAN, enabled: false }, attempt, local(26, 22, 0))).toEqual({ kind: 'cancel' });
    expect(confirmedAlarm(attempt, unix(local(26, 22, 0)))).toBeNull();
    expect(confirmedAlarm({ ...attempt, confirmed: true }, unix(local(26, 22, 0)))).not.toBeNull();
  });

  it('keeps the wall-clock time across a daylight saving change', () => {
    const before = new Date(2026, 2, 28, 22, 0);
    const wake = new Date(nextWakeAt(7 * 60, before) * 1000);
    expect([wake.getDate(), wake.getHours(), wake.getMinutes()]).toEqual([29, 7, 0]);
  });

  it('cancels a pending alarm when the plan is off, and does nothing after it rang', () => {
    const armed = { wakeAt: unix(local(27, 7, 0)), armedAt: unix(local(26, 21, 0)), confirmed: true };
    const off = { ...PLAN, enabled: false };
    expect(alarmTask(off, armed, local(26, 22, 0))).toEqual({ kind: 'cancel' });
    expect(alarmTask(off, armed, local(27, 8, 0))).toEqual({ kind: 'none' });
    expect(alarmTask(off, null, local(26, 22, 0))).toEqual({ kind: 'none' });
  });
});

describe('stored alarm state', () => {
  it('round-trips the plan and falls back to the default for anything damaged', () => {
    expect(parseAlarmPlan(serializeAlarmPlan(PLAN))).toEqual(PLAN);
    expect(parseAlarmPlan(null)).toEqual(DEFAULT_ALARM_PLAN);
    expect(parseAlarmPlan('{nope')).toEqual(DEFAULT_ALARM_PLAN);
    expect(parseAlarmPlan(JSON.stringify({ ...PLAN, minutes: 1440 }))).toEqual(DEFAULT_ALARM_PLAN);
    expect(parseAlarmPlan(JSON.stringify({ ...PLAN, mode: 'snooze' }))).toEqual(DEFAULT_ALARM_PLAN);
    expect(parseAlarmPlan(JSON.stringify({ ...PLAN, windowMin: 10 }))).toEqual(DEFAULT_ALARM_PLAN);
  });

  it('round-trips the armed alarm and rejects damaged values', () => {
    const armed = { wakeAt: 1_800_000_000, armedAt: 1_799_990_000, confirmed: false };
    expect(parseArmedAlarm(serializeArmedAlarm(armed))).toEqual(armed);
    expect(parseArmedAlarm(JSON.stringify({ wakeAt: 1_800_000_000, armedAt: 1_799_990_000 }))).toEqual({ ...armed, confirmed: true });
    expect(parseArmedAlarm(JSON.stringify({ ...armed, confirmed: 'yes' }))).toBeNull();
    expect(parseArmedAlarm(null)).toBeNull();
    expect(parseArmedAlarm(JSON.stringify({ wakeAt: 'soon', armedAt: 1 }))).toBeNull();
    expect(parseArmedAlarm(JSON.stringify({ wakeAt: 0, armedAt: 1 }))).toBeNull();
  });

  it('wraps the time of day', () => {
    expect(shiftMinutes(5, -15)).toBe(1430);
    expect(shiftMinutes(1430, 15)).toBe(5);
  });
});
