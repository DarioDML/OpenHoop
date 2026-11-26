import { describe, expect, it } from 'vitest';
import { decodeFrame, encodeBiometric, encodeCommandResponse, encodeConsole, encodeEvent } from '@openhoop/protocol';
import { emptyRemovalCounts, frameHex, identityReason, knownIdentityValues, timeChunkFrames } from '../src/index';

describe('identity filter', () => {
  it('removes each identity command response', () => {
    for (const command of [35, 145, 76, 77, 140, 141, 151]) {
      const frame = encodeCommandResponse({ sequence: 1, command, originSequence: 1, result: 1 });
      expect(identityReason(frame, decodeFrame(frame), [])).toBe('identityCommand');
    }
    const other = encodeCommandResponse({ sequence: 1, command: 7, originSequence: 1, result: 1 });
    expect(identityReason(other, decodeFrame(other), [])).toBeNull();
  });

  it('removes outgoing identity commands by byte 10', () => {
    const frame = new Uint8Array(16);
    frame[8] = 35;
    frame[10] = 140;
    expect(identityReason(frame, { kind: 'unknown', packetType: 35 }, [])).toBe('identityCommand');
    frame[10] = 7;
    expect(identityReason(frame, { kind: 'unknown', packetType: 35 }, [])).toBeNull();
  });

  it('removes identity events', () => {
    for (const event of [61, 62, 109]) {
      const frame = encodeEvent({ event, unixS: 1_700_000_000 });
      expect(identityReason(frame, decodeFrame(frame), [])).toBe('identityEvent');
    }
    const battery = encodeEvent({ event: 3, unixS: 1_700_000_000 });
    expect(identityReason(battery, decodeFrame(battery), [])).toBeNull();
  });

  it('removes frames whose text holds a serial or a Bluetooth address', () => {
    const serial = encodeConsole({ consoleSequence: 1, unixS: 1_700_000_000, text: 'id 5AG1234567' });
    const address = encodeConsole({ consoleSequence: 2, unixS: 1_700_000_000, text: 'mac AA:BB:CC:DD:EE:FF' });
    expect(identityReason(serial, decodeFrame(serial), [])).toBe('serialText');
    expect(identityReason(address, decodeFrame(address), [])).toBe('addressText');
  });

  it('uses stored serials and names of at least 6 characters as a second net', () => {
    const known = knownIdentityValues([
      { serial: null, name: ' MyBand42 ' },
      { serial: '', name: 'WHOOP' },
      { serial: 'MyBand42', name: null },
    ]);
    expect(known).toEqual(['MyBand42']);
    const frame = encodeConsole({ consoleSequence: 1, unixS: 1_700_000_000, text: 'hello MyBand42' });
    expect(identityReason(frame, decodeFrame(frame), known)).toBe('knownText');
  });

  it('removes frames that carry the stored Bluetooth address as raw bytes, in either byte order', () => {
    const known = knownIdentityValues([{ serial: null, name: null, bleId: 'AA:BB:CC:DD:EE:FF' }]);
    for (const payload of [Uint8Array.of(0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff), Uint8Array.of(0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa)]) {
      const frame = encodeEvent({ event: 3, unixS: 1_700_000_000, payload });
      expect(identityReason(frame, decodeFrame(frame), known)).toBe('knownText');
    }
    const other = encodeEvent({ event: 3, unixS: 1_700_000_000, payload: Uint8Array.of(1, 2, 3, 4, 5, 6) });
    expect(identityReason(other, decodeFrame(other), known)).toBeNull();
  });

  it('does not treat a band id that is not a Bluetooth address as one', () => {
    expect(knownIdentityValues([{ serial: null, name: null, bleId: '6F1C2A3B-0000-4000-8000-000000000000' }])).toEqual([]);
  });

  it('keeps ordinary biometric frames', () => {
    const frame = encodeBiometric({ recordIndex: 1, unixS: 1_700_000_000, heartRate: 60 });
    expect(identityReason(frame, decodeFrame(frame), ['MyBand42'])).toBeNull();
  });

  it('writes frames as lowercase hex', () => {
    expect(frameHex(Uint8Array.of(0x00, 0xab, 0x0f, 0xff))).toBe('00ab0fff');
  });
});

describe('frame timing', () => {
  const cmd = () => encodeCommandResponse({ sequence: 1, command: 7, originSequence: 1, result: 1 });
  const bio = (t: number) => encodeBiometric({ recordIndex: t, unixS: t, heartRate: 60 });

  it('gives an untimed frame the time of the nearest earlier timed frame, else the next one', () => {
    const removed = emptyRemovalCounts();
    expect(timeChunkFrames([cmd(), bio(100), cmd(), bio(200)], removed).map((f) => f.t)).toEqual([100, 100, 100, 200]);
    expect(removed.untimed).toBe(0);
  });

  it('treats unixS 0 as untimed and drops a chunk without any timed frame', () => {
    const removed = emptyRemovalCounts();
    expect(timeChunkFrames([cmd(), encodeEvent({ event: 3, unixS: 0 })], removed)).toEqual([]);
    expect(removed.untimed).toBe(2);
  });

  it('counts frames that fail the CRC as invalid', () => {
    const broken = bio(100);
    broken[20] = (broken[20] ?? 0) ^ 0xff;
    const removed = emptyRemovalCounts();
    expect(timeChunkFrames([broken], removed)).toEqual([]);
    expect(removed.invalid).toBe(1);
  });
});
