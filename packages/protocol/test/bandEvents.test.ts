import { describe, expect, it } from 'vitest';
import { decodeEventDetail, decodeFrame, encodeEvent, fromHex } from '../src/index';

function ascii(text: string): string {
  return [...text].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

const FAKE_SERIAL = ascii('5AM9999999');
const FAKE_CHIP_ID = '0102030405060708';

describe('decodeEventDetail', () => {
  it('reads a wear-detect state change logged as "moving from state 3 to state 1 (debug = 24)"', () => {
    const payload = fromHex('01030118ffff462f0002288bfc663d00050b003a040000000000010000000000');
    const detail = decodeEventDetail(120, payload);
    expect(detail).toMatchObject({
      kind: 'wearDetect',
      fromState: 'offWrist',
      toState: 'onWristUnconfirmed',
      reason: 24,
      secondsInState: 65_535,
      secondsCapped: true,
      opticalNear: 8.75,
      opticalRatio: 11.75,
      ambient: 0,
      recordCount: 40,
      orientChanges: 5,
      accelX: 58 / 64,
      accelY: 4 / 64,
      skinTempC: null,
    });
    expect(detail?.kind === 'wearDetect' ? detail.rangeStability : null).toBeCloseTo(0.056393, 6);
  });

  it('reads the skin temperature and heart rate fields of a worn wear-detect report', () => {
    const payload = fromHex('0101030cae004b2601023b1f722f3b0000ae000016001ef94333030000009900');
    expect(decodeEventDetail(120, payload)).toMatchObject({
      fromState: 'onWristUnconfirmed',
      toState: 'offWrist',
      secondsInState: 174,
      secondsCapped: false,
      peakHeartRate: 124.5,
      peakHeartRateDeviation: 33.5,
      harmonicShare: 51 / 128,
      heartRateCount: 153,
    });
    const warm = fromHex('01010304e40000050000278f0e9c3e060c00000000000000000003009700bb00');
    expect(decodeEventDetail(120, warm)).toMatchObject({ toState: 'offWrist', skinTempC: 10 + 151 / 8 });
  });

  it('reads the confirmed on-wrist state and the boot state', () => {
    expect(decodeEventDetail(120, fromHex('01020200201c4c26010238d3db3b3c000099030013005acc2905010000003100'))).toMatchObject({
      fromState: 'onWrist',
      toState: 'onWrist',
      secondsInState: 7_200,
    });
    expect(decodeEventDetail(120, fromHex('010003030500010400000000000000010101001a00000000000000009200c700'))).toMatchObject({
      fromState: 'boot',
      toState: 'offWrist',
    });
  });

  it('reads the charger status the band logs as "Constant Current Charging (2)"', () => {
    expect(decodeEventDetail(117, fromHex('01020000'))).toEqual({ kind: 'chargerStatus', chargerStatus: 2, charging: true });
    expect(decodeEventDetail(117, fromHex('01000000'))).toEqual({ kind: 'chargerStatus', chargerStatus: 0, charging: false });
  });

  it('reads the ten-minute charger report', () => {
    expect(decodeEventDetail(110, fromHex('0101010200030000'))).toEqual({ kind: 'chargerReport', chargerStatus: 2, charging: true });
    expect(decodeEventDetail(110, fromHex('0101000000000000'))).toEqual({ kind: 'chargerReport', chargerStatus: 0, charging: false });
  });

  it('reads the reboot reason the band logs as "Pre reboot reason: 0x1001"', () => {
    expect(decodeEventDetail(112, fromHex('017003010754017b110f0ec6011000ad37c8ce00'))).toEqual({
      kind: 'reboot',
      preRebootReason: 0x1001,
    });
  });

  it('reads firmware and signal processing versions from the boot report, never its serial or chip id', () => {
    const payload = fromHex(`02${FAKE_SERIAL}${FAKE_CHIP_ID}0101${'00'.repeat(5)}322b02${'00'.repeat(4)}0c00069f140000`);
    expect(payload).toHaveLength(40);
    const detail = decodeEventDetail(61, payload);
    expect(detail).toEqual({
      kind: 'bootInfo',
      firmware: { major: 50, minor: 43, patch: 2, build: 0 },
      signalProcessingVersion: { major: 12, minor: 0, patch: 6 },
    });
    expect(JSON.stringify(detail)).not.toContain('9999999');
  });

  it('reads the boot counter that the console prints as the first number of each line', () => {
    const payload = fromHex(`02${FAKE_SERIAL}${FAKE_CHIP_ID}011f00000031030000`);
    expect(decodeEventDetail(62, payload)).toEqual({ kind: 'bootCounter', bootCount: 31 });
  });

  it('rejects a payload of the wrong length or revision', () => {
    expect(decodeEventDetail(117, fromHex('010200'))).toBeNull();
    expect(decodeEventDetail(117, fromHex('02020000'))).toBeNull();
    expect(decodeEventDetail(120, fromHex('0103'))).toBeNull();
    expect(decodeEventDetail(116, fromHex('01000000'))).toBeNull();
  });
});

describe('decodeFrame for the decoded band events', () => {
  it('names the events and attaches their detail', () => {
    const frame = encodeEvent({ event: 117, unixS: 1_795_712_510, payload: fromHex('01020000') });
    expect(decodeFrame(frame)).toMatchObject({
      kind: 'event',
      eventName: 'CHARGER_STATUS_CHANGED',
      detail: { kind: 'chargerStatus', chargerStatus: 2 },
    });
    const wear = encodeEvent({ event: 120, unixS: 1_795_712_510, payload: fromHex('01020200201c4c26010238d3db3b3c000099030013005acc2905010000003100') });
    expect(decodeFrame(wear)).toMatchObject({ eventName: 'WEAR_DETECT_STATE', detail: { kind: 'wearDetect', toState: 'onWrist' } });
  });

  it('keeps an event it cannot name as unknown', () => {
    expect(decodeFrame(encodeEvent({ event: 116, unixS: 1_795_712_510, payload: fromHex('01000000') }))).toMatchObject({
      eventName: 'UNKNOWN_116',
    });
  });
});
