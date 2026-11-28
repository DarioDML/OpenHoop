import type { ImuSecond } from '../src/index';

const RATE = 100;
const ACCEL_LSB = 4096;
const GYRO_LSB = 16.384;
const LIFT_AXIS: [number, number, number] = [0.6, 0.3, 0.74];

export type Segment =
  | { kind: 'walk'; s: number }
  | { kind: 'still'; s: number }
  | { kind: 'lift'; reps: number; periodS: number; ampG: number; decay?: number };

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648 - 0.5;
  };
}

export function lift(reps: number, periodS = 2.5, ampG = 0.3): Segment {
  return { kind: 'lift', reps, periodS, ampG };
}

export function still(s: number): Segment {
  return { kind: 'still', s };
}

export function walk(s: number): Segment {
  return { kind: 'walk', s };
}

export function segmentSeconds(segments: readonly Segment[]): number {
  return segments.reduce((sum, seg) => sum + (seg.kind === 'lift' ? Math.round(seg.reps * seg.periodS) : seg.s), 0);
}

export function synthImu(deviceId: number, t0: number, segments: readonly Segment[]): ImuSecond[] {
  const noise = seeded(7);
  const norm = Math.hypot(...LIFT_AXIS);
  const u = LIFT_AXIS.map((v) => v / norm);
  const ax: number[] = [];
  const ay: number[] = [];
  const az: number[] = [];
  const gx: number[] = [];
  const gy: number[] = [];
  const gz: number[] = [];
  const push = (dyn: [number, number, number], gyro: [number, number, number]): void => {
    ax.push(Math.round((dyn[0] + 0.005 * noise()) * ACCEL_LSB));
    ay.push(Math.round((dyn[1] + 0.005 * noise()) * ACCEL_LSB));
    az.push(Math.round((1 + dyn[2] + 0.005 * noise()) * ACCEL_LSB));
    gx.push(Math.round((gyro[0] + 0.5 * noise()) * GYRO_LSB));
    gy.push(Math.round((gyro[1] + 0.5 * noise()) * GYRO_LSB));
    gz.push(Math.round((gyro[2] + 0.5 * noise()) * GYRO_LSB));
  };
  for (const seg of segments) {
    if (seg.kind === 'still') {
      for (let i = 0; i < seg.s * RATE; i++) push([0, 0, 0], [0, 0, 0]);
    } else if (seg.kind === 'walk') {
      for (let i = 0; i < seg.s * RATE; i++) {
        const t = i / RATE;
        push([0.1 * Math.sin(2 * Math.PI * 0.9 * t), 0, 0.15 * Math.sin(2 * Math.PI * 1.8 * t)], [80 * Math.cos(2 * Math.PI * 0.9 * t), 0, 0]);
      }
    } else {
      const n = Math.round(seg.reps * seg.periodS * RATE);
      for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const rep = Math.floor(t / seg.periodS);
        const a = seg.ampG * (seg.decay ?? 1) ** rep * Math.sin((2 * Math.PI * t) / seg.periodS);
        const w = 60 * Math.cos((2 * Math.PI * t) / seg.periodS);
        push([a * (u[0] ?? 0), a * (u[1] ?? 0), a * (u[2] ?? 0)], [w, 0.3 * w, 0]);
      }
    }
  }
  const out: ImuSecond[] = [];
  for (let s = 0; s * RATE < ax.length; s++) {
    const slice = (arr: number[]): number[] => arr.slice(s * RATE, (s + 1) * RATE);
    out.push({ deviceId, t: t0 + s, rateHz: RATE, accel: [slice(ax), slice(ay), slice(az)], gyro: [slice(gx), slice(gy), slice(gz)] });
  }
  return out;
}
