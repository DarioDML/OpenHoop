import type { VendorKind, VendorWriteResult } from '@openhoop/core';

import type { FileReport, ParsedExport } from './parse';

export const VENDOR_KIND_ORDER: readonly VendorKind[] = ['cycles', 'sleeps', 'workouts', 'journal'];

export interface KindCounts {
  imported: number;
  skipped: number;
  invalid: number;
}

export interface VendorImportResult {
  counts: Record<VendorKind, KindCounts>;
  files: FileReport[];
}

export function summariseImport(parsed: ParsedExport, written: VendorWriteResult, rejected: readonly FileReport[]): VendorImportResult {
  const counts: Record<VendorKind, KindCounts> = {
    cycles: { imported: 0, skipped: 0, invalid: 0 },
    sleeps: { imported: 0, skipped: 0, invalid: 0 },
    workouts: { imported: 0, skipped: 0, invalid: 0 },
    journal: { imported: 0, skipped: 0, invalid: 0 },
  };
  for (const kind of VENDOR_KIND_ORDER) {
    counts[kind] = {
      imported: written[kind].imported,
      skipped: written[kind].skipped + parsed.totals[kind].skipped,
      invalid: parsed.totals[kind].invalid,
    };
  }
  return { counts, files: [...rejected, ...parsed.files] };
}
