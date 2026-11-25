import type { DayRecord, Derived } from '@stoop/core';
import type { Command, CommandResult } from '../command';
import type { Context } from '../context';
import { chooseStored } from '../devices';
import { formatDuration, table } from '../format';

const DEFAULT_LAST = 14;

function cell(derived: Derived, digits = 0): string {
  return derived.value === null ? '-' : derived.value.toFixed(digits);
}

function sleepDuration(day: DayRecord): string {
  return day.sleep.asleepS === null ? '-' : formatDuration(day.sleep.asleepS);
}

function missing(day: DayRecord): string[] {
  const entries: [string, Derived][] = [
    ['readiness', day.readiness],
    ['load', day.load],
    ['sleep score', day.sleep.score],
    ['HRV', day.hrv],
    ['resting HR', day.restingHr],
  ];
  const notes = entries
    .filter(([, derived]) => derived.value === null)
    .map(([name, derived]) => `${name}: ${derived.reason ?? 'no value'}`);
  if (day.sleep.asleepS === null) notes.push('sleep duration: no main night found');
  return notes;
}

export function summarizeDay(day: DayRecord): Record<string, unknown> {
  return {
    day: day.day,
    readiness: day.readiness,
    readinessCalibrating: day.readinessCalibrating,
    load: day.load,
    sleepScore: day.sleep.score,
    hrv: day.hrv,
    restingHr: day.restingHr,
    sleepAsleepS: day.sleep.asleepS,
    flags: day.flags,
  };
}

async function run(ctx: Context): Promise<CommandResult> {
  const last = ctx.args.int('last', 1, 3650) ?? DEFAULT_LAST;
  const store = await ctx.store();
  const device = chooseStored(await store.listDevices(), ctx.deviceSelector);
  const all = await store.listDays(device.id, '0000-01-01', '9999-12-31');
  const days = all.slice(-last);
  if (days.length === 0) {
    ctx.log('No day records yet. Run `recompute`, `sync` or `sim --days 3` first.');
    return { json: { deviceId: device.id, days: [] } };
  }
  const rows = days.map((day) => [
    day.day,
    `${cell(day.readiness)}${day.readinessCalibrating && day.readiness.value !== null ? '*' : ''}`,
    cell(day.load, 1),
    cell(day.sleep.score),
    cell(day.hrv),
    cell(day.restingHr),
    sleepDuration(day),
  ]);
  for (const line of table(['Date', 'Readiness', 'Load', 'Sleep score', 'HRV ms', 'Resting HR', 'Slept'], rows, [1, 2, 3, 4, 5, 6])) {
    ctx.log(line);
  }
  if (days.some((d) => d.readinessCalibrating && d.readiness.value !== null)) {
    ctx.log('* readiness is still calibrating (first nights)');
  }
  const gaps = days.flatMap((day) => {
    const notes = [...missing(day), ...day.flags.map((flag) => `flag: ${flag}`)];
    return notes.length === 0 ? [] : [`${day.day}  ${notes.join('; ')}`];
  });
  if (gaps.length > 0) {
    ctx.log('\nMissing values and flags:');
    for (const gap of gaps) ctx.log(`  ${gap}`);
  }
  return { json: { deviceId: device.id, days } };
}

export const daysCommand: Command = {
  name: 'days',
  summary: 'Show day records: readiness, load, sleep, HRV, resting heart rate',
  usage: ['days [--last n]'],
  options: { last: { type: 'string' } },
  bluetooth: false,
  run,
};
