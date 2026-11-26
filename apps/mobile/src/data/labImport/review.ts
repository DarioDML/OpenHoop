import type { LabResultInput } from '@openhoop/core';

import { BIOMARKER_UNITS, CUSTOM_PICK, LAB_LIMITS, isBiomarkerId, validateLabDraft, type BiomarkerId, type LabDraft, type LabField } from '@/data/labs';

import type { Censor, LabCandidate } from './parse';
import { normalizeUnit } from './units';

export interface ReviewRow {
  id: string;
  printedName: string;
  matchedAs: BiomarkerId | null;
  selected: boolean;
  censored: Censor | null;
  printedValue: string;
  draft: LabDraft;
}

function plain(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function rowsFromCandidates(candidates: readonly LabCandidate[], fallbackDay: string, censoredNote: (printed: string) => string): ReviewRow[] {
  return candidates.map((candidate, index) => {
    const printedValue = `${candidate.censored ?? ''}${plain(candidate.value)}`;
    return {
      id: `row-${index}`,
      printedName: candidate.name,
      matchedAs: candidate.biomarker,
      selected: candidate.biomarker !== null && candidate.censored === null,
      censored: candidate.censored,
      printedValue,
      draft: {
        biomarker: candidate.biomarker ?? '',
        customName: candidate.biomarker === null ? candidate.name.slice(0, LAB_LIMITS.nameLength) : '',
        unit: candidate.unit,
        value: plain(candidate.value),
        day: candidate.day ?? fallbackDay,
        refLow: candidate.refLow === null ? '' : plain(candidate.refLow),
        refHigh: candidate.refHigh === null ? '' : plain(candidate.refHigh),
        note: candidate.censored === null ? '' : censoredNote(printedValue).slice(0, LAB_LIMITS.noteLength),
      },
    };
  });
}

export function remapRow(row: ReviewRow, biomarker: string): ReviewRow {
  if (biomarker === row.draft.biomarker) return row;
  if (isBiomarkerId(biomarker)) {
    const label = normalizeUnit(row.draft.unit);
    const fits = label !== null && BIOMARKER_UNITS[biomarker].some((unit) => unit.label === label);
    return { ...row, draft: { ...row.draft, biomarker, unit: fits ? label : '' } };
  }
  if (biomarker === CUSTOM_PICK) {
    return { ...row, draft: { ...row.draft, biomarker, customName: row.draft.customName === '' ? row.printedName.slice(0, LAB_LIMITS.nameLength) : row.draft.customName } };
  }
  return row;
}

export type ReviewValidation = { ok: true; inputs: Array<{ id: string; input: LabResultInput }> } | { ok: false; invalid: Record<string, LabField[]> };

export function validateSelected(rows: readonly ReviewRow[], today: string): ReviewValidation {
  const inputs: Array<{ id: string; input: LabResultInput }> = [];
  const invalid: Record<string, LabField[]> = {};
  let failed = false;
  for (const row of rows) {
    if (!row.selected) continue;
    const result = validateLabDraft(row.draft, today);
    if (result.ok) inputs.push({ id: row.id, input: result.value });
    else {
      invalid[row.id] = result.invalid;
      failed = true;
    }
  }
  return failed ? { ok: false, invalid } : { ok: true, inputs };
}
