import type { PartSink } from '@openhoop/core';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';

export const DONATION_WORK_PREFIX = 'donation-';
export const ANDROID_DOWNLOADS_URI = 'content://com.android.externalstorage.documents/document/primary%3ADownload';
export const COPY_CHUNK_BYTES = 1_048_576;

const ZIP_MIME = 'application/zip';
const CANCEL_CODES: ReadonlySet<string> = new Set(['ERR_PICKER_CANCELLED', 'ERR_FILE_PICKING_CANCELLED']);

export type SaveOutcome = { kind: 'saved'; folderUri: string } | { kind: 'shareEach' } | { kind: 'cancelled' };

export function removeLeftoverDonations(): void {
  for (const entry of new Directory(Paths.cache).list()) {
    if (entry instanceof Directory && entry.name.startsWith(DONATION_WORK_PREFIX)) entry.delete();
  }
}

export function createDonationWorkspace(now: Date): Directory {
  const workspace = new Directory(Paths.cache, `${DONATION_WORK_PREFIX}${now.getTime()}`);
  workspace.create({ intermediates: true, overwrite: true });
  return workspace;
}

export function filePartSink(workspace: Directory, fileName: string): PartSink {
  const file = new File(workspace, fileName);
  file.create({ overwrite: true });
  const handle = file.open(FileMode.WriteOnly);
  let open = true;
  const close = (): void => {
    if (!open) return;
    open = false;
    handle.close();
  };
  return {
    write: (chunk) => handle.writeBytes(chunk),
    finish: async () => {
      close();
      return file.size;
    },
    discard: async () => {
      try {
        close();
      } finally {
        if (file.exists) file.delete();
      }
    },
  };
}

function isCancel(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && CANCEL_CODES.has(error.code);
}

async function copyInto(source: File, target: File): Promise<void> {
  const input = source.open(FileMode.ReadOnly);
  const output = target.open(FileMode.WriteOnly);
  try {
    for (let chunk = await input.readBytes(COPY_CHUNK_BYTES); chunk.length > 0; chunk = await input.readBytes(COPY_CHUNK_BYTES)) {
      await output.writeBytes(chunk);
    }
  } finally {
    input.close();
    output.close();
  }
}

async function writeInto(workspace: Directory, fileNames: readonly string[], target: Directory): Promise<boolean> {
  const written: File[] = [];
  try {
    for (const name of fileNames) {
      const out = target.createFile(name, ZIP_MIME);
      written.push(out);
      await copyInto(new File(workspace, name), out);
    }
    return true;
  } catch {
    for (const file of written) {
      try {
        file.delete();
      } catch {
        // the donor can remove a partial file from the folder themselves
      }
    }
    return false;
  }
}

export async function saveDonationParts(
  workspace: Directory,
  fileNames: readonly string[],
  remembered: string | null,
  platform: 'android' | 'ios',
): Promise<SaveOutcome> {
  if (platform === 'android' && remembered !== null && (await writeInto(workspace, fileNames, new Directory(remembered)))) {
    return { kind: 'saved', folderUri: remembered };
  }
  let target: Directory;
  try {
    target = await Directory.pickDirectoryAsync(platform === 'android' ? ANDROID_DOWNLOADS_URI : undefined);
  } catch (error) {
    return isCancel(error) ? { kind: 'cancelled' } : { kind: 'shareEach' };
  }
  return (await writeInto(workspace, fileNames, target)) ? { kind: 'saved', folderUri: target.uri } : { kind: 'shareEach' };
}

export async function sharePartFile(workspace: Directory, fileName: string): Promise<void> {
  await shareAsync(new File(workspace, fileName).uri, { mimeType: ZIP_MIME, dialogTitle: fileName });
}
