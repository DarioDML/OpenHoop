import { useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { requestPinWidget } from 'react-native-android-widget';

import { loadTargetBand } from '@/data/activityDerived';
import { loadTargetsHidden } from '@/data/pregnancyPrefs';
import { useAppData } from '@/data/context';
import { readinessNightsLeft } from '@/data/progress';
import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';
import { todayIso } from '@/lib/format';
import { buildWidgetFile, widgetView, type WidgetName, type WidgetView } from '@/lib/widgetSnapshot';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Toggle } from '@/ui/controls';
import { Page } from '@/ui/daily/bits';
import { DayPreview, LockCircularPreview, LockRectPreview, ReadinessPreview, RingsPreview, WidgetPreview } from '@/ui/daily/WidgetPreview';
import { CapHeader } from '@/ui/ListGroup';
import { spacing } from '@/ui/theme';

interface HomeWidget {
  name: WidgetName;
  label: TranslationKey;
  note?: TranslationKey;
  preview: (view: WidgetView, testID: string) => ReactNode;
}

const HOME_WIDGETS: ReadonlyArray<HomeWidget> = [
  { name: 'OpenHoopReadiness', label: 'home.widgetReadiness', preview: (view, testID) => <ReadinessPreview view={view} testID={testID} /> },
  { name: 'OpenHoopRings', label: 'home.widgetRings', preview: (view, testID) => <RingsPreview view={view} testID={testID} /> },
  { name: 'OpenHoopDay', label: 'home.widgetDay', note: 'home.widgetDayNote', preview: (view, testID) => <DayPreview view={view} testID={testID} /> },
  { name: 'OpenHoopScores', label: 'home.widgetScores', preview: (view, testID) => <WidgetPreview view={view} size="small" testID={testID} /> },
  { name: 'OpenHoopOverview', label: 'home.widgetOverview', preview: (view, testID) => <WidgetPreview view={view} size="wide" testID={testID} /> },
];

export default function WidgetsScreen() {
  const { days, device, userData, cycle, updateUserData, refreshWidgetsAfterPin } = useAppData();
  const { t, language } = useT();
  const [pinFailed, setPinFailed] = useState(false);
  const android = Platform.OS === 'android';
  const now = new Date();
  const file = buildWidgetFile({
    enabled: userData.widgetValues,
    day: days[days.length - 1],
    syncedAt: device.lastSyncAt,
    language,
    readinessNightsLeft: readinessNightsLeft(days, days.length - 1),
    loadTarget: loadTargetsHidden(userData.pregnancyPrefs, cycle) ? null : loadTargetBand(days),
  });
  const view = widgetView(file, { nowS: Math.floor(now.getTime() / 1000), today: todayIso(now), fallbackLanguage: language });

  const pin = async (widgetName: WidgetName): Promise<void> => {
    const pinned = await requestPinWidget({ widgetName }).catch(() => false);
    setPinFailed(!pinned);
    if (pinned) await refreshWidgetsAfterPin();
  };

  return (
    <Page
      title={t('home.widgets')}
      testID="widgets"
      hero={
        <View style={{ gap: spacing.sm }}>
          <AppText variant="h1" accessibilityRole="header">
            {t('home.widgetsHeading')}
          </AppText>
          <AppText variant="body" soft>
            {t('home.widgetsIntro')}
          </AppText>
        </View>
      }>
      {android ? null : (
        <Card tone="warning" testID="widgets-android-only">
          <AppText variant="bodyStrong">{t('home.widgetsAndroidOnly')}</AppText>
        </Card>
      )}
      <CapHeader title={t('home.widgetsHome')} />
      {HOME_WIDGETS.map((widget) => (
        <View key={widget.name} style={{ gap: spacing.sm }} testID={`widget-${widget.name}`}>
          {widget.preview(view, `widget-preview-${widget.name}`)}
          <AppText variant="label" muted style={{ textAlign: 'center' }}>
            {t(widget.label)}
          </AppText>
          {widget.note === undefined ? null : (
            <AppText variant="caption" muted style={{ textAlign: 'center' }} testID={`widget-note-${widget.name}`}>
              {t(widget.note)}
            </AppText>
          )}
          {android ? <Button label={t('home.widgetsAdd')} variant="secondary" onPress={() => void pin(widget.name)} testID={`widget-pin-${widget.name}`} /> : null}
        </View>
      ))}
      <CapHeader title={t('home.widgetsLock')} />
      <Card style={{ gap: spacing.md }} testID="widgets-lock">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <LockCircularPreview view={view} testID="widget-preview-lock-circular" />
          <LockRectPreview view={view} testID="widget-preview-lock-rect" />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <AppText variant="caption" muted style={{ width: 76, textAlign: 'center' }}>
            {t('home.widgetLockCircular')}
          </AppText>
          <AppText variant="caption" muted style={{ flex: 1, textAlign: 'center' }}>
            {t('home.widgetLockRect')}
          </AppText>
        </View>
        <Chip label={t('home.widgetsLockNotAvailable')} tone="neutral" testID="widgets-lock-not-available" />
        <AppText variant="label" muted>
          {t('home.widgetsLockBody')}
        </AppText>
      </Card>
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
