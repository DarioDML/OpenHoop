import type { ExportTable, Store } from '@stoop/core';
import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { strToU8, zipSync, type Zippable } from 'fflate';

import { exportFolderName, isExportFolder, isSafeSqlPath, uriToPath } from '@/lib/paths';

import { AppError } from './errors';
import type { AppStore } from './appStore';

export const EXPORT_TABLES: ReadonlyArray<ExportTable> = [
  'devices',
  'samples_1hz',
  'daily_metrics',
  'sleeps',
  'workouts',
  'events',
  'console_log',
  'raw_chunks',
];

const PLAINTEXT_NAME = 'stoop.db';
const ZIP_NAME = 'stoop-export.zip';

function clearOldExports(): void {
  for (const entry of new Directory(Paths.cache).list()) {
    if (entry instanceof Directory && isExportFolder(entry.name)) entry.delete();
  }
}

async function writePlaintextCopy(app: AppStore, target: File): Promise<boolean> {
  const path = uriToPath(target.uri);
  if (!isSafeSqlPath(path)) return false;
  try {
    await app.driver.exec(`ATTACH DATABASE '${path}' AS plaintext KEY ''`);
    try {
      await app.driver.exec("SELECT sqlcipher_export('plaintext')");
    } finally {
      await app.driver.exec('DETACH DATABASE plaintext');
    }
    return true;
  } catch {
    if (target.exists) target.delete();
    return false;
  }
}

export interface ExportSummary {
  folder: string;
  databaseIncluded: boolean;
  tables: number;
}

export async function exportAll(
  app: AppStore,
  csvFor: (store: Store, table: ExportTable) => Promise<string>,
): Promise<ExportSummary> {
  if (!(await isAvailableAsync())) throw new AppError('error.shareUnavailable');
  clearOldExports();
  const folder = new Directory(Paths.cache, exportFolderName(new Date()));
  folder.create({ intermediates: true, overwrite: true });

  const archive: Zippable = {};
  for (const table of EXPORT_TABLES) {
    const csv = await csvFor(app.store, table);
    new File(folder, `${table}.csv`).write(csv);
    archive[`${table}.csv`] = [strToU8(csv), { level: 1 }];
  }

  const plaintext = new File(folder, PLAINTEXT_NAME);
  const databaseIncluded = await writePlaintextCopy(app, plaintext);
  if (databaseIncluded) archive[PLAINTEXT_NAME] = [await plaintext.bytes(), { level: 0 }];

  const zip = new File(folder, ZIP_NAME);
  zip.write(zipSync(archive));
  await shareAsync(zip.uri, { mimeType: 'application/zip', dialogTitle: 'Stoop' });
  return { folder: folder.uri, databaseIncluded, tables: EXPORT_TABLES.length };
}
