import type { LiveImuSecond, LiveOpticalSecond } from '@openhoop/core';
import type { OpticalBlock } from '@openhoop/protocol';

import { EMPTY_IMU_TAIL, TAIL_SECONDS, appendImuTail, opticalChannels } from '@/data/rawLive';

function imu(t: number, n: number, gyroX: number): LiveImuSecond {
  const fill = (v: number): number[] => new Array<number>(n).fill(v);
  return { t, recordIndex: t, rateHz: 100, accel: [fill(0), fill(-4096), fill(4096)], gyro: [fill(gyroX), fill(16.384 * 10), fill(0)] };
}

function block(count: number, sourceA: number, driveA: number): OpticalBlock {
  return {
    count,
    sourceA,
    driveA,
    sourceB: 4,
    driveB: driveA === 0 ? 0 : 5500,
    detectorA: 3,
    rangeA: 32,
    offsetA: 0,
    detectorB: 4,
    rangeB: 32,
    offsetB: 0,
    slotA: new Array<number>(count).fill(200_000),
    slotB: new Array<number>(count).fill(300_000),
  };
}

describe('live motion tail', () => {
  it('converts to g and degrees per second and keeps the last five seconds', () => {
    let tail = EMPTY_IMU_TAIL;
    for (let s = 0; s < 7; s++) tail = appendImuTail(tail, imu(s, 100, 0));
    expect(TAIL_SECONDS).toBe(5);
    expect(tail.ax).toHaveLength(500);
    expect(tail.ay[0]).toBe(-1);
    expect(tail.az[499]).toBe(1);
    expect(tail.gy[0]).toBeCloseTo(10, 5);
  });

  it('drops invalid gyro samples instead of drawing -2000 degrees per second', () => {
    const tail = appendImuTail(EMPTY_IMU_TAIL, imu(0, 100, -32768));
    expect(tail.gx).toEqual([]);
    expect(tail.gy).toHaveLength(100);
    expect(tail.ax).toHaveLength(100);
  });
});

describe('live optical channels', () => {
  it('lists only channels with samples, with their LED, detector and drive, and keeps five seconds', () => {
    const second = (t: number): LiveOpticalSecond => ({ t, recordIndex: t, rateHz: 25, blocks: [block(25, 1, 2750), block(0, 3, 12_750), block(0, 2, 5300), block(25, 2, 0), block(25, 2, 200)] });
    let channels = opticalChannels([], second(0));
    for (let t = 1; t < 7; t++) channels = opticalChannels(channels, second(t));
    expect(channels.map((c) => `${c.block}${c.slot}`)).toEqual(['0A', '0B', '3A', '3B', '4A', '4B']);
    expect(channels[0]).toMatchObject({ source: 1, detector: 3, drive: 2750 });
    expect(channels[1]).toMatchObject({ source: 4, detector: 4, drive: 5500 });
    expect(channels[0]?.samples).toHaveLength(125);
  });
});
