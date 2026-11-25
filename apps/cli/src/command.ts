import type { Context } from './context';
import type { OptionSpecs } from './args';

export interface CommandResult {
  json: unknown;
  exitCode?: number;
}

export interface Command {
  name: string;
  summary: string;
  usage: readonly string[];
  options: OptionSpecs;
  bluetooth: boolean;
  alwaysSimulated?: boolean;
  run(ctx: Context): Promise<CommandResult>;
}
