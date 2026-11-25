import { File, Paths } from 'expo-file-system';

import { parseWidgetFile, serializeWidgetFile, type WidgetFile } from '@/lib/widgetSnapshot';

const FILE_NAME = 'openhoop-widget.json';

function widgetFile(): File {
  return new File(Paths.cache, FILE_NAME);
}

export function readWidgetFile(): WidgetFile | null {
  try {
    const file = widgetFile();
    return file.exists ? parseWidgetFile(file.textSync()) : null;
  } catch {
    return null;
  }
}

export function writeWidgetFile(content: WidgetFile): void {
  const file = widgetFile();
  if (!file.exists) file.create();
  file.writeSync(serializeWidgetFile(content));
}

export function deleteWidgetFile(): void {
  const file = widgetFile();
  if (file.exists) file.delete();
}
