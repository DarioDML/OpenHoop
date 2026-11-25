import type { Night, Sample, SleepPeriod } from '../src';

export function sample(t: number, over: Partial<Sample> = {}): Sample {
  return { t, hr: null, rr: [], steps: null, skinTempC: null, spo2Raw: null, state: null, motionG: null, ...over };
}

export function expandRuns(runs: [number, number][]): number[] {
  const out: number[] = [];
  for (const [start, count] of runs) for (let i = 0; i < count; i++) out.push(start + i);
  return out;
}

export function nightOf(periods: [number, number][]): Night {
  const ps: SleepPeriod[] = periods.map(([onset, offset]) => ({
    onset,
    offset,
    asleepS: offset - onset + 1,
    inBedS: offset - onset + 1,
    hrMin: null,
    hrMean: null,
  }));
  const first = ps[0];
  const last = ps[ps.length - 1];
  return {
    periods: ps,
    onset: first?.onset ?? 0,
    offset: last?.offset ?? 0,
    asleepS: ps.reduce((a, p) => a + p.asleepS, 0),
    inBedS: ps.reduce((a, p) => a + p.inBedS, 0),
  };
}

export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface BeatOptions {
  start: number;
  seconds: number;
  rr: (beatTimeS: number, index: number) => number;
  hr?: number;
  keep?: () => boolean;
  state?: Sample['state'];
}

export function beatSamples(o: BeatOptions): Sample[] {
  const per: number[][] = Array.from({ length: o.seconds }, () => []);
  let t = 0;
  let i = 0;
  for (;;) {
    const v = Math.round(o.rr(t, i));
    t += v / 1000;
    i++;
    const sec = Math.floor(t);
    if (sec >= o.seconds) break;
    if (o.keep === undefined || o.keep()) per[sec]?.push(v);
  }
  return per.map((rr, k) => sample(o.start + k, { rr, hr: o.hr ?? 60, state: o.state ?? 'SLEEP' }));
}
