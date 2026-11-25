import { lowerBound, sortedUnique } from '@openhoop/analytics';
import type { Night, Sample, SleepPeriod } from '@openhoop/analytics';
import type { SleepEdit, SleepSource } from './store/types';

const HOUR_S = 3_600;
const HR_MIN = 25;
const HR_MAX = 230;

export const EDITED_SLEEP_MAX_S = 16 * HOUR_S;
export const MANUAL_NAP_MAX_S = 4 * HOUR_S;

export type SleepEditProblem = 'end-before-start' | 'too-long' | 'future' | 'overlap';

export interface SleepSpan {
  onset: number;
  offset: number;
}

export type SleepEditDraft = Pick<SleepEdit, 'targetOnset' | 'onset' | 'offset'>;

export interface MergedSleepPeriod extends SleepPeriod {
  source: SleepSource;
  editId: number | null;
  measured: SleepPeriod[];
}

export function sleepEditSource(edit: Pick<SleepEdit, 'targetOnset'>): SleepSource {
  return edit.targetOnset === null ? 'manual' : 'edited';
}

export function sleepEditMaxS(edit: Pick<SleepEdit, 'targetOnset'>): number {
  return sleepEditSource(edit) === 'manual' ? MANUAL_NAP_MAX_S : EDITED_SLEEP_MAX_S;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function validateSleepEdit(draft: SleepEditDraft, others: readonly SleepSpan[], nowS: number): SleepEditProblem | null {
  if (!Number.isFinite(draft.onset) || !Number.isFinite(draft.offset) || draft.offset <= draft.onset) return 'end-before-start';
  if (draft.offset - draft.onset > sleepEditMaxS(draft)) return 'too-long';
  if (draft.offset > nowS) return 'future';
  if (others.some((o) => overlaps(draft.onset, draft.offset, o.onset, o.offset))) return 'overlap';
  return null;
}

export function editsTouching<E extends SleepEdit>(edits: readonly E[], from: number, to: number): E[] {
  return edits.filter(
    (e) =>
      overlaps(e.onset, e.offset, from, to) ||
      (e.targetOnset !== null && e.targetOffset !== null && overlaps(e.targetOnset, e.targetOffset, from, to)),
  );
}

export function measuredNight(night: Night<MergedSleepPeriod>): Night {
  return { ...night, periods: night.periods.flatMap((p) => p.measured) };
}

function detectedEnd(period: SleepPeriod): number {
  return period.offset + 1;
}

interface Summary {
  asleepS: number;
  hrMin: number | null;
  hrMean: number | null;
}

function summarize(rows: readonly Sample[], start: number, end: number): Summary {
  let asleepS = 0;
  let hrMin: number | null = null;
  let hrSum = 0;
  let hrCount = 0;
  for (let i = lowerBound(rows, start); i < rows.length; i++) {
    const row = rows[i];
    if (row === undefined || row.t >= end) break;
    if (row.state === 'SLEEP') asleepS++;
    if (row.hr !== null && row.hr >= HR_MIN && row.hr <= HR_MAX) {
      hrMin = hrMin === null ? row.hr : Math.min(hrMin, row.hr);
      hrSum += row.hr;
      hrCount++;
    }
  }
  return { asleepS, hrMin, hrMean: hrCount > 0 ? hrSum / hrCount : null };
}

function periodOf(rows: readonly Sample[], start: number, end: number): SleepPeriod {
  return { onset: start, offset: end - 1, inBedS: end - start, ...summarize(rows, start, end) };
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
  let measuredAsleep = 0;
  let hullStart = Infinity;
  let hullEnd = -Infinity;
  for (const period of absorbed) {
    hullStart = Math.min(hullStart, period.onset);
    hullEnd = Math.max(hullEnd, detectedEnd(period));
    const start = Math.max(edit.onset, period.onset);
    const end = Math.min(edit.offset, detectedEnd(period));
    if (end <= start) continue;
    const clipped = periodOf(rows, start, end);
    measured.push(clipped);
    measuredAsleep += clipped.asleepS;
  }
  const outsideHull =
    absorbed.length === 0
      ? edit.offset - edit.onset
      : Math.max(0, Math.min(edit.offset, hullStart) - edit.onset) + Math.max(0, edit.offset - Math.max(edit.onset, hullEnd));
  const whole = summarize(rows, edit.onset, edit.offset);
  return {
    onset: edit.onset,
    offset: edit.offset,
    asleepS: measuredAsleep + outsideHull,
    inBedS: edit.offset - edit.onset,
    hrMin: whole.hrMin,
    hrMean: whole.hrMean,
    source: sleepEditSource(edit),
    editId: edit.id,
    measured: measured.length > 0 ? measured.sort((a, b) => a.onset - b.onset) : [periodOf(rows, edit.onset, edit.offset)],
  };
}

export function applySleepEdits(
  detected: readonly SleepPeriod[],
  edits: readonly SleepEdit[],
  samples: readonly Sample[],
): MergedSleepPeriod[] {
  const accepted = acceptedEdits(edits);
  const detectedOnly = (p: SleepPeriod): MergedSleepPeriod => ({ ...p, source: 'detected', editId: null, measured: [p] });
  if (accepted.length === 0) return detected.map(detectedOnly);
  const rows = sortedUnique(samples);
  const taken = new Set<SleepPeriod>();
  const out: MergedSleepPeriod[] = [];
  for (const edit of accepted) {
    const absorbed = detected.filter((p) => !taken.has(p) && absorbs(edit, p));
    for (const p of absorbed) taken.add(p);
    out.push(editedPeriod(edit, absorbed, rows));
  }
  for (const p of detected) if (!taken.has(p)) out.push(detectedOnly(p));
  return out.sort((a, b) => a.onset - b.onset);
}
