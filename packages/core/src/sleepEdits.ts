import { sortedUnique } from '@openhoop/analytics';
import type { Sample, SleepPeriod } from '@openhoop/analytics';
import type { SleepEdit, SleepEditKind, SleepSource } from './store/types';

const HOUR_S = 3_600;
const HR_MIN = 25;
const HR_MAX = 230;

export const SLEEP_EDIT_MAX_S: Readonly<Record<SleepEditKind, number>> = { night: 16 * HOUR_S, nap: 4 * HOUR_S };

export type SleepEditProblem = 'end-before-start' | 'too-long' | 'future' | 'overlap';

export interface SleepSpan {
  onset: number;
  offset: number;
}

export interface MergedSleepPeriod extends SleepPeriod {
  source: SleepSource;
  editId: number | null;
  forcedNap: boolean;
  measured: SleepPeriod[];
}

export function sleepEditSource(edit: Pick<SleepEdit, 'targetOnset'>): SleepSource {
  return edit.targetOnset === null ? 'manual' : 'edited';
}

export function validateSleepEdit(
  input: { kind: SleepEditKind; onset: number; offset: number },
  others: readonly SleepSpan[],
  nowS: number,
): SleepEditProblem | null {
  if (!Number.isFinite(input.onset) || !Number.isFinite(input.offset) || input.offset <= input.onset) return 'end-before-start';
  if (input.offset - input.onset > SLEEP_EDIT_MAX_S[input.kind]) return 'too-long';
  if (input.offset > nowS) return 'future';
  if (others.some((o) => input.onset < o.offset && o.onset < input.offset)) return 'overlap';
  return null;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function detectedEnd(period: SleepPeriod): number {
  return period.offset + 1;
}

function summarize(rows: readonly Sample[], start: number, end: number): { asleepS: number; hrMin: number | null; hrMean: number | null } {
  let asleepS = 0;
  let hrMin: number | null = null;
  let hrSum = 0;
  let hrCount = 0;
  for (const row of rows) {
    if (row.t < start || row.t >= end) continue;
    if (row.state === 'SLEEP') asleepS++;
    if (row.hr !== null && row.hr >= HR_MIN && row.hr <= HR_MAX) {
      hrMin = hrMin === null ? row.hr : Math.min(hrMin, row.hr);
      hrSum += row.hr;
      hrCount++;
    }
  }
  return { asleepS, hrMin, hrMean: hrCount > 0 ? hrSum / hrCount : null };
}

function acceptedEdits(edits: readonly SleepEdit[]): SleepEdit[] {
  const accepted: SleepEdit[] = [];
  for (const edit of [...edits].sort((a, b) => a.id - b.id)) {
    if (!Number.isFinite(edit.onset) || !Number.isFinite(edit.offset) || edit.offset <= edit.onset) continue;
    if (accepted.some((a) => overlaps(a.onset, a.offset, edit.onset, edit.offset))) continue;
    accepted.push(edit);
  }
  return accepted;
}

function absorbs(edit: SleepEdit, period: SleepPeriod): boolean {
  const end = detectedEnd(period);
  if (overlaps(edit.onset, edit.offset, period.onset, end)) return true;
  return edit.targetOnset !== null && edit.targetOffset !== null && overlaps(edit.targetOnset, edit.targetOffset, period.onset, end);
}

function editedPeriod(edit: SleepEdit, absorbed: readonly SleepPeriod[], rows: readonly Sample[]): MergedSleepPeriod {
  const measured: SleepPeriod[] = [];
  let measuredSeconds = 0;
  let measuredAsleep = 0;
  for (const period of absorbed) {
    const start = Math.max(edit.onset, period.onset);
    const end = Math.min(edit.offset, detectedEnd(period));
    if (end <= start) continue;
    const summary = summarize(rows, start, end);
    measured.push({ onset: start, offset: end - 1, asleepS: summary.asleepS, inBedS: end - start, hrMin: summary.hrMin, hrMean: summary.hrMean });
    measuredSeconds += end - start;
    measuredAsleep += summary.asleepS;
  }
  const inBedS = edit.offset - edit.onset;
  const whole = summarize(rows, edit.onset, edit.offset);
  return {
    onset: edit.onset,
    offset: edit.offset,
    asleepS: measuredAsleep + (inBedS - measuredSeconds),
    inBedS,
    hrMin: whole.hrMin,
    hrMean: whole.hrMean,
    source: sleepEditSource(edit),
    editId: edit.id,
    forcedNap: edit.kind === 'nap',
    measured: measured.sort((a, b) => a.onset - b.onset),
  };
}

export function applySleepEdits(detected: readonly SleepPeriod[], edits: readonly SleepEdit[], samples: readonly Sample[]): MergedSleepPeriod[] {
  const accepted = acceptedEdits(edits);
  const detectedOnly = (p: SleepPeriod): MergedSleepPeriod => ({ ...p, source: 'detected', editId: null, forcedNap: false, measured: [p] });
  if (accepted.length === 0) return detected.map(detectedOnly);
  const rows = sortedUnique(samples);
  const taken = new Set<SleepPeriod>();
  const out: MergedSleepPeriod[] = [];
  for (const edit of accepted) {
    const absorbed = detected.filter((p) => absorbs(edit, p));
    for (const p of absorbed) taken.add(p);
    out.push(editedPeriod(edit, absorbed, rows));
  }
  for (const p of detected) {
    if (taken.has(p)) continue;
    out.push(detectedOnly(p));
  }
  return out.sort((a, b) => a.onset - b.onset);
}
