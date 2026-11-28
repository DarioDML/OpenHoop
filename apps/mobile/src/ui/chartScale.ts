export interface Domain {
  min: number;
  max: number;
}

function roundTo(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toPrecision(12));
}

export function niceStep(span: number): number {
  const raw = span / 2;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function flatDomain(value: number, minSpan: number): Domain {
  const span = Math.max(minSpan, Math.abs(value) * 0.05, Number.EPSILON);
  const step = niceStep(span);
  let min = roundTo(Math.floor((value - span / 2) / step) * step, step);
  const max = roundTo(Math.ceil((value + span / 2) / step) * step, step);
  if (value >= 0 && min < 0) min = 0;
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
