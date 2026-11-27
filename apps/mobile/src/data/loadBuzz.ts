import { isRecord, type Json } from '@/lib/json';
import { unixToIsoDate } from '@/lib/dates';

export type LoadBuzzThreshold = 'target' | 'top';

export interface LoadBuzzPrefs {
  atTarget: boolean;
  overTop: boolean;
  lastTarget: string | null;
  lastTop: string | null;
}

export interface LoadRange {
  low: number;
  high: number;
}

export interface LoadBuzzInput {
  prefs: LoadBuzzPrefs;
  load: number | null;
  aim: LoadRange | null;
  day: string | null;
  nowS: number;
  tzOffsetS: number;
}

export interface LoadBuzzDecision {
  thresholds: LoadBuzzThreshold[];
  kind: LoadBuzzThreshold;
  next: LoadBuzzPrefs;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function defaultLoadBuzzPrefs(): LoadBuzzPrefs {
  return { atTarget: false, overTop: false, lastTarget: null, lastTop: null };
}

function dayOrNull(value: Json | undefined): string | null {
  return typeof value === 'string' && ISO_DAY.test(value) ? value : null;
}

export function parseLoadBuzzPrefs(value: Json | undefined): LoadBuzzPrefs {
  if (!isRecord(value)) return defaultLoadBuzzPrefs();
  return {
    atTarget: value.atTarget === true,
    overTop: value.overTop === true,
    lastTarget: dayOrNull(value.lastTarget),
    lastTop: dayOrNull(value.lastTop),
  };
}

function reached(threshold: LoadBuzzThreshold, load: number, aim: LoadRange): boolean {
  return threshold === 'target' ? load >= aim.low : load > aim.high;
}

function lastOf(prefs: LoadBuzzPrefs, threshold: LoadBuzzThreshold): string | null {
  return threshold === 'target' ? prefs.lastTarget : prefs.lastTop;
}

function withLast(prefs: LoadBuzzPrefs, threshold: LoadBuzzThreshold, day: string): LoadBuzzPrefs {
  return threshold === 'target' ? { ...prefs, lastTarget: day } : { ...prefs, lastTop: day };
}

function enabled(prefs: LoadBuzzPrefs, threshold: LoadBuzzThreshold): boolean {
  return threshold === 'target' ? prefs.atTarget : prefs.overTop;
}

export function loadBuzzDecision({ prefs, load, aim, day, nowS, tzOffsetS }: LoadBuzzInput): LoadBuzzDecision | null {
  if (load === null || aim === null || day === null || !Number.isFinite(load)) return null;
  const today = unixToIsoDate(nowS, tzOffsetS);
  if (day !== today) return null;
  const due = (['target', 'top'] as const).filter((threshold) => enabled(prefs, threshold) && lastOf(prefs, threshold) !== today && reached(threshold, load, aim));
  if (due.length === 0) return null;
  const next = due.reduce((acc, threshold) => withLast(acc, threshold, today), prefs);
  return { thresholds: due, kind: due.includes('top') ? 'top' : 'target', next };
}

export function setLoadBuzz(prefs: LoadBuzzPrefs, threshold: LoadBuzzThreshold, on: boolean, load: number | null, aim: LoadRange | null, today: string): LoadBuzzPrefs {
  const switched: LoadBuzzPrefs = threshold === 'target' ? { ...prefs, atTarget: on } : { ...prefs, overTop: on };
  if (!on || load === null || aim === null || !reached(threshold, load, aim)) return switched;
  return withLast(switched, threshold, today);
}
