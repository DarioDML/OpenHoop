import { printToFileAsync } from 'expo-print';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { removeLeftoverReports, removeReportFile } from './reportFiles';

export class ShareUnavailableError extends Error {
  constructor() {
    super('sharing is not available');
    this.name = 'ShareUnavailableError';
  }
}

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

export async function shareReportPdf(html: string): Promise<void> {
  if (!(await isAvailableAsync())) throw new ShareUnavailableError();
  removeLeftoverReports();
  const { uri } = await printToFileAsync({ html, width: A4_WIDTH, height: A4_HEIGHT });
  try {
    await shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'OpenHoop' });
  } finally {
    removeReportFile(uri);
  }
}
