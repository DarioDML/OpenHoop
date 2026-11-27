import { useState } from 'react';
import { Platform, View } from 'react-native';
import { requestPinWidget } from 'react-native-android-widget';

import { useAppData } from '@/data/context';
import { readinessNightsLeft } from '@/data/progress';
import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';
import { todayIso } from '@/lib/format';
import { buildWidgetFile, widgetView, type WidgetName } from '@/lib/widgetSnapshot';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Toggle } from '@/ui/controls';
import { Page } from '@/ui/daily/bits';
import { WidgetPreview } from '@/ui/daily/WidgetPreview';
import { spacing } from '@/ui/theme';

const WIDGETS: ReadonlyArray<{ name: WidgetName; size: 'small' | 'wide'; label: TranslationKey }> = [
  { name: 'OpenHoopScores', size: 'small', label: 'home.widgetScores' },
  { name: 'OpenHoopOverview', size: 'wide', label: 'home.widgetOverview' },
];

export default function WidgetsScreen() {
  const { days, device, userData, updateUserData, refreshWidgetsAfterPin } = useAppData();
  const { t, language } = useT();
  const [pinFailed, setPinFailed] = useState(false);
  const android = Platform.OS === 'android';
  const now = new Date();
  const file = buildWidgetFile({ enabled: userData.widgetValues, day: days[days.length - 1], syncedAt: device.lastSyncAt, language, readinessNightsLeft: readinessNightsLeft(days, days.length - 1) });
  const view = widgetView(file, { nowS: Math.floor(now.getTime() / 1000), today: todayIso(now), fallbackLanguage: language });

  const pin = async (widgetName: WidgetName): Promise<void> => {
    const pinned = await requestPinWidget({ widgetName }).catch(() => false);
    setPinFailed(!pinned);
    if (pinned) await refreshWidgetsAfterPin();
  };

  return (
    <Page title={t('home.widgets')} testID="widgets">
      <AppText variant="body" muted>
        {t('home.widgetsIntro')}
      </AppText>
      {android ? null : (
        <Card tone="warning" testID="widgets-android-only">
          <AppText variant="bodyStrong">{t('home.widgetsAndroidOnly')}</AppText>
        </Card>
      )}
      {WIDGETS.map((widget) => (
        <View key={widget.name} style={{ gap: spacing.sm }}>
          <AppText variant="capSmall" muted>
            {t(widget.label)}
          </AppText>
          <WidgetPreview view={view} size={widget.size} testID={`widget-preview-${widget.name}`} />
          {android ? <Button label={t('home.widgetsAdd')} variant="secondary" onPress={() => void pin(widget.name)} testID={`widget-pin-${widget.name}`} /> : null}
        </View>
      ))}
      {android ? (
        <>
          <Card style={{ gap: 4 }} testID="widgets-how">
            <AppText variant="bodyStrong">{t('home.widgetsHowTitle')}</AppText>
            <AppText variant="label" muted>
              {pinFailed ? `${t('home.widgetsPinFailed')} ${t('home.widgetsHow')}` : t('home.widgetsHow')}
            </AppText>
          </Card>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="bodyStrong">{t('home.widgetsValues')}</AppText>
              <AppText variant="label" muted>
                {t('home.widgetsValuesBody')}
              </AppText>
            </View>
            <Toggle value={userData.widgetValues} onChange={(on) => void updateUserData({ widgetValues: on })} label={t('home.widgetsValues')} testID="widgets-values-toggle" />
          </Card>
          <Card tone="outline" style={{ gap: 4 }} testID="widgets-privacy">
            <AppText variant="bodyStrong">{t('home.widgetsPrivacyTitle')}</AppText>
            <AppText variant="label" muted>
              {t('home.widgetsPrivacy')}
            </AppText>
          </Card>
        </>
      ) : null}
      <AppText variant="caption" muted>
        {t('home.widgetsNote')}
      </AppText>
    </Page>
  );
}
