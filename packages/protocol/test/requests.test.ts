import { describe, expect, it } from 'vitest';
import {
  Command,
  ConfirmationRequiredError,
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
