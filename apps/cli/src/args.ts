import type { ParseArgsConfig } from 'node:util';
import { parseArgs } from 'node:util';

export type OptionSpecs = NonNullable<ParseArgsConfig['options']>;

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export const GLOBAL_OPTIONS = {
  sim: { type: 'string' },
  'sim-locked': { type: 'boolean' },
  'sim-firmware': { type: 'string' },
  'sim-days': { type: 'string' },
  'sim-bond-refused': { type: 'boolean' },
  db: { type: 'string' },
  json: { type: 'boolean' },
  device: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const satisfies OptionSpecs;

const DEFAULT_SIM_SEED = 1;

export class ParsedArgs {
  constructor(
    private readonly values: Readonly<Record<string, string | boolean | (string | boolean)[] | undefined>>,
    readonly positionals: readonly string[],
  ) {}

  string(name: string): string | undefined {
    const value = this.values[name];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new UsageError(`--${name} needs a value`);
    return value;
  }

  flag(name: string): boolean {
    return this.values[name] === true;
  }

  has(name: string): boolean {
    return this.values[name] !== undefined;
  }

  int(name: string, min: number, max: number): number | undefined {
    const text = this.string(name);
    if (text === undefined) return undefined;
    if (!/^-?\d{1,9}$/.test(text)) throw new UsageError(`--${name} must be a whole number, got "${text}"`);
    const value = Number(text);
    if (value < min || value > max) throw new UsageError(`--${name} must be between ${min} and ${max}, got ${value}`);
    return value;
  }
}

export function normalizeArgv(argv: readonly string[]): string[] {
  return argv.map((arg) => (arg === '--sim' ? `--sim=${DEFAULT_SIM_SEED}` : arg));
}

export function parseCommandLine(argv: readonly string[], extra: OptionSpecs): ParsedArgs {
  try {
    const { values, positionals } = parseArgs({
      args: normalizeArgv(argv),
      options: { ...GLOBAL_OPTIONS, ...extra },
      allowPositionals: true,
      strict: true,
    });
    return new ParsedArgs(values, positionals);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}
