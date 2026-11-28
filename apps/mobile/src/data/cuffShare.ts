import type { CuffReading } from '@openhoop/core';

import { removeCsvFolder, shareCsvFile } from './csvShare';
import { cuffCsv, cuffFileName } from './cuff';

const CUFF_FOLDER = 'cuff-share';

export function removeLeftoverCuffFiles(): void {
  removeCsvFolder(CUFF_FOLDER);
}

export async function shareCuffCsv(readings: readonly CuffReading[], tzOffsetOf: (unixS: number) => number, nowS: number): Promise<void> {
  await shareCsvFile(CUFF_FOLDER, cuffFileName(nowS), cuffCsv(readings, tzOffsetOf));
}
