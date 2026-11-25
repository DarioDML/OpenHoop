import { describe, expect, it } from 'vitest';
import schema from '../src/schema/whoop5_protocol.json';
import {
  buildCommand,
  Command,
  commandClass,
  commandName,
  ConfirmationRequiredError,
  ForbiddenCommandError,
  fromHex,
  historyAck,
  toHex,
  validateFrame,
} from '../src/index';

const FORBIDDEN = [36, 37, 38, 45, 83, 142, 143, 144, 155, 156, 157, 158, 159];
const SCHEMA_NUMBERS = Object.keys(schema.commands)
  .filter((k) => /^\d+$/.test(k))
  .map(Number);
const COMMAND_NUMBERS: number[] = Object.values(Command);

describe('buildCommand', () => {
  it('builds the byte-exact client hello', () => {
    expect(toHex(buildCommand(145, Uint8Array.of(1), 1))).toBe('aa0108000001e67123019101363e5c8d');
    expect(toHex(buildCommand(Command.GET_HELLO, Uint8Array.of(1), 1))).toBe('aa0108000001e67123019101363e5c8d');
  });

  it('produces frames that validate', () => {
    expect(() => validateFrame(buildCommand(Command.GET_DATA_RANGE, undefined, 7))).not.toThrow();
  });

  it('requires confirmWrite for write commands', () => {
    expect(() => buildCommand(146)).toThrow(ConfirmationRequiredError);
    expect(() => validateFrame(buildCommand(146, undefined, 0, { confirmWrite: true }))).not.toThrow();
  });

  it('requires the command name for dangerous commands', () => {
    expect(() => buildCommand(29)).toThrow(ConfirmationRequiredError);
    expect(() => validateFrame(buildCommand(29, undefined, 0, { confirmDangerous: 'REBOOT_STRAP' }))).not.toThrow();
    expect(() => buildCommand(29, undefined, 0, { confirmDangerous: 'reboot' })).toThrow(ConfirmationRequiredError);
    expect(() => buildCommand(29, undefined, 0, { confirmWrite: true })).toThrow(ConfirmationRequiredError);
  });

  it.each(FORBIDDEN)('never builds forbidden command %i', (n) => {
    expect(commandClass(n)).toBe('forbidden');
    expect(() => buildCommand(n)).toThrow(ForbiddenCommandError);
    expect(() => buildCommand(n, undefined, 0, { confirmWrite: true, confirmDangerous: commandName(n) })).toThrow(
      ForbiddenCommandError,
    );
  });

  it('treats unknown numbers as forbidden', () => {
    expect(commandClass(200)).toBe('forbidden');
    expect(() => buildCommand(200, undefined, 0, { confirmWrite: true, confirmDangerous: commandName(200) })).toThrow(
      ForbiddenCommandError,
    );
    expect(() => buildCommand(-1)).toThrow(ForbiddenCommandError);
    expect(() => buildCommand(256 + 145)).toThrow(ForbiddenCommandError);
  });
});

describe('command classes', () => {
  it('classifies every non-forbidden schema command explicitly', () => {
    for (const n of SCHEMA_NUMBERS) {
      if (!FORBIDDEN.includes(n)) expect(commandClass(n), commandName(n)).not.toBe('forbidden');
    }
  });

  it('classifies every destructive schema command as dangerous or forbidden', () => {
    expect(schema.commands.destructive.length).toBeGreaterThan(0);
    for (const n of schema.commands.destructive) expect(['dangerous', 'forbidden']).toContain(commandClass(n));
  });

  it('exposes every schema command by name', () => {
    for (const n of SCHEMA_NUMBERS) expect(COMMAND_NUMBERS).toContain(n);
    for (const [name, n] of Object.entries(Command)) expect(commandName(n)).toBe(name);
  });
});

describe('historyAck', () => {
  it('echoes the token verbatim after a 01 byte', () => {
    const token = fromHex('41b6010010000000');
    expect(toHex(historyAck(token, 0))).toBe('aa0110000001e0d12300170141b6010010000000667da4fb');
  });

  it('rejects a token that is not 8 bytes', () => {
    expect(() => historyAck(new Uint8Array(7), 0)).toThrow(RangeError);
  });
});
