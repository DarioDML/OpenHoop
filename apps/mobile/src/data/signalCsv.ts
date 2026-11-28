import type { LiveImuSecond, LiveOpticalSecond } from '@openhoop/core';
import { GYRO_INVALID } from '@openhoop/protocol';

import { ACCEL_LSB_PER_G, GYRO_LSB_PER_DPS } from './rawLive';

function stampMs(t: number, i: number, rateHz: number): string {
  return String(Math.round((t + i / Math.max(1, rateHz)) * 1000));
}

export function imuCsv(seconds: readonly LiveImuSecond[]): string {
  const lines = ['t_ms,ax_g,ay_g,az_g,gx_dps,gy_dps,gz_dps'];
  for (const s of seconds) {
    const n = s.accel[0].length;
    for (let i = 0; i < n; i++) {
      const g = (axis: readonly number[]): string => {
        const v = axis[i];
        return v === undefined ? '' : (v / ACCEL_LSB_PER_G).toFixed(4);
      };
      const dps = (axis: readonly number[]): string => {
        const v = axis[i];
        return v === undefined || v === GYRO_INVALID ? '' : (v / GYRO_LSB_PER_DPS).toFixed(3);
      };
      lines.push([stampMs(s.t, i, s.rateHz), g(s.accel[0]), g(s.accel[1]), g(s.accel[2]), dps(s.gyro[0]), dps(s.gyro[1]), dps(s.gyro[2])].join(','));
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function opticalCsv(seconds: readonly LiveOpticalSecond[]): string {
  const lines = ['t_ms,block,slot,led,detector,drive,value'];
  for (const s of seconds) {
    s.blocks.forEach((b, block) => {
      const slots = [
        ['A', b.sourceA, b.detectorA, b.driveA, b.slotA],
        ['B', b.sourceB, b.detectorB, b.driveB, b.slotB],
      ] as const;
      for (const [slot, led, detector, drive, values] of slots) {
        values.forEach((value, i) => lines.push([stampMs(s.t, i, s.rateHz), String(block), slot, String(led), String(detector), String(drive), String(value)].join(',')));
      }
    });
  }
  return `${lines.join('\r\n')}\r\n`;
}
