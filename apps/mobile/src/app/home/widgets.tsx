import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatAgo, formatDuration, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Page } from '@/ui/daily/bits';
import { NotBuilt } from '@/ui/NotBuilt';
import { Num } from '@/ui/Num';
import { Ring } from '@/ui/Ring';
import { radius, readinessColor, spacing, useTheme } from '@/ui/theme';

function Preview({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="capSmall" muted>
        {label}
      </AppText>
      {children}
    </View>
  );
}

export default function WidgetsScreen() {
  const { days, device } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const day = days[days.length - 1];
  const nowS = Math.floor(Date.now() / 1000);
  const synced = device.lastSyncAt === null ? t('home.neverSynced') : t('home.syncedShort', { ago: formatAgo(t, nowS, device.lastSyncAt) });
  const percent = (value: number | null): string => (value === null ? '–' : `${formatNumber(value, 0, language)}%`);
  const loadText = (value: number | null): string => (value === null ? '–' : formatNumber(value, 1, language));

  return (
    <Page title={t('home.widgets')} testID="widgets">
      <AppText variant="body" muted>
        {t('home.widgetsIntro')}
      </AppText>
      {day ? (
        <>
          <Preview label={t('home.widgetLockCircular')}>
            <View style={{ alignItems: 'flex-start' }}>
              <Ring size={84} strokeWidth={7} fraction={day.readiness.value === null ? null : day.readiness.value / 100} color={readinessColor(colors, day.readiness.value)}>
                <Num size={30} testID="widget-lock-value">
                  {day.readiness.value === null ? '–' : formatNumber(day.readiness.value, 0, language)}
                </Num>
              </Ring>
            </View>
          </Preview>
          <Preview label={t('home.widgetLockRect')}>
            <Card style={{ gap: 4, borderRadius: radius.md }}>
              <AppText variant="bodyStrong">
                {t('score.readiness')} {percent(day.readiness.value)}
              </AppText>
              <AppText variant="label" muted>
                {t('score.sleep')} {day.sleep.asleepS === null ? '–' : formatDuration(t, day.sleep.asleepS)} · {t('score.load')} {loadText(day.load.value)}
              </AppText>
              <AppText variant="caption" muted>
                {synced}
              </AppText>
            </Card>
          </Preview>
          <Preview label={t('home.widgetHomeSmall')}>
            <Card style={{ gap: 6, width: 170 }}>
              <AppText variant="label">
                {t('score.sleep')} {percent(day.sleep.score.value)}
              </AppText>
              <AppText variant="label" color={readinessColor(colors, day.readiness.value)}>
                {t('score.readiness')} {percent(day.readiness.value)}
              </AppText>
              <AppText variant="label">
                {t('score.load')} {loadText(day.load.value)}
              </AppText>
              <AppText variant="caption" muted>
                {synced}
              </AppText>
            </Card>
          </Preview>
        </>
      ) : null}
      <NotBuilt issue="widgets" />
      <AppText variant="caption" muted>
        {t('home.widgetsNote')}
      </AppText>
    </Page>
  );
}
