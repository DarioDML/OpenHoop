export const RR_MIN_MS = 300;
export const RR_MAX_MS = 2000;
export const RR_MAX_STEP_MS = 200;

function inRange(x: number): boolean {
  return x >= RR_MIN_MS && x <= RR_MAX_MS;
}

export function cleanRr(rrMs: number[], maxStepMs: number = RR_MAX_STEP_MS): number[] {
  const out: number[] = [];
  let prev: number | null = null;
  for (const x of rrMs) {
    if (!inRange(x)) continue;
    if (prev === null || Math.abs(x - prev) < maxStepMs) out.push(x);
    prev = x;
  }
  return out;
}

export function rmssd(rrMs: number[], maxStepMs: number = RR_MAX_STEP_MS): number | null {
  let count = 0;
  let sum = 0;
  let prev: number | null = null;
  for (const x of rrMs) {
    if (!inRange(x)) continue;
    if (prev !== null) {
      const d = x - prev;
      if (Math.abs(d) < maxStepMs) {
        sum += d * d;
        count++;
      }
    }
    prev = x;
  }
  return count < 10 ? null : Math.sqrt(sum / count);
}
