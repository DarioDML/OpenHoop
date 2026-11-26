import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';

import { isRecord, type Json } from '@/lib/json';

import type { LabUpload } from './claude';
import { FILE_LIMITS, type ReportFile } from './files';
import { readNativeText, textLines } from './rows';

interface LabReaderModule {
  recognizeImage(uri: string): Promise<Json>;
  readPdf(uri: string, maxOcrPages: number, forceOcr: boolean): Promise<Json>;
  prepareImage(uri: string, maxEdge: number, quality: number): Promise<Json>;
}

const native = requireOptionalNativeModule<LabReaderModule>('LabReader');

export function onDeviceAvailable(): boolean {
  return native !== null;
}

export type DeviceReadError = 'unavailable' | 'unreadable' | 'encrypted' | 'too-large' | 'no-text';
export type DeviceReadResult = { ok: true; lines: string[]; source: 'text' | 'ocr' } | { ok: false; error: DeviceReadError };

function nativeCode(error: unknown): string | null {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') return error.code;
  return null;
}

async function readNative(module: LabReaderModule, file: ReportFile, forceOcr: boolean): Promise<DeviceReadResult> {
  let raw: Json;
  try {
    raw = file.kind === 'pdf' ? await module.readPdf(file.uri, FILE_LIMITS.maxOcrPages, forceOcr) : await module.recognizeImage(file.uri);
  } catch (error) {
    const code = nativeCode(error);
    return { ok: false, error: code === 'ERR_LAB_ENCRYPTED' ? 'encrypted' : code === 'ERR_LAB_TOO_LARGE' ? 'too-large' : 'unreadable' };
  }
  const read = readNativeText(raw);
  if (read === null) return { ok: false, error: 'unreadable' };
  const lines = textLines(read).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { ok: false, error: 'no-text' };
  return { ok: true, lines, source: read.source };
}

export async function readOnDevice(file: ReportFile, useful: (lines: readonly string[]) => boolean): Promise<DeviceReadResult> {
  if (native === null) return { ok: false, error: 'unavailable' };
  const first = await readNative(native, file, false);
  if (file.kind !== 'pdf' || !first.ok || first.source === 'ocr' || useful(first.lines)) return first;
  const scanned = await readNative(native, file, true);
  return scanned.ok ? scanned : first;
}

export type UploadError = 'too-large' | 'unreadable' | 'unsupported';
export type UploadResult = { ok: true; upload: LabUpload } | { ok: false; error: UploadError };

const PDF_MAGIC = 'JVBERi0';
const IMAGE_MAGIC: ReadonlyArray<{ prefix: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }> = [
  { prefix: '/9j/', mediaType: 'image/jpeg' },
  { prefix: 'iVBORw0KGgo', mediaType: 'image/png' },
  { prefix: 'UklGR', mediaType: 'image/webp' },
];

function base64Bytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

async function fileBase64(uri: string): Promise<string | null> {
  try {
    return await new File(uri).base64();
  } catch {
    return null;
  }
}

async function preparedImage(uri: string): Promise<string | null> {
  if (native === null) return null;
  try {
    const result = await native.prepareImage(uri, FILE_LIMITS.maxEdge, FILE_LIMITS.jpegQuality);
    return isRecord(result) && typeof result.base64 === 'string' && result.base64.startsWith('/9j/') ? result.base64 : null;
  } catch {
    return null;
  }
}

export async function uploadFor(file: ReportFile): Promise<UploadResult> {
  if (file.kind === 'pdf') {
    if (file.size !== null && file.size > FILE_LIMITS.maxBytes) return { ok: false, error: 'too-large' };
    const base64 = await fileBase64(file.uri);
    if (base64 === null || !base64.startsWith(PDF_MAGIC)) return { ok: false, error: 'unreadable' };
    if (base64Bytes(base64) > FILE_LIMITS.maxBytes) return { ok: false, error: 'too-large' };
    return { ok: true, upload: { kind: 'pdf', base64 } };
  }
  const scaled = await preparedImage(file.uri);
  if (scaled !== null) {
    if (base64Bytes(scaled) > FILE_LIMITS.maxImageUploadBytes) return { ok: false, error: 'too-large' };
    return { ok: true, upload: { kind: 'image', mediaType: 'image/jpeg', base64: scaled } };
  }
  if (native !== null) return { ok: false, error: 'unreadable' };
  if (file.size !== null && file.size > FILE_LIMITS.maxImageUploadBytes) return { ok: false, error: 'too-large' };
  const base64 = await fileBase64(file.uri);
  if (base64 === null) return { ok: false, error: 'unreadable' };
  const type = IMAGE_MAGIC.find((magic) => base64.startsWith(magic.prefix));
  if (type === undefined) return { ok: false, error: 'unsupported' };
  if (base64Bytes(base64) > FILE_LIMITS.maxImageUploadBytes) return { ok: false, error: 'too-large' };
  return { ok: true, upload: { kind: 'image', mediaType: type.mediaType, base64 } };
}
