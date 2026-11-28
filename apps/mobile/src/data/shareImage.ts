import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';

import { exportFolderName } from '@/lib/paths';

import { ANDROID_DOWNLOADS_URI } from './donation/files';

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

export class SaveImageError extends Error {
  constructor() {
    super('image not saved');
    this.name = 'SaveImageError';
  }
}

export type CardHandle = ComponentRef<typeof View>;

export type SaveImageOutcome = { kind: 'saved'; folderUri: string } | { kind: 'cancelled' };

const PICKER_CANCEL_CODES: ReadonlySet<string> = new Set(['ERR_PICKER_CANCELLED', 'ERR_FILE_PICKING_CANCELLED']);

function isPickerCancel(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && PICKER_CANCEL_CODES.has(error.code);
}

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

export async function shareSnapshotImage(target: RefObject<CardHandle | null>, fileName: string = IMAGE_NAME): Promise<void> {
  if (!(await isAvailableAsync())) throw new ShareUnavailableError();
  const view = target.current;
  if (view === null) throw new ShareCaptureError();
  const folder = new Directory(Paths.cache, exportFolderName(new Date()));
  try {
    const base64 = await captureRef(view, { format: 'png', result: 'base64' });
    folder.create({ intermediates: true, overwrite: true });
    const file = new File(folder, fileName);
    await file.write(decodeBase64(base64));
    await shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'OpenHoop', UTI: 'public.png' });
  } finally {
    removeFolder(folder);
  }
}

export async function saveSnapshotImage(target: RefObject<CardHandle | null>, fileName: string, platform: 'android' | 'ios'): Promise<SaveImageOutcome> {
  const view = target.current;
  if (view === null) throw new ShareCaptureError();
  const base64 = await captureRef(view, { format: 'png', result: 'base64' });
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync(platform === 'android' ? ANDROID_DOWNLOADS_URI : undefined);
  } catch (error) {
    if (isPickerCancel(error)) return { kind: 'cancelled' };
    throw new SaveImageError();
  }
  try {
    const file = folder.createFile(fileName, 'image/png');
    await file.write(decodeBase64(base64));
  } catch {
    throw new SaveImageError();
  }
  return { kind: 'saved', folderUri: folder.uri };
}
