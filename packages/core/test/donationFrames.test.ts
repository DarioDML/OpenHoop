import { describe, expect, it } from 'vitest';
import {
  decodeFrame,
  encodeBiometric,
  encodeCommandResponse,
  encodeConsole,
  encodeEvent,
  encodePackInfoPayload,
  encodePackSocPayload,
} from '@openhoop/protocol';
import {
  REMOVAL_REASONS,
  consoleLineReasons,
  emptyRemovalCounts,
  frameHex,
  identityReason,
  knownIdentityValues,
  timeChunkFrames,
} from '../src/index';
import type { RemovalReason, TimedFrame } from '../src/index';

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

  it('removes battery pack events that can carry the pack identity and keeps its charge reports', () => {
    const info = { serial: 'TESTPACK0000001', hwFamily: 12, hwVersion: 13, firmware: { major: 3, minor: 30, patch: 5, build: 0 }, colourway: 1 };
    const hardware = encodeEvent({ packetType: 54, event: 20, unixS: 1_700_000_000, payload: encodePackInfoPayload(info, 50) });
    const unknown = encodeEvent({ packetType: 54, event: 9, unixS: 1_700_000_000, payload: Uint8Array.of(1, 2) });
    const charge = encodeEvent({ packetType: 54, event: 2, unixS: 1_700_000_000, payload: encodePackSocPayload(50) });
    expect(identityReason(hardware, decodeFrame(hardware), [])).toBe('identityEvent');
    expect(identityReason(unknown, decodeFrame(unknown), [])).toBe('identityEvent');
    expect(identityReason(charge, decodeFrame(charge), [])).toBeNull();
    const oversized = encodeEvent({ packetType: 54, event: 2, unixS: 1_700_000_000, payload: Uint8Array.of(1, 0xe5, 0, 0, 0x41, 0x42) });
    expect(identityReason(oversized, decodeFrame(oversized), [])).toBe('identityEvent');
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

  it('also knows the stored Bluetooth address as 12 bare hex digits, in both cases and both byte orders', () => {
    const known = knownIdentityValues([{ serial: null, name: null, bleId: '02:1A:2B:3C:4D:5E' }]);
    expect(known).toEqual(expect.arrayContaining(['021a2b3c4d5e', '021A2B3C4D5E', '5e4d3c2b1a02', '5E4D3C2B1A02']));
    const frame = encodeConsole({ consoleSequence: 1, unixS: 1_700_000_000, text: 'peer 5E4D3C2B1A02' });
    expect(identityReason(frame, decodeFrame(frame), known)).toBe('knownText');
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

describe('band console lines', () => {
  const T = 1_700_000_000;

  function fragments(firstSequence: number, texts: readonly string[]): TimedFrame[] {
    return texts.map((text, i) => {
      const frame = encodeConsole({ consoleSequence: (firstSequence + i) % 256, unixS: T + i, text });
      return { frame, packet: decodeFrame(frame), t: T + i };
    });
  }

  function reasons(frames: readonly TimedFrame[], known: readonly string[] = []): (RemovalReason | null)[] {
    const found = consoleLineReasons(frames, known);
    return frames.map((frame) => found.get(frame) ?? null);
  }

  function perFrame(frames: readonly TimedFrame[]): (RemovalReason | null)[] {
    return frames.map((f) => identityReason(f.frame, f.packet, []));
  }

  it('drops both fragments of a Bluetooth address split across two frames, which the per-frame check misses', () => {
    const frames = fragments(10, ['\n 30, 2372293640: Address          = 02:1A:2B', ':3C:4D:5E\n 30, 2372293641: NFC COMMS: HW fam', 'ily : 12\n']);
    expect(perFrame(frames)).toEqual([null, null, null]);
    expect(reasons(frames)).toEqual(['consoleIdentity', 'consoleIdentity', null]);
  });

  it("drops the battery pack's bare-hex BT addr line", () => {
    const frames = fragments(20, ['\n 30, 2372467560: NFC COMMS: BT addr : 0a1b2c', '3d4e5f\n']);
    expect(perFrame(frames)).toEqual([null, null]);
    expect(reasons(frames)).toEqual(['consoleIdentity', 'consoleIdentity']);
  });

  it('drops the advertising name of the band', () => {
    const frames = fragments(30, ['\n 0,    730: Advertising name: WHO', 'OP ROBIN\n']);
    expect(perFrame(frames)).toEqual([null, null]);
    expect(reasons(frames)).toEqual(['consoleIdentity', 'consoleIdentity']);
  });

  it('drops a battery pack serial split across frames, also without a label', () => {
    const frames = fragments(40, ['\n 30, 2372467562: NFC COMMS: XYZ9QR', '1234567\n 30, 2372467563: NFC COMMS: Serial : XY', 'Z9QR1234567\n']);
    expect(perFrame(frames)).toEqual([null, null, null]);
    expect(reasons(frames)).toEqual(['consoleIdentity', 'consoleIdentity', 'consoleIdentity']);
  });

  it('drops every other identity format it knows, split at any point', () => {
    const lines = [
      '30, 2372293640: peer 02-1A-2B-3C-4D-5E',
      '30, 2372293640: link 02:1A:2B:3C',
      '30, 2372467560: NFC COMMS: link 0A1B2C3D4E5F',
      '30, 2372467560: NFC COMMS: id 0x0a1b2c3d4e5f',
      '30, 2372467560: bd_addr= 0A1B',
      '30, 2372467560: MAC: 0A1B',
      '30, 1: Chip ID: 77',
      '30, 1: UUID = 6f1c2a3b',
      '30, 1: build 0011223344556677',
      '30, 1: S/N: 12345678',
      '30, 1: SN = 12345678',
      '0,    731: Device name = ROBIN',
      '0,    731: adv WHOOP ROBIN',
      '30, 1: id 5AG1234567',
      '30, 1: hello MyBand42',
    ];
    for (const line of lines) {
      for (let cut = 1; cut < line.length; cut += 1) {
        const frames = fragments(cut, [`\n ${line.slice(0, cut)}`, `${line.slice(cut)}\n`]);
        expect(reasons(frames, ['MyBand42']), `${line} cut at ${cut}`).toEqual(['consoleIdentity', 'consoleIdentity']);
      }
    }
  });

  it('drops a line that holds a stored identity value in another letter case', () => {
    const frames = fragments(45, ['\n 30, 5: hello myba', 'nd42\n']);
    expect(reasons(frames, ['MyBand42'])).toEqual(['consoleIdentity', 'consoleIdentity']);
  });

  it('keeps harmless battery pack lines and their fragment framing', () => {
    const frames = fragments(50, [
      '\n 30, 2372467563: NFC COMMS: HW family : 12\n 30, 23',
      '72467564: NFC COMMS: FW version: 3.30.5.0\n 30, 237',
      '2467565: NFC COMMS: Colorway : 1\n 30, 2372467566: N',
      'FC COMMS: BPK SoC : 156\n',
    ]);
    expect(reasons(frames)).toEqual([null, null, null, null]);
  });

  it('keeps a whole line at the very start when it starts like a console line', () => {
    expect(reasons(fragments(55, [' 30, 11: SUPERVISOR: SOC report: 42.90\n']))).toEqual([null]);
  });

  it('ends a line at a sequence gap instead of merging it with unrelated fragments', () => {
    const frames = [
      ...fragments(60, ['\n 30, 2372467560: NFC COMMS: BT addr : 0a1b2c']),
      ...fragments(70, [' 30, 2372467563: NFC COMMS: HW family : 12\n']),
    ];
    expect(reasons(frames)).toEqual(['consoleIdentity', null]);
  });

  it('treats 255 followed by 0 as consecutive', () => {
    expect(reasons(fragments(255, ['\n 30, 5: Address = 02:1A:2B', ':3C:4D:5E\n']))).toEqual(['consoleIdentity', 'consoleIdentity']);
  });

  it('drops the fragments of a line it cannot see whole, at a gap or at either end', () => {
    const cutAtGap = fragments(80, ['\n 30, 5: WEAR: mov']);
    const tailAfterGap = fragments(90, ['3d4e5f\n 30, 6: WEAR: moving\n']);
    const openAtEnd = fragments(91, [' 30, 7: WEAR: st']);
    expect(reasons([...cutAtGap, ...tailAfterGap, ...openAtEnd])).toEqual(['consolePartial', 'consolePartial', 'consolePartial']);
    expect(reasons(fragments(100, ['4F\n 30, 8: WEAR: moving\n']))).toEqual(['consolePartial']);
  });

  it('drops the frame that holds only the newline of an identity line', () => {
    const frames = fragments(110, ['\n 30, 5: Address = 02:1A:2B:3C:4D:5E', '\n 30, 6: WEAR: moving\n']);
    expect(reasons(frames)).toEqual(['consoleIdentity', 'consoleIdentity']);
  });

  it('reads a repeated copy of a fragment as the same fragment, not as a gap', () => {
    const [head, tail] = fragments(130, ['\n 30, 5: WEAR: mov', 'ing\n']);
    if (head === undefined || tail === undefined) throw new Error('needs two fragments');
    const copy: TimedFrame = { ...head, frame: head.frame.slice() };
    expect(reasons([head, copy, tail])).toEqual([null, null, null]);
    const [leakHead, leakTail] = fragments(140, ['\n 30, 5: peer 0a1b2c', '3d4e5f\n']);
    if (leakHead === undefined || leakTail === undefined) throw new Error('needs two fragments');
    const leakCopy: TimedFrame = { ...leakHead, frame: leakHead.frame.slice() };
    expect(reasons([leakHead, leakCopy, leakTail])).toEqual(['consoleIdentity', 'consoleIdentity', 'consoleIdentity']);
  });

  it('ignores frames that are not console frames', () => {
    const bio = encodeBiometric({ recordIndex: 1, unixS: T, heartRate: 60 });
    const frames = [...fragments(120, ['\n 30, 5: WEAR: mov']), { frame: bio, packet: decodeFrame(bio), t: T }, ...fragments(121, ['ing\n'])];
    expect(reasons(frames)).toEqual([null, null, null]);
  });

  it('lists the console reasons as removal reasons', () => {
    expect(REMOVAL_REASONS).toEqual(expect.arrayContaining(['consoleIdentity', 'consolePartial']));
    expect(emptyRemovalCounts()).toMatchObject({ consoleIdentity: 0, consolePartial: 0 });
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
