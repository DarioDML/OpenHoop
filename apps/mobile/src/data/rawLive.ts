import type { LiveImuSecond, LiveOpticalSecond, StreamKind } from '@openhoop/core';
import { GYRO_INVALID } from '@openhoop/protocol';

export const TAIL_SECONDS = 5;
export const ACCEL_LSB_PER_G = 4096;
export const GYRO_LSB_PER_DPS = 16.384;

export interface ImuTail {
  ax: number[];
  ay: number[];
  az: number[];
  gx: number[];
  gy: number[];
  gz: number[];
}

export const EMPTY_IMU_TAIL: ImuTail = { ax: [], ay: [], az: [], gx: [], gy: [], gz: [] };

export interface OpticalChannelTail {
  block: number;
  slot: 'A' | 'B';
  source: number;
  detector: number;
  drive: number;
  samples: number[];
}

export interface RawLiveState {
  owners: { developer: StreamKind[]; workout: StreamKind[] };
  imu: { rateHz: number | null; seconds: number; tail: ImuTail } | null;
  optical: { rateHz: number | null; seconds: number; channels: OpticalChannelTail[] } | null;
}

export const IDLE_RAW_LIVE: RawLiveState = { owners: { developer: [], workout: [] }, imu: null, optical: null };

function keep(previous: readonly number[], added: readonly number[], limit: number): number[] {
  const joined = [...previous, ...added];
  return joined.length > limit ? joined.slice(joined.length - limit) : joined;
}

export function appendImuTail(tail: ImuTail, second: LiveImuSecond): ImuTail {
  const limit = Math.max(1, second.rateHz) * TAIL_SECONDS;
  const g = (axis: readonly number[]): number[] => axis.map((v) => v / ACCEL_LSB_PER_G);
  const dps = (axis: readonly number[]): number[] => axis.filter((v) => v !== GYRO_INVALID).map((v) => v / GYRO_LSB_PER_DPS);
  return {
    ax: keep(tail.ax, g(second.accel[0]), limit),
    ay: keep(tail.ay, g(second.accel[1]), limit),
    az: keep(tail.az, g(second.accel[2]), limit),
    gx: keep(tail.gx, dps(second.gyro[0]), limit),
    gy: keep(tail.gy, dps(second.gyro[1]), limit),
    gz: keep(tail.gz, dps(second.gyro[2]), limit),
  };
}

export function opticalChannels(previous: readonly OpticalChannelTail[], second: LiveOpticalSecond): OpticalChannelTail[] {
  const limit = Math.max(1, second.rateHz) * TAIL_SECONDS;
  const out: OpticalChannelTail[] = [];
  second.blocks.forEach((b, block) => {
    if (b.count === 0) return;
    for (const slot of ['A', 'B'] as const) {
      const before = previous.find((c) => c.block === block && c.slot === slot);
      out.push({
        block,
        slot,
        source: slot === 'A' ? b.sourceA : b.sourceB,
        detector: slot === 'A' ? b.detectorA : b.detectorB,
        drive: slot === 'A' ? b.driveA : b.driveB,
        samples: keep(before?.samples ?? [], slot === 'A' ? b.slotA : b.slotB, limit),
      });
    }
  });
  return out;
}
