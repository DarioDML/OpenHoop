import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { ShareUnavailableError } from './reportShare';

function folder(name: string): Directory {
  return new Directory(Paths.cache, name);
}

export function removeCsvFolder(name: string): void {
  try {
    const dir = folder(name);
    if (dir.exists) dir.delete();
  } catch {
    return;
  }
}

export async function shareCsvFile(folderName: string, fileName: string, csv: string): Promise<void> {
  if (!(await isAvailableAsync())) throw new ShareUnavailableError();
  removeCsvFolder(folderName);
  const dir = folder(folderName);
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, fileName);
  file.write(csv);
  try {
    await shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'OpenHoop' });
  } finally {
    removeCsvFolder(folderName);
  }
}
