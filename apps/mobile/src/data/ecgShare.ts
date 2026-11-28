import type { EcgSummary } from '@openhoop/core';

import { removeCsvFolder, shareCsvFile } from './csvShare';
import { ecgCsv, ecgFileName } from './ecg';

const ECG_FOLDER = 'ecg-share';

export function removeLeftoverEcgFiles(): void {
  removeCsvFolder(ECG_FOLDER);
}

export async function shareEcgCsv(recording: EcgSummary, samples: readonly number[]): Promise<void> {
  await shareCsvFile(ECG_FOLDER, ecgFileName(recording), ecgCsv(recording, samples));
}
