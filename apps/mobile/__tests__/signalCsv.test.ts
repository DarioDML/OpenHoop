import type { LiveImuSecond, LiveOpticalSecond } from '@openhoop/core';
import type { OpticalBlock } from '@openhoop/protocol';

import { channelRole } from '@/data/opticalChannels';
import { rawStreamName } from '@/data/rawSessions';
import { imuCsv, opticalCsv } from '@/data/signalCsv';
import { tracePath } from '@/ui/dev/SignalTrace';

function imu(t: number, n: number): LiveImuSecond {
  const fill = (v: number): number[] => new Array<number>(n).fill(v);
  const gx = fill(164);
  gx[1] = -32768;
  return { t, recordIndex: 1, rateHz: 100, accel: [fill(0), fill(-2048), fill(4096)], gyro: [gx, fill(0), fill(-164)] };
}

function block(sourceA: number, driveA: number, samples: number[]): OpticalBlock {
  return { count: samples.length, sourceA, driveA, sourceB: 4, driveB: driveA === 0 ? 0 : 5500, detectorA: 3, rangeA: 32, offsetA: 0, detectorB: 4, rangeB: 32, offsetB: 0, slotA: samples, slotB: samples.map((v) => v + 1) };
}

describe('motion CSV', () => {
  it('converts to g and degrees per second, blanks an invalid gyro and steps 10 ms at 100 Hz', () => {
    const lines = imuCsv([imu(1_795_878_769.5, 3)]).split('\r\n');
    expect(lines[0]).toBe('t_ms,ax_g,ay_g,az_g,gx_dps,gy_dps,gz_dps');
    expect(lines[1]).toBe('1795878769500,0.0000,-0.5000,1.0000,10.010,0.000,-10.010');
    expect(lines[2]).toBe('1795878769510,0.0000,-0.5000,1.0000,,0.000,-10.010');
    expect(lines[3]?.startsWith('1795878769520,')).toBe(true);
    expect(lines[4]).toBe('');
  });
});

describe('motion CSV gaps', () => {
  it('leaves a missing accelerometer sample empty instead of writing zero', () => {
    const second: LiveImuSecond = { t: 1, recordIndex: 1, rateHz: 100, accel: [[4096, 4096], [0], [0, 0]], gyro: [[0, 0], [0, 0], [0, 0]] };
    const lines = imuCsv([second]).split('\r\n');
    expect(lines[2]).toBe('1010,1.0000,,0.0000,0.000,0.000,0.000');
  });
});

describe('trace path', () => {
  it('breaks the line at gaps and never writes NaN', () => {
    const d = tracePath([1, Number.NaN, Number.NaN, 2, 3], 5, 20, 0, 4);
    expect(d).not.toContain('NaN');
    expect(d.match(/M/g)).toHaveLength(2);
  });
});

describe('optical CSV', () => {
  it('writes one row per sample with its LED, detector and drive', () => {
    const second: LiveOpticalSecond = { t: 1_000, recordIndex: 1, rateHz: 25, blocks: [block(1, 2750, [200_000, 200_010]), block(3, 12_750, [])] };
    const lines = opticalCsv([second]).split('\r\n');
    expect(lines[0]).toBe('t_ms,block,slot,led,detector,drive,value');
    expect(lines.slice(1, 5)).toEqual(['1000000,0,A,1,3,2750,200000', '1000040,0,A,1,3,2750,200010', '1000000,0,B,4,4,5500,200001', '1000040,0,B,4,4,5500,200011']);
    expect(lines).toHaveLength(6);
  });
});

describe('optical channel roles', () => {
  it('names each channel by the rules from the probe', () => {
    expect(channelRole({ sourceA: 2, driveA: 0, sourceB: 4, driveB: 0 }, 'A')).toBe('dark');
    expect(channelRole({ sourceA: 1, driveA: 2750, sourceB: 4, driveB: 5500 }, 'A')).toBe('pulse');
    expect(channelRole({ sourceA: 1, driveA: 2750, sourceB: 4, driveB: 5500 }, 'B')).toBe('pulse');
    expect(channelRole({ sourceA: 2, driveA: 200, sourceB: 4, driveB: 0 }, 'A')).toBe('wear');
    expect(channelRole({ sourceA: 2, driveA: 200, sourceB: 4, driveB: 0 }, 'B')).toBe('dark');
    expect(channelRole({ sourceA: 3, driveA: 12_750, sourceB: 4, driveB: 0 }, 'A')).toBe('spo2Red');
    expect(channelRole({ sourceA: 2, driveA: 5300, sourceB: 4, driveB: 0 }, 'A')).toBe('spo2Ir');
    expect(channelRole({ sourceA: 9, driveA: 100, sourceB: 4, driveB: 0 }, 'A')).toBe('unknown');
  });
});

describe('stream CSV names', () => {
  it('names motion and optical recordings apart from packet sessions', () => {
    const at = new Date(2026, 10, 28, 16, 5, 9);
    expect(rawStreamName('imu', at)).toBe('raw-imu-20261128-160509.csv');
    expect(rawStreamName('ppg', at)).toBe('raw-ppg-20261128-160509.csv');
  });
});
