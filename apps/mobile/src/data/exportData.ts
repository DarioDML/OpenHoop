import type { ExportTable, Store } from '@openhoop/core';
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
  'sleep_edits',
  'workouts',
  'events',
  'console_log',
  'raw_chunks',
  'body_measurements',
  'strength_exercises',
  'strength_templates',
  'strength_template_items',
  'strength_sessions',
  'strength_session_exercises',
  'strength_sets',
];

const PLAINTEXT_NAME = 'openhoop.db';
const ZIP_NAME = 'openhoop-export.zip';

export function removeLeftoverExports(): void {
  for (const entry of new Directory(Paths.cache).list()) {
    if (entry instanceof Directory && isExportFolder(entry.name)) entry.delete();
  }
}

function removeFolder(folder: Directory): void {
  try {
    if (folder.exists) folder.delete();
  } catch {
    // removeLeftoverExports deletes it on the next start
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
  databaseIncluded: boolean;
  tables: number;
}

export async function exportAll(
  app: AppStore,
  csvFor: (store: Store, table: ExportTable) => Promise<string>,
): Promise<ExportSummary> {
  if (!(await isAvailableAsync())) throw new AppError('error.shareUnavailable');
  removeLeftoverExports();
  const folder = new Directory(Paths.cache, exportFolderName(new Date()));
  folder.create({ intermediates: true, overwrite: true });
  try {
    const archive: Zippable = {};
    for (const table of EXPORT_TABLES) {
      archive[`${table}.csv`] = [strToU8(await csvFor(app.store, table)), { level: 1 }];
    }

    const plaintext = new File(folder, PLAINTEXT_NAME);
    const databaseIncluded = await writePlaintextCopy(app, plaintext);
    if (databaseIncluded) {
      archive[PLAINTEXT_NAME] = [await plaintext.bytes(), { level: 0 }];
      plaintext.delete();
    }

    const zip = new File(folder, ZIP_NAME);
    zip.write(zipSync(archive));
    await shareAsync(zip.uri, { mimeType: 'application/zip', dialogTitle: 'OpenHoop' });
    return { databaseIncluded, tables: EXPORT_TABLES.length };
  } finally {
    removeFolder(folder);
  }
}
