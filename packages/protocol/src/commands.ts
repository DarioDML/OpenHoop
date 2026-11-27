import { concat } from './bytes';
import { wrapFrame } from './framing';
import { schema } from './schema';

export type CommandClass = 'read' | 'session' | 'write' | 'dangerous' | 'forbidden';

export const Command = {
  LINK_VALID: 1,
  GET_MAX_PROTOCOL_VERSION: 2,
  TOGGLE_REALTIME_HR: 3,
  REPORT_VERSION_INFO: 7,
  SET_CLOCK_DEPRECATED: 10,
  GET_CLOCK_DEPRECATED: 11,
  TOGGLE_GENERIC_HR_PROFILE: 14,
  TOGGLE_R7_DATA_COLLECTION: 16,
  RUN_HAPTIC_PATTERN_MAVERICK: 19,
  ABORT_HISTORICAL_TRANSMITS: 20,
  SEND_HISTORICAL_DATA: 22,
  HISTORICAL_DATA_RESULT: 23,
  FORCE_TRIM: 25,
  GET_BATTERY_LEVEL: 26,
  REBOOT_STRAP: 29,
  POWER_CYCLE_STRAP: 32,
  SET_READ_POINTER: 33,
  GET_DATA_RANGE: 34,
  GET_HELLO_HARVARD: 35,
  START_FIRMWARE_LOAD: 36,
  LOAD_FIRMWARE_DATA: 37,
  PROCESS_FIRMWARE_IMAGE: 38,
  SET_LED_DRIVE: 39,
  GET_LED_DRIVE: 40,
  SET_TIA_GAIN: 41,
  GET_TIA_GAIN: 42,
  SET_BIAS_OFFSET: 43,
  GET_BIAS_OFFSET: 44,
  ENTER_BLE_DFU: 45,
  SEND_EVENT_PACKETS: 48,
  SET_DP_TYPE: 52,
  FORCE_DP_TYPE: 53,
  SET_AFE_PARAMETERS: 61,
  GET_AFE_PARAMETERS: 62,
  SEND_R10_R11_REALTIME: 63,
  SET_ALARM_TIME: 66,
  GET_ALARM_TIME: 67,
  RUN_ALARM: 68,
  DISABLE_ALARM: 69,
  GET_ADVERTISING_NAME_HARVARD: 76,
  SET_ADVERTISING_NAME_HARVARD: 77,
  RUN_HAPTICS_PATTERN: 79,
  GET_ALL_HAPTICS_PATTERN: 80,
  START_RAW_DATA: 81,
  STOP_RAW_DATA: 82,
  VERIFY_FIRMWARE_IMAGE: 83,
  GET_BODY_LOCATION_AND_STATUS: 84,
  ENTER_HIGH_FREQ_SYNC: 96,
  EXIT_HIGH_FREQ_SYNC: 97,
  GET_EXTENDED_BATTERY_INFO: 98,
  RESET_FUEL_GAUGE: 99,
  CALIBRATE_CAPSENSE: 100,
  TOGGLE_IMU_MODE_HISTORICAL: 105,
  TOGGLE_IMU_MODE: 106,
  ENABLE_OPTICAL_DATA: 107,
  TOGGLE_OPTICAL_MODE: 108,
  START_DEVICE_CONFIG_KEY_EXCHANGE: 115,
  SEND_NEXT_DEVICE_CONFIG: 116,
  START_FF_KEY_EXCHANGE: 117,
  SEND_NEXT_FF: 118,
  SET_DEVICE_CONFIG_VALUE: 119,
  SET_FF_VALUE: 120,
  GET_DEVICE_CONFIG_VALUE: 121,
  STOP_HAPTICS: 122,
  SELECT_WRIST: 123,
  TOGGLE_LABRADOR_DATA_GENERATION: 124,
  TOGGLE_LABRADOR_RAW_SAVE: 125,
  GET_FF_VALUE: 128,
  SET_RESEARCH_PACKET: 131,
  GET_RESEARCH_PACKET: 132,
  TOGGLE_LABRADOR_FILTERED: 139,
  SET_ADVERTISING_NAME: 140,
  GET_ADVERTISING_NAME: 141,
  START_FIRMWARE_LOAD_NEW: 142,
  LOAD_FIRMWARE_DATA_NEW: 143,
  PROCESS_FIRMWARE_IMAGE_NEW: 144,
  GET_HELLO: 145,
  SET_CLOCK: 146,
  GET_CLOCK: 147,
  GET_BATTERY_PACK_INFO: 151,
  TOGGLE_PERSISTENT_R20: 153,
  TOGGLE_PERSISTENT_R21: 154,
  START_CERTIFICATE_TRANSFER: 155,
  LOAD_CERTIFICATE: 156,
  VERIFY_CERTIFICATE: 157,
  PROCESS_CERTIFICATE: 158,
  LOCK_DEVICE: 159,
} as const;

const CLASS_LISTS: Readonly<Record<Exclude<CommandClass, 'forbidden'>, readonly number[]>> = {
  read: [2, 7, 11, 26, 34, 35, 40, 42, 44, 62, 67, 76, 80, 84, 98, 115, 116, 117, 118, 121, 128, 132, 141, 145, 147, 151],
  session: [1, 3, 20, 22, 23, 96, 97],
  write: [10, 14, 16, 19, 48, 63, 66, 68, 69, 79, 81, 82, 105, 106, 107, 108, 122, 123, 124, 125, 131, 139, 146, 153, 154],
  dangerous: [25, 29, 32, 33, 39, 41, 43, 52, 53, 61, 77, 99, 100, 119, 120, 140],
};

const CLASS_BY_COMMAND: ReadonlyMap<number, CommandClass> = new Map(
  (Object.keys(CLASS_LISTS) as (keyof typeof CLASS_LISTS)[]).flatMap((cls) =>
    CLASS_LISTS[cls].map((n): [number, CommandClass] => [n, cls]),
  ),
);

export function commandName(n: number): string {
  return schema.commandNames.get(n) ?? `UNKNOWN_${n}`;
}

export function commandClass(n: number): CommandClass {
  return CLASS_BY_COMMAND.get(n) ?? 'forbidden';
}

export interface CommandGrant {
  confirmWrite?: true;
  confirmDangerous?: string;
}

export class ForbiddenCommandError extends Error {
  constructor(command: number) {
    super(`command ${command} (${commandName(command)}) is never sent`);
    this.name = 'ForbiddenCommandError';
  }
}

export class ConfirmationRequiredError extends Error {
  constructor(command: number, cls: CommandClass) {
    super(`command ${command} (${commandName(command)}) is ${cls} and needs an explicit confirmation`);
    this.name = 'ConfirmationRequiredError';
  }
}

const COMMAND_PACKET = 35;

export function buildCommand(
  command: number,
  args: Uint8Array = new Uint8Array(0),
  sequence = 0,
  grant: CommandGrant = {},
): Uint8Array {
  const cls = commandClass(command);
  if (cls === 'forbidden') throw new ForbiddenCommandError(command);
  if (cls === 'write' && grant.confirmWrite !== true) throw new ConfirmationRequiredError(command, cls);
  if (cls === 'dangerous' && grant.confirmDangerous !== commandName(command)) {
    throw new ConfirmationRequiredError(command, cls);
  }
  const head = Uint8Array.of(COMMAND_PACKET, sequence & 0xff, command & 0xff);
  return wrapFrame(concat(head, args), 0x00, 0x01);
}

export function historyAck(endToken: Uint8Array, sequence: number): Uint8Array {
  if (endToken.length !== 8) throw new RangeError('end token must be 8 bytes');
  return buildCommand(Command.HISTORICAL_DATA_RESULT, concat(Uint8Array.of(1), endToken), sequence);
}
