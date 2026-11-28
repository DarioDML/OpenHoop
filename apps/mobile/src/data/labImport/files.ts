import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { launchCameraAsync, requestCameraPermissionsAsync } from 'expo-image-picker';

export type ReportKind = 'pdf' | 'image';

export interface ReportFile {
  uri: string;
  kind: ReportKind;
  mimeType: string | null;
  size: number | null;
}

export type PickOutcome =
  | { status: 'picked'; file: ReportFile }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'too-large' }
  | { status: 'failed' };

export const FILE_LIMITS = {
  maxBytes: 20 * 1024 * 1024,
  maxImageUploadBytes: 3_750_000,
  maxOcrPages: 10,
  maxEdge: 2000,
  jpegQuality: 85,
} as const;

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

export function kindOf(mimeType: string | null | undefined, name: string): ReportKind | null {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (/\.pdf$/i.test(name)) return 'pdf';
  if (IMAGE_EXTENSIONS.test(name)) return 'image';
  return null;
}

export function discardReport(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // a copy in the cache directory is cleared with the app cache
  }
}

function checked(uri: string, kind: ReportKind | null, mimeType: string | null, size: number | null): PickOutcome {
  if (kind === null) {
    discardReport(uri);
    return { status: 'unsupported' };
  }
  if (size !== null && size > FILE_LIMITS.maxBytes) {
    discardReport(uri);
    return { status: 'too-large' };
  }
  return { status: 'picked', file: { uri, kind, mimeType, size } };
}

export async function pickReportFile(): Promise<PickOutcome> {
  try {
    const result = await getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: false, copyToCacheDirectory: true });
    if (result.canceled) return { status: 'cancelled' };
    const asset = result.assets[0];
    if (asset === undefined) return { status: 'cancelled' };
    return checked(asset.uri, kindOf(asset.mimeType, asset.name), asset.mimeType ?? null, asset.size ?? null);
  } catch {
    return { status: 'failed' };
  }
}

export async function takeReportPhoto(): Promise<PickOutcome> {
  try {
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    const result = await launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false, base64: false, allowsEditing: false });
    if (result.canceled) return { status: 'cancelled' };
    const asset = result.assets[0];
    if (asset === undefined) return { status: 'cancelled' };
    return checked(asset.uri, 'image', asset.mimeType ?? 'image/jpeg', asset.fileSize ?? null);
  } catch {
    return { status: 'failed' };
  }
}

export type CsvPick =
  | { status: 'picked'; text: string }
  | { status: 'cancelled' }
  | { status: 'unsupported' }
  | { status: 'too-large' }
  | { status: 'failed' };

const CSV_TYPES = ['text/csv', 'text/comma-separated-values', 'text/tab-separated-values', 'text/plain', 'application/vnd.ms-excel'];
const CSV_NAME = /\.(csv|tsv|txt)$/i;
const CSV_MAX_BYTES = 2_000_000;

export function isCsvFile(mimeType: string | null | undefined, name: string): boolean {
  return CSV_NAME.test(name) || (mimeType ?? '').toLowerCase().startsWith('text/');
}

export async function pickCsvFile(): Promise<CsvPick> {
  try {
    const result = await getDocumentAsync({ type: CSV_TYPES, multiple: false, copyToCacheDirectory: true });
    if (result.canceled) return { status: 'cancelled' };
    const asset = result.assets[0];
    if (asset === undefined) return { status: 'cancelled' };
    try {
      if (!isCsvFile(asset.mimeType, asset.name)) return { status: 'unsupported' };
      if (asset.size !== undefined && asset.size !== null && asset.size > CSV_MAX_BYTES) return { status: 'too-large' };
      const text = await new File(asset.uri).text();
      return text.length > CSV_MAX_BYTES ? { status: 'too-large' } : { status: 'picked', text };
    } finally {
      discardReport(asset.uri);
    }
  } catch {
    return { status: 'failed' };
  }
}
