import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';

import { exportFolderName } from '@/lib/paths';

export class ShareUnavailableError extends Error {
  constructor() {
    super('sharing unavailable');
    this.name = 'ShareUnavailableError';
  }
}

export class ShareCaptureError extends Error {
  constructor() {
    super('card not captured');
    this.name = 'ShareCaptureError';
  }
}

export type CardHandle = ComponentRef<typeof View>;

const IMAGE_NAME = 'openhoop-activity.png';

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function removeFolder(folder: Directory): void {
  try {
    if (folder.exists) folder.delete();
  } catch {
    // removeLeftoverExports deletes it on the next start
  }
}

export async function shareSnapshotImage(target: RefObject<CardHandle | null>): Promise<void> {
  if (!(await isAvailableAsync())) throw new ShareUnavailableError();
  const view = target.current;
  if (view === null) throw new ShareCaptureError();
  const folder = new Directory(Paths.cache, exportFolderName(new Date()));
  try {
    const base64 = await captureRef(view, { format: 'png', result: 'base64' });
    folder.create({ intermediates: true, overwrite: true });
    const file = new File(folder, IMAGE_NAME);
    await file.write(decodeBase64(base64));
    await shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'OpenHoop', UTI: 'public.png' });
  } finally {
    removeFolder(folder);
  }
}
