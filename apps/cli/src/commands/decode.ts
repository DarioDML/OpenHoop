import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FrameError, commandClass, commandName, decodeFrame, fromHex, toHex } from '@openhoop/protocol';
import type { Packet } from '@openhoop/protocol';
import { CliError, UsageError } from '../args';
import type { Command, CommandResult } from '../command';
import type { Context } from '../context';
import { formatIso } from '../format';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_LINES = 200_000;
const COMMAND_PACKET = 35;
const SEQUENCE_OFFSET = 9;
const COMMAND_OFFSET = 10;
const ARGS_OFFSET = 11;
const CRC_BYTES = 4;
const HEX_ONLY = /^(0x)?[0-9a-fA-F\s]+$/;

export interface DecodedLine {
  line: number;
  hex: string;
  text: string;
  packet: unknown;
}

function replacer(_key: string, value: unknown): unknown {
  return value instanceof Uint8Array ? toHex(value) : value;
}

function commandText(frame: Uint8Array): string {
  const sequence = frame[SEQUENCE_OFFSET];
  const command = frame[COMMAND_OFFSET];
  if (sequence === undefined || command === undefined) return 'COMMAND (truncated)';
  const args = frame.subarray(ARGS_OFFSET, Math.max(ARGS_OFFSET, frame.length - CRC_BYTES));
  return `COMMAND to band: seq ${sequence}, ${commandName(command)} (${command}), class ${commandClass(command)}, args ${args.length === 0 ? '(none)' : toHex(args)}`;
}

function packetText(packet: Packet): string {
  switch (packet.kind) {
    case 'commandResponse':
      return `COMMAND RESPONSE: ${packet.commandName} (${packet.command}), origin seq ${packet.originSequence}, ${packet.resultName}, body ${packet.body.length} bytes`;
    case 'realtimeHr':
      return `REALTIME HR: ${packet.heartRate} bpm, R-R ${packet.rrMs.length === 0 ? 'none' : packet.rrMs.join(', ')} ms, ${formatIso(packet.unixS)}`;
    case 'event':
      return `EVENT: ${packet.eventName} (${packet.event}), ${formatIso(packet.unixS)}, payload ${toHex(packet.payload)}${packet.detail === undefined ? '' : `, decoded ${JSON.stringify(packet.detail)}`}`;
    case 'packEvent':
      return `BATTERY PACK EVENT: ${packet.eventName} (${packet.event}), ${formatIso(packet.unixS)}, payload ${toHex(packet.payload)}${packet.pack === undefined || packet.pack.socPercent === null ? '' : `, charge ${packet.pack.socPercent} %`}`;
    case 'console':
      return `CONSOLE #${packet.consoleSequence}: ${packet.text}`;
    case 'metadata':
      return `METADATA: ${packet.metaName}, ${formatIso(packet.unixS)}${packet.endToken === undefined ? '' : `, end token ${toHex(packet.endToken)}`}`;
    case 'record':
      return `RECORD: ${packet.record.type}, layout ${packet.layout}, index ${packet.recordIndex}, ${formatIso(packet.unixS)}`;
    case 'unknown':
      return `UNKNOWN packet type ${packet.packetType}`;
  }
}

export function decodeHexLine(hex: string, line: number): DecodedLine {
  const cleaned = hex.replace(/^0x/i, '').replace(/\s+/g, '');
  if (cleaned.length === 0 || cleaned.length % 2 !== 0 || !HEX_ONLY.test(cleaned)) {
    return { line, hex: cleaned, text: 'NOT HEX: needs an even number of hex digits', packet: null };
  }
  const frame = fromHex(cleaned);
  let packet: Packet;
  try {
    packet = decodeFrame(frame);
  } catch (error) {
    if (error instanceof FrameError) return { line, hex: cleaned, text: `INVALID FRAME: ${error.message}`, packet: null };
    throw error;
  }
  if (packet.kind === 'unknown' && packet.packetType === COMMAND_PACKET) {
    return { line, hex: cleaned, text: commandText(frame), packet };
  }
  return { line, hex: cleaned, text: packetText(packet), packet };
}

async function readInput(argument: string): Promise<string[]> {
  const path = resolve(argument);
  let size: number | null = null;
  try {
    const info = await stat(path);
    if (info.isFile()) size = info.size;
  } catch {
    size = null;
  }
  if (size === null) {
    if (HEX_ONLY.test(argument)) return [argument];
    throw new CliError(`"${argument}" is neither hex nor a readable file`);
  }
  if (size > MAX_FILE_BYTES) throw new CliError(`${path} is larger than ${MAX_FILE_BYTES} bytes`);
  const lines = (await readFile(path, 'utf8')).split(/\r?\n/);
  if (lines.length > MAX_LINES) throw new CliError(`${path} has more than ${MAX_LINES} lines`);
  return lines;
}

async function run(ctx: Context): Promise<CommandResult> {
  const [argument, ...extra] = ctx.args.positionals.slice(1);
  if (argument === undefined || extra.length > 0) throw new UsageError('decode needs one argument: hex bytes or a file of hex lines');
  const lines = await readInput(argument);
  const decoded: DecodedLine[] = [];
  lines.forEach((raw, index) => {
    const text = raw.replace(/#.*$/, '').trim();
    if (text.length > 0) decoded.push(decodeHexLine(text, index + 1));
  });
  for (const entry of decoded) ctx.log(`#${entry.line}  ${entry.text}`);
  const failed = decoded.filter((d) => d.packet === null).length;
  if (decoded.length === 0) ctx.log('No hex lines found.');
  else if (failed > 0) ctx.log(`${failed} of ${decoded.length} lines could not be decoded`);
  return {
    json: JSON.parse(JSON.stringify({ packets: decoded }, replacer)) as unknown,
    exitCode: decoded.length === 0 || failed > 0 ? 1 : 0,
  };
}

export const decode: Command = {
  name: 'decode',
  summary: 'Decode hex frames given on the command line or in a file, one frame per line',
  usage: ['decode <hex | path to a file of hex lines>'],
  options: {},
  bluetooth: false,
  run,
};
