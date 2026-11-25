import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';

import type { FileReport } from './parse';
import { SOURCE_LIMITS, type SourceFile } from './sources';

export type PickOutcome = { picked: false } | { picked: true; files: SourceFile[]; rejected: FileReport[] };

function rejection(name: string, problem: FileReport['problem']): FileReport {
  return { name, kind: null, rows: 0, invalid: 0, problem };
}

function removeCopy(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // the cached copy is cleared with the app cache
  }
}

export async function pickVendorFiles(): Promise<PickOutcome> {
  const result = await getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return { picked: false };
  const files: SourceFile[] = [];
  const rejected: FileReport[] = [];
  for (const asset of result.assets) {
    const file = new File(asset.uri);
    try {
      const size = asset.size ?? file.size;
      if (size !== null && size !== undefined && size > SOURCE_LIMITS.maxPickedBytes) {
        rejected.push(rejection(asset.name, 'too-large'));
        continue;
      }
      files.push({ name: asset.name, bytes: await file.bytes() });
    } catch {
      rejected.push(rejection(asset.name, 'unreadable'));
    } finally {
      removeCopy(file);
    }
  }
  return { picked: true, files, rejected };
}
