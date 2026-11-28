import { Directory, File } from 'expo-file-system';
import { printToFileAsync } from 'expo-print';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { Platform } from 'react-native';

import { ANDROID_DOWNLOADS_URI } from './donation/files';
import { removeLeftoverReports, removeReportFile } from './reportFiles';

export class ShareUnavailableError extends Error {
  constructor() {
    super('sharing is not available');
    this.name = 'ShareUnavailableError';
  }
}

const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const PDF_MIME = 'application/pdf';
const CANCEL_CODES: ReadonlySet<string> = new Set(['ERR_PICKER_CANCELLED', 'ERR_FILE_PICKING_CANCELLED']);

export type ExportOutcome = 'saved' | 'cancelled';

function isCancel(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && CANCEL_CODES.has(error.code);
}

export function reportFileName(from: string, to: string): string {
  return `openhoop-health-report-${from}-${to}.pdf`;
}

export async function shareReportPdf(html: string): Promise<void> {
  if (!(await isAvailableAsync())) throw new ShareUnavailableError();
  removeLeftoverReports();
  const { uri } = await printToFileAsync({ html, width: A4_WIDTH, height: A4_HEIGHT });
  try {
    await shareAsync(uri, { mimeType: PDF_MIME, UTI: 'com.adobe.pdf', dialogTitle: 'OpenHoop' });
  } finally {
    removeReportFile(uri);
  }
}

export async function exportReportPdf(html: string, fileName: string): Promise<ExportOutcome> {
  let target: Directory;
  try {
    target = await Directory.pickDirectoryAsync(Platform.OS === 'android' ? ANDROID_DOWNLOADS_URI : undefined);
  } catch (error) {
    if (isCancel(error)) return 'cancelled';
    throw error;
  }
  removeLeftoverReports();
  const { uri } = await printToFileAsync({ html, width: A4_WIDTH, height: A4_HEIGHT });
  try {
    const out = target.createFile(fileName, PDF_MIME);
    await out.write(await new File(uri).bytes());
  } finally {
    removeReportFile(uri);
  }
  return 'saved';
}
