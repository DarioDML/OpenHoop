import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { consoleLinesCsv, exportCsv } from '@openhoop/core';
import type { ExportTable } from '@openhoop/core';
import { CliError, UsageError } from '../args';
import type { Command, CommandResult } from '../command';
import type { Context } from '../context';

const TABLES: readonly ExportTable[] = [
  'devices',
  'samples_1hz',
  'daily_metrics',
  'sleeps',
  'sleep_stages',
  'workouts',
  'events',
  'battery_pack_events',
  'console_log',
  'raw_chunks',
];
const DATABASE_NAME = 'openhoop.db';

async function run(ctx: Context): Promise<CommandResult> {
  const dirText = ctx.args.string('dir');
  if (dirText === undefined || dirText.length === 0 || dirText.includes('\0')) throw new UsageError('export needs --dir <path>');
  if (ctx.dbPath === ':memory:') throw new CliError('there is nothing to export from an in-memory database');
  const dir = resolve(dirText);
  const store = await ctx.store();
  await mkdir(dir, { recursive: true });
  const target = join(dir, DATABASE_NAME);
  if (resolve(target) === resolve(ctx.dbPath)) throw new CliError('--dir must not be the folder that holds the live database');

  await rm(target, { force: true });
  await store.driver.run('VACUUM INTO ?', [target]);
  const files: { file: string; bytes: number }[] = [{ file: target, bytes: (await stat(target)).size }];
  for (const table of TABLES) {
    const csv = await exportCsv(store, table);
    const file = join(dir, `${table}.csv`);
    await writeFile(file, csv, 'utf8');
    files.push({ file, bytes: Buffer.byteLength(csv) });
  }
  const linesCsv = await consoleLinesCsv(store);
  const linesFile = join(dir, 'console_lines.csv');
  await writeFile(linesFile, linesCsv, 'utf8');
  files.push({ file: linesFile, bytes: Buffer.byteLength(linesCsv) });
  for (const { file, bytes } of files) ctx.log(`${file}  ${bytes} bytes`);
  ctx.log(`Exported ${files.length} files to ${dir}`);
  return { json: { dir, files } };
}

export const exportCommand: Command = {
  name: 'export',
  summary: 'Write a copy of the database and one CSV file per table',
  usage: ['export --dir <path>'],
  options: { dir: { type: 'string' } },
  bluetooth: false,
  run,
};
