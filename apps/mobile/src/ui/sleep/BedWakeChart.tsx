import type { DayRecord } from '@openhoop/core';
import type { ReactElement } from 'react';
import { View } from 'react-native';

import { formatMinutes } from '@/data/dailyDerived';
import { bedWakeBars, bedWakeWindow, clockFromNoon } from '@/data/sleepDerived';
import { useT } from '@/i18n/useT';
import { formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { radius, spacing, useTheme } from '@/ui/theme';

const TRACK_H = 120;
const WEEK_DAYS = 7;

function weekday(day: string, language: 'nl' | 'en'): string {
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short', timeZone: 'UTC' });
  return label.replace('.', '').slice(0, 2);
}

export function BedWakeChart({ slice, testID = 'card-bed-wake' }: { slice: readonly DayRecord[]; testID?: string }): ReactElement {
  const { colors } = useTheme();
  const { t, language } = useT();
  const bars = bedWakeBars(slice);
  const frame = bedWakeWindow(bars);
  const grouped = bars.length < slice.length;
  const span = frame === null ? 1 : frame.to - frame.from;
  const thin = bars.length > 14;
  const lastIndex = bars.length - 1;
  const dayLabels = !grouped && bars.length <= WEEK_DAYS;

  return (
    <Card testID={testID} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="cap" muted accessibilityRole="header">
          {t('sleepTrends.bedWake')}
        </AppText>
        {frame === null ? null : (
          <AppText variant="caption" muted numeric testID={`${testID}-window`}>
            {t('sleepTrends.window', { from: formatMinutes(clockFromNoon(frame.from)), to: formatMinutes(clockFromNoon(frame.to)) })}
          </AppText>
        )}
      </View>
      {frame === null ? (
        <AppText variant="body" muted testID={`${testID}-empty`}>
          {t('sleepTrends.noNights')}
        </AppText>
      ) : (
        <View style={{ flexDirection: 'row', gap: thin ? 2 : 4 }}>
          {bars.map((bar, i) => {
            const shown = bar.bed !== null && bar.wake !== null;
            const top = shown ? ((bar.bed ?? 0) - frame.from) / span : 0;
            const height = shown ? ((bar.wake ?? 0) - (bar.bed ?? 0)) / span : 0;
            const label = shown ? `${formatShortDay(bar.day, language)}: ${formatMinutes(clockFromNoon(bar.bed ?? 0))} – ${formatMinutes(clockFromNoon(bar.wake ?? 0))}` : formatShortDay(bar.day, language);
            return (
              <View key={bar.key} style={{ flex: 1, alignItems: 'center', gap: 6 }} testID={`${testID}-bar-${bar.day}`} accessible accessibilityLabel={label}>
                <View style={{ width: thin ? 6 : 14, height: TRACK_H, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}>
                  {shown ? (
                    <View style={{ position: 'absolute', left: 0, right: 0, top: top * TRACK_H, height: Math.max(4, height * TRACK_H), borderRadius: radius.pill, backgroundColor: colors.purple }} />
                  ) : null}
                </View>
                {dayLabels ? (
                  <AppText variant="caption" color={i === lastIndex ? colors.text : colors.textMuted}>
                    {weekday(bar.day, language)}
                  </AppText>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      {frame !== null && !dayLabels ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" muted>
            {bars[0] ? formatShortDay(bars[0].day, language) : ''}
          </AppText>
          {grouped ? (
            <AppText variant="caption" muted>
              {t('sleepTrends.weekly')}
            </AppText>
          ) : null}
          <AppText variant="caption" muted>
            {bars[lastIndex] ? formatShortDay(bars[lastIndex].day, language) : ''}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}
