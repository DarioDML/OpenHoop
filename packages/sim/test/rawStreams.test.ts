import { describe, expect, it } from 'vitest';
import { RawStreamError, Session, StreamCollector, isLiveSignal, startBandRecording, stopBandRecording, switchStreams } from '@openhoop/core';
import type { LiveImuSecond, LiveOpticalSecond } from '@openhoop/core';
import { Command, encodeImu } from '@openhoop/protocol';
import { SimBand } from '../src/index';
import type { SimOptions } from '../src/index';

const NOW_S = Date.UTC(2027, 0, 15, 12, 0, 0) / 1000;
const STILL: [number[], number[], number[]] = [[0], [0], [4096]];

async function openBand(extra: Partial<SimOptions> = {}): Promise<{ band: SimBand; session: Session }> {
  const band = new SimBand({ seed: 7, now: () => NOW_S, historyDays: 1 / 24, model: 'MG', rawIntervalMs: 100, ...extra });
  const [found] = await band.scan(1000);
  if (found === undefined) throw new Error('simulated band not found');
  await band.connect(found.id);
  await band.bond();
  const session = new Session(band);
  await session.open();
  return { band, session };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('raw streams on the simulated band', () => {
  it('switchStreams on then off', async () => {
    const { band, session } = await openBand();
    const collector = new StreamCollector(session);
    const seconds: LiveImuSecond[] = [];
    collector.onImu((s) => seconds.push(s));
    await switchStreams(session, ['imu'], true);
    expect(band.imuOn).toBe(true);
    expect(band.opticalOn).toBe(false);
    await wait(450);
    await switchStreams(session, ['imu'], false);
    expect(band.imuOn).toBe(false);
    expect(seconds.length).toBeGreaterThanOrEqual(2);
    expect(seconds[0]?.gyro[0]).toEqual([]);
    expect(seconds[1]?.rateHz).toBe(100);
    expect(seconds[1]?.accel[2]).toHaveLength(100);
    expect(seconds[1]?.t).toBeGreaterThan(seconds[0]?.t ?? Infinity);
    expect(collector.measuredRate('imu')).toBe(100);
    const count = seconds.length;
    await wait(300);
    expect(seconds.length).toBe(count);
    collector.close();
    await session.close();
  });

  it('optical collector reports rate 25', async () => {
    const { band, session } = await openBand();
    const collector = new StreamCollector(session);
    const seconds: LiveOpticalSecond[] = [];
    collector.onOptical((s) => seconds.push(s));
    await switchStreams(session, ['optical'], true);
    expect(band.opticalOn).toBe(true);
    await wait(350);
    await switchStreams(session, ['optical'], false);
    expect(seconds.length).toBeGreaterThanOrEqual(2);
    expect(seconds[0]?.blocks).toHaveLength(5);
    expect(seconds[0]?.blocks[0]?.count).toBe(25);
    expect(seconds[0]?.blocks[3]?.driveA).toBe(0);
    expect(collector.measuredRate('optical')).toBe(25);
    expect(collector.measuredRate('imu')).toBeNull();
    collector.close();
    await session.close();
  });

  it('switchStreams throws RawStreamError when the band refuses', async () => {
    const { band, session } = await openBand({ rawUnsupported: true });
    await expect(switchStreams(session, ['imu'], true)).rejects.toBeInstanceOf(RawStreamError);
    expect(band.imuOn).toBe(false);
    await session.close();
  });

  it('startBandRecording sends [02][u32] and stopBandRecording [01]', async () => {
    const { band, session } = await openBand();
    await startBandRecording(session, 10_800_000);
    await stopBandRecording(session);
    expect(band.rawSessionBodies.map((b) => [...b])).toEqual([
      [2, 0x80, 0xcb, 0xa4, 0],
      [1],
    ]);
    await session.close();
  });

  it('isLiveSignal is false for history R21', () => {
    const live = encodeImu({ recordIndex: 1, unixS: NOW_S, packetType: 43, accel: STILL, gyro: STILL });
    const history = encodeImu({ recordIndex: 1, unixS: NOW_S, packetType: 47, accel: STILL, gyro: STILL });
    expect(isLiveSignal({ kind: 'record', packetType: 43, layout: 21, recordIndex: 1, unixS: NOW_S, subsec: 0, record: { type: 'unknown', reason: 'length' } })).toBe(true);
    expect(isLiveSignal({ kind: 'record', packetType: 47, layout: 21, recordIndex: 1, unixS: NOW_S, subsec: 0, record: { type: 'unknown', reason: 'length' } })).toBe(false);
    expect(isLiveSignal({ kind: 'record', packetType: 43, layout: 17, recordIndex: 1, unixS: NOW_S, subsec: 0, record: { type: 'unknown', reason: 'length' } })).toBe(false);
    expect(live.length).toBe(history.length);
  });
});

describe('refusing single commands', () => {
  it('refuses only the listed commands', async () => {
    const { band, session } = await openBand({ rawRefuse: [Command.TOGGLE_OPTICAL_MODE, Command.STOP_RAW_DATA] });
    await switchStreams(session, ['imu'], true);
    await expect(switchStreams(session, ['optical'], true)).rejects.toBeInstanceOf(RawStreamError);
    await expect(stopBandRecording(session)).rejects.toBeInstanceOf(RawStreamError);
    expect(band.imuOn).toBe(true);
    expect(band.opticalOn).toBe(false);
    await switchStreams(session, ['imu'], false);
    await session.close();
  });
});
