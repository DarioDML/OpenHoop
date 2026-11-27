import type { EcgSummary } from '@openhoop/core';
import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { ecgCsv, ecgFileName } from './ecg';
import { ShareUnavailableError } from './reportShare';

const ECG_FOLDER = 'ecg-share';

function folder(): Directory {
  return new Directory(Paths.cache, ECG_FOLDER);
}

export function removeLeftoverEcgFiles(): void {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    return;
  }
}

export async function shareEcgCsv(recording: EcgSummary, samples: readonly number[]): Promise<void> {
  if (!(await isAvailableAsync())) throw new ShareUnavailableError();
  removeLeftoverEcgFiles();
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, ecgFileName(recording));
  file.write(ecgCsv(recording, samples));
  try {
    await shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'OpenHoop' });
  } finally {
    removeLeftoverEcgFiles();
  }
}
