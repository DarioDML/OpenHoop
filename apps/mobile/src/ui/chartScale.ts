export interface Domain {
  min: number;
  max: number;
}

export interface Clamp {
  min?: number;
  max?: number;
}

const SNAP = 1e-9;

function roundTo(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toPrecision(12));
}

function floorTo(value: number, step: number): number {
  return roundTo(Math.floor(value / step + SNAP) * step, step);
}

function ceilTo(value: number, step: number): number {
  return roundTo(Math.ceil(value / step - SNAP) * step, step);
}

export function niceStep(span: number): number {
  const raw = span / 2;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 + SNAP ? 1 : fraction <= 2 + SNAP ? 2 : fraction <= 5 + SNAP ? 5 : 10;
  return nice * magnitude;
}

export function flatDomain(value: number, minSpan: number, clamp: Clamp = {}): Domain {
  const span = minSpan > 0 ? minSpan : Math.max(Math.abs(value) * 0.05, 1);
  const step = niceStep(span);
  let min = floorTo(value - span / 2, step);
  let max = ceilTo(value + span / 2, step);
  const low = clamp.min ?? (value >= 0 ? 0 : undefined);
  const high = clamp.max;
  if (low !== undefined && min < low && value >= low) {
    min = low;
    max = Math.max(max, ceilTo(low + span, step));
  }
  if (high !== undefined && max > high && value <= high) {
    max = high;
    min = Math.min(min, floorTo(high - span, step));
    if (low !== undefined && min < low && value >= low) min = low;
  }
  return { min, max };
}

export function hourDomain(minutes: readonly number[]): Domain | null {
  if (minutes.length === 0) return null;
  const lo = Math.min(...minutes);
  const hi = Math.max(...minutes);
  const min = Math.floor((lo - 15) / 60) * 60;
  const max = Math.ceil((hi + 15) / 60) * 60;
  return { min, max: Math.max(max, min + 60) };
}
