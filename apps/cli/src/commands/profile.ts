import type { Profile } from '@stoop/analytics';
import type { Command, CommandResult } from '../command';
import type { Context } from '../context';

function describe(profile: Profile): string[] {
  return [
    `birth year: ${profile.birthYear ?? 'not set'}`,
    `max heart rate: ${profile.maxHr === null ? 'not set (derived from age when a birth year is set)' : `${profile.maxHr} bpm`}`,
    `resting heart rate: ${profile.restingHr === null ? 'not set (measured from your nights)' : `${profile.restingHr} bpm`}`,
  ];
}

async function run(ctx: Context): Promise<CommandResult> {
  const year = new Date(ctx.nowMs()).getFullYear();
  const birthYear = ctx.args.int('birth-year', 1900, year - 5);
  const maxHr = ctx.args.int('max-hr', 120, 230);
  const restingHr = ctx.args.int('resting-hr', 25, 120);
  const current = await ctx.loadProfile();
  const changed = birthYear !== undefined || maxHr !== undefined || restingHr !== undefined;
  const profile: Profile = {
    birthYear: birthYear ?? current.birthYear,
    maxHr: maxHr ?? current.maxHr,
    restingHr: restingHr ?? current.restingHr,
  };
  if (changed) {
    await ctx.saveProfile(profile);
    ctx.log('Profile saved. `recompute` applies it to existing days.');
  }
  for (const line of describe(profile)) ctx.log(line);
  return { json: { profile, saved: changed } };
}

export const profileCommand: Command = {
  name: 'profile',
  summary: 'Show or set the profile used for heart-rate zones and load',
  usage: ['profile [--birth-year y] [--max-hr n] [--resting-hr n]'],
  options: { 'birth-year': { type: 'string' }, 'max-hr': { type: 'string' }, 'resting-hr': { type: 'string' } },
  bluetooth: false,
  run,
};
