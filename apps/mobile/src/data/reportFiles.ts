import { Directory, File, Paths } from 'expo-file-system';

const PRINT_FOLDER = 'Print';

export function removeReportFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    return;
  }
}

export function removeLeftoverReports(): void {
  try {
    const folder = new Directory(Paths.cache, PRINT_FOLDER);
    if (!folder.exists) return;
    for (const entry of folder.list()) {
      if (entry instanceof File && entry.name.endsWith('.pdf')) removeReportFile(entry.uri);
    }
  } catch {
    return;
  }
}
