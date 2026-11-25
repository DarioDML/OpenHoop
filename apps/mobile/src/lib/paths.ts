const EXPORT_PREFIX = 'openhoop-export-';

export function exportFolderName(now: Date): string {
  return `${EXPORT_PREFIX}${now.getTime()}`;
}

export function isExportFolder(name: string): boolean {
  return name.startsWith(EXPORT_PREFIX);
}

export function uriToPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

export function isSafeSqlPath(path: string): boolean {
  return path.length > 0 && !/['"\u0000]/.test(path);
}

export function toFileUri(pathOrUri: string): string {
  return pathOrUri.startsWith('file://') ? pathOrUri : `file://${pathOrUri}`;
}
