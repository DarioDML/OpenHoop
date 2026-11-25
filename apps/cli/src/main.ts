import { pathToFileURL } from 'node:url';
import { CliError, UsageError, parseCommandLine } from './args';
import type { Command } from './command';
import { decode } from './commands/decode';
import { daysCommand } from './commands/days';
import { exportCommand } from './commands/export';
import { makeHelp, helpLines } from './commands/help';
import { live } from './commands/live';
import { profileCommand } from './commands/profile';
import { recompute } from './commands/recompute';
import { sim } from './commands/sim';
import { sync } from './commands/sync';
import { triage } from './commands/triage';
import { BLUETOOTH_NOTICE, createContext } from './context';
import type { Sink } from './context';
import { errorMessage } from './format';

const WORKING: readonly Command[] = [triage, live, sync, recompute, daysCommand, exportCommand, decode, sim, profileCommand];
const COMMANDS: readonly Command[] = [...WORKING, makeHelp(() => WORKING)];

function withDefaultSim(argv: readonly string[], command: Command): string[] {
  const hasSim = argv.some((arg) => arg === '--sim' || arg.startsWith('--sim='));
  return command.alwaysSimulated === true && !hasSim ? [...argv, '--sim=1'] : [...argv];
}

function usageFor(command: Command): string[] {
  return [command.summary, ...command.usage.map((u) => `  ${u}`), '', 'Run `help` for the options every command accepts.'];
}

export async function main(argv: readonly string[], sink: Sink): Promise<number> {
  const wantsJson = argv.includes('--json');
  const fail = (message: string, code: number): number => {
    sink.stderr(`error: ${message}\n`);
    if (wantsJson) sink.stdout(`${JSON.stringify({ error: message }, null, 2)}\n`);
    return code;
  };

  const [name] = argv;
  if (name === undefined || name.startsWith('-')) {
    if (name === undefined || name === '--help' || name === '-h') {
      for (const line of helpLines(WORKING)) sink.stdout(`${line}\n`);
      return name === undefined ? 2 : 0;
    }
    return fail(`expected a command first, got "${name}". Run \`help\`.`, 2);
  }
  const command = COMMANDS.find((c) => c.name === name);
  if (command === undefined) return fail(`unknown command "${name}". Run \`help\`.`, 2);

  let context: ReturnType<typeof createContext> | null = null;
  try {
    const args = parseCommandLine(withDefaultSim(argv, command), command.options);
    if (args.flag('help') && command.name !== 'help') {
      for (const line of usageFor(command)) sink.stdout(`${line}\n`);
      return 0;
    }
    context = createContext(args, sink);
    if (command.bluetooth && context.sim === null) context.log(BLUETOOTH_NOTICE);
    const result = await command.run(context);
    if (context.json) sink.stdout(`${JSON.stringify(result.json, null, 2)}\n`);
    return result.exitCode ?? 0;
  } catch (error) {
    if (error instanceof UsageError) return fail(error.message, 2);
    if (error instanceof CliError) return fail(error.message, error.exitCode);
    return fail(errorMessage(error), 1);
  } finally {
    await context?.close().catch(() => undefined);
  }
}

function flush(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    stream.write('', () => resolve());
  });
}

async function runFromProcess(): Promise<void> {
  const code = await main(process.argv.slice(2), {
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
  });
  await flush(process.stdout);
  await flush(process.stderr);
  process.exit(code);
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) void runFromProcess();
