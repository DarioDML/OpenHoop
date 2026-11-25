import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { deleteWidgetFile, readWidgetFile } from '@/data/widgetStorage';
import { WIDGET_NAMES, type WidgetName } from '@/lib/widgetSnapshot';

import { placedWidgetIds } from './bridge';
import { currentView } from './currentView';
import { renderWidget } from './OpenHoopWidget';

function isWidgetName(name: string): name is WidgetName {
  return (WIDGET_NAMES as readonly string[]).includes(name);
}

export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget: draw }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED') {
    const remaining = (await placedWidgetIds()).filter((id) => id !== widgetInfo.widgetId);
    if (remaining.length === 0) deleteWidgetFile();
    return;
  }
  if (!isWidgetName(widgetInfo.widgetName)) return;
  draw(renderWidget(widgetInfo.widgetName, currentView(readWidgetFile())));
}
