import { MAX_CLOCK_OFFSET_S } from '@stoop/core';
import type { Command, CommandResult } from '../command';
import type { Context } from '../context';

const GLOBAL_HELP = [
  'Options for every command:',
  '  --sim[=seed]       use the simulated band instead of Bluetooth (default seed 1)',
  '  --sim-locked       simulated band behaves like firmware 50.43+ (answers, sends no data)',
  '  --sim-firmware <v> simulated firmware version, e.g. 50.38.1.0',
  '  --sim-days <n>     days of history on the simulated band (0-30, default 1)',
  '  --sim-bond-refused simulated band refuses to bond',
  '  --sim-clock-offset <s> simulated band clock runs this many seconds ahead (negative: behind)',
  '  --db <path>        database file (default ./stoop-data/stoop.db)',
  '  --device <x>       pick a device by id or name fragment',
  '  --json             print exactly one JSON document on stdout; progress goes to stderr',
];

export function helpLines(commands: readonly Command[]): string[] {
  const rows = commands.flatMap((c) => c.usage.map((u) => `  ${u}`));
  return [
    'stoop: a local workbench for a WHOOP 5.0 / MG band',
    '',
    'Usage: npm run stoop -- <command> [options]',
    '',
    'Commands:',
    ...rows,
    '  help',
    '',
    ...commands.map((c) => `  ${c.name.padEnd(10)} ${c.summary}`),
    '',
    ...GLOBAL_HELP,
    '',
    'sync options:',
    '  --owner-since <d>  the date the band became yours; older history is discarded, not stored',
    `  --ignore-clock     sync even when the band clock is unset or more than ${MAX_CLOCK_OFFSET_S} s off; nothing is`,
    '                     filtered by date, so records from before you owned the band may be stored',
    `sync stops without reading any history when the band clock is unset or more than ${MAX_CLOCK_OFFSET_S} s off.`,
    '',
    'Commands that use Bluetooth print "Bluetooth path: UNTESTED until day 1" unless --sim is given.',
    'Stoop never tries to get around the firmware 50.43+ data lock. `triage` is read-only.',
  ];
}

export function makeHelp(all: () => readonly Command[]): Command {
  return {
    name: 'help',
    summary: 'Show this help',
    usage: [],
    options: {},
    bluetooth: false,
    async run(ctx: Context): Promise<CommandResult> {
      const lines = helpLines(all());
      for (const line of lines) ctx.log(line);
      return { json: { help: lines } };
    },
  };
}
