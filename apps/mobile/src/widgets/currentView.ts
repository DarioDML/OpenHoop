import { getLocales } from 'expo-localization';

import { detectLanguage } from '@/i18n';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { widgetView, type WidgetFile, type WidgetView } from '@/lib/widgetSnapshot';

export function currentView(file: WidgetFile | null, now: Date = new Date()): WidgetView {
  const nowS = Math.floor(now.getTime() / 1000);
  return widgetView(file, {
    nowS,
    today: unixToIsoDate(nowS, deviceTzOffsetS(now)),
    fallbackLanguage: detectLanguage(getLocales()[0]?.languageCode),
  });
}
