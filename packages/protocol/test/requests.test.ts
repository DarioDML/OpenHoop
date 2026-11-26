import { describe, expect, it } from 'vitest';
import {
  Command,
  ConfirmationRequiredError,
  alarmDisableBody,
  alarmGetBody,
  alarmRunBody,
  alarmSetBody,
  decodeAlarmReading,
  decodeAlarmStatus,
  decodeHapticsTermination,
  fromHex,
  isAlarmRejection,
  buildCommand,
  commandClass,
  configReadBody,
  configWriteBody,
  hapticPatternBody,
  hrProfileBody,
  stopHapticsBody,
  toHex,
} from '../src/index';

describe('hapticPatternBody', () => {
  it('plays the alert effects for the given loop count', () => {
    expect(toHex(hapticPatternBody(1))).toBe('012f980000000000000000' + '01');
    expect(toHex(hapticPatternBody(6))).toBe('012f980000000000000000' + '06');
  });

  it.each([0, 7, 12, 256, 1.5, -1])('refuses %s loops', (loops) => {
    expect(() => hapticPatternBody(loops)).toThrow(RangeError);
  });
});

describe('stopHapticsBody', () => {
  it('is the revision byte', () => {
    expect(toHex(stopHapticsBody())).toBe('01');
  });
});

describe('configWriteBody', () => {
  it('pads key and value to 32 bytes after the revision', () => {
    const body = configWriteBody('whoop_live_2_hrm_devices', '1');
    expect(body.length).toBe(65);
    expect(body[0]).toBe(1);
    expect(String.fromCharCode(...body.subarray(1, 25))).toBe('whoop_live_2_hrm_devices');
    expect([...body.subarray(25, 33)].every((b) => b === 0)).toBe(true);
    expect(body[33]).toBe(0x31);
    expect([...body.subarray(34)].every((b) => b === 0)).toBe(true);
  });

  it('refuses keys that do not fit or are not ASCII', () => {
    expect(() => configWriteBody('', '1')).toThrow(RangeError);
    expect(() => configWriteBody('k'.repeat(32), '1')).toThrow(RangeError);
    expect(() => configWriteBody('café', '1')).toThrow(RangeError);
  });

  it('matches the read body for the same key', () => {
    expect(configReadBody('enable_rfid')).toEqual(configWriteBody('enable_rfid', '2').subarray(0, 33));
  });
});

describe('hrProfileBody', () => {
  it('is the bare state byte, without a revision', () => {
    expect(toHex(hrProfileBody(true))).toBe('01');
    expect(toHex(hrProfileBody(false))).toBe('00');
  });
});

describe('write gates for band actions', () => {
  it('needs the command name to write a flag or config value', () => {
    for (const command of [Command.SET_FF_VALUE, Command.SET_DEVICE_CONFIG_VALUE]) {
      expect(commandClass(command)).toBe('dangerous');
      expect(() => buildCommand(command, configWriteBody('enable_rfid', '2'), 1, { confirmWrite: true })).toThrow(ConfirmationRequiredError);
    }
    expect(() =>
      buildCommand(Command.SET_FF_VALUE, configWriteBody('enable_sig12', '2'), 1, { confirmDangerous: 'SET_FF_VALUE' }),
    ).not.toThrow();
  });

  it('needs a write grant for haptics and the heart rate profile', () => {
    for (const command of [Command.RUN_HAPTIC_PATTERN_MAVERICK, Command.STOP_HAPTICS, Command.TOGGLE_GENERIC_HR_PROFILE]) {
      expect(commandClass(command)).toBe('write');
      expect(() => buildCommand(command, stopHapticsBody())).toThrow(ConfirmationRequiredError);
    }
  });
});

describe('alarm bodies', () => {
  it('builds the 21-byte revision 4 alarm with the band alarm buzz', () => {
    const body = alarmSetBody(1, 1_800_000_000.5);
    expect(body.length).toBe(21);
    expect(toHex(body)).toBe('0401' + '00d2496b' + '0040' + '2f98000000000000' + '0000' + '07' + '1e' + '00');
  });

  it('refuses slots outside 1 to 6 and impossible times', () => {
    expect(() => alarmSetBody(0, 1_800_000_000)).toThrow(RangeError);
    expect(() => alarmSetBody(7, 1_800_000_000)).toThrow(RangeError);
    expect(() => alarmSetBody(1, 0)).toThrow(RangeError);
    expect(() => alarmSetBody(1, 2 ** 32)).toThrow(RangeError);
    expect(() => alarmGetBody(0)).toThrow(RangeError);
  });

  it('reads, runs and disables a slot with the revision first', () => {
    expect(toHex(alarmGetBody(1))).toBe('0401');
    expect(toHex(alarmRunBody(2))).toBe('0202');
    expect(toHex(alarmDisableBody(3))).toBe('0203');
    expect(toHex(alarmDisableBody('all'))).toBe('02ff');
  });

  it('decodes an armed alarm reading and refuses other forms', () => {
    expect(decodeAlarmReading(fromHex('040100d2496b0040'))).toEqual({ active: true, bandUnixS: 1_800_000_000 });
    expect(decodeAlarmReading(fromHex('040000d2496b0000'))).toEqual({ active: false, bandUnixS: 1_800_000_000 });
    expect(decodeAlarmReading(fromHex('0100d2496b00'))).toBeNull();
    expect(decodeAlarmReading(fromHex('0401'))).toBeNull();
  });

  it('names the alarm status and spots input rejections', () => {
    expect(decodeAlarmStatus(fromHex('0301'))).toBe('valid-input-pattern');
    expect(decodeAlarmStatus(fromHex('030a'))).toBe('invalid-alarm-time');
    expect(decodeAlarmStatus(fromHex('0363'))).toBe('code-99');
    expect(decodeAlarmStatus(fromHex('03'))).toBeNull();
    expect(isAlarmRejection('invalid-alarm-id')).toBe(true);
    expect(isAlarmRejection('haptics-busy')).toBe(false);
    expect(isAlarmRejection(null)).toBe(false);
  });

  it('names how the haptics ended', () => {
    expect(decodeHapticsTermination(fromHex('0102'))).toBe('double-tap');
    expect(decodeHapticsTermination(fromHex('0100'))).toBe('expired');
    expect(decodeHapticsTermination(fromHex('0109'))).toBe('code-9');
    expect(decodeHapticsTermination(fromHex('01'))).toBeNull();
  });
});
