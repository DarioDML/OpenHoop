import { Platform } from 'react-native';
import { getWidgetInfo, requestWidgetUpdate } from 'react-native-android-widget';

import { deleteWidgetFile, writeWidgetFile } from '@/data/widgetStorage';
import { WIDGET_NAMES, type WidgetFile } from '@/lib/widgetSnapshot';

import { currentView } from './currentView';
import { renderWidget } from './OpenHoopWidget';

export interface WidgetBridge {
  placed(): Promise<number>;
  publish(file: WidgetFile): Promise<void>;
  clear(): Promise<void>;
}

export async function placedWidgetIds(): Promise<number[]> {
  const lists = await Promise.all(WIDGET_NAMES.map((name) => getWidgetInfo(name)));
  return lists.flat().map((info) => info.widgetId);
}

export const androidWidgetBridge: WidgetBridge = {
  async placed() {
    if (Platform.OS !== 'android') return 0;
    return (await placedWidgetIds()).length;
  },
  async publish(file) {
    if (Platform.OS !== 'android') return;
    writeWidgetFile(file);
    const view = currentView(file);
    for (const name of WIDGET_NAMES) await requestWidgetUpdate({ widgetName: name, renderWidget: () => renderWidget(name, view) });
  },
  async clear() {
    deleteWidgetFile();
  },
};
