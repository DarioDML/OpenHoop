import type { DayRecord } from '@openhoop/core';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { metricValue } from '@/data/derived';
import type { HomeHero } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Num } from '@/ui/Num';
import { Ring } from '@/ui/Ring';
import { readinessBand, readinessColor, spacing, useTheme } from '@/ui/theme';

interface RingProps {
  label: string;
  value: number | null;
  max: number;
  color: string;
  decimals?: number;
  percent?: boolean;
  tick?: number | null;
  reason: string | null;
  caption?: string | null;
  captionColor?: string;
  href: string;
  size?: number;
  testID: string;
}

export function HeroRing({ label, value, max, color, decimals = 0, percent = false, tick = null, reason, caption = null, captionColor, href, size = 104, testID }: RingProps) {
  const { colors } = useTheme();
  const { language, reason: reasonLabel } = useT();
  const text = value === null ? null : formatNumber(value, decimals, language);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={text === null ? `${label}: ${reasonLabel(reason)}` : `${label}: ${text}${percent ? '%' : ''}`}
      onPress={() => router.push(href)}
      style={{ alignItems: 'center', gap: 10, flex: 1, minHeight: 44 }}>
      <Ring size={size} strokeWidth={size > 120 ? 10 : 7} fraction={value === null ? null : value / max} color={color} tickFraction={tick === null ? null : tick / max}>
        {text !== null ? (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Num size={Math.round(size * 0.38)} color={color} unit={percent ? '%' : undefined} unitSize={Math.round(size * 0.17)}>
              {text}
            </Num>
            {caption ? (
              <AppText variant="capSmall" color={captionColor ?? color} style={{ fontSize: 9, lineHeight: 11 }}>
                {caption}
              </AppText>
            ) : null}
          </View>
        ) : (
          <AppText variant="caption" muted style={{ textAlign: 'center', paddingHorizontal: 12 }}>
            {reasonLabel(reason)}
          </AppText>
        )}
      </Ring>
      <AppText variant="cap" color={colors.textMuted} numberOfLines={1}>
        {label} ›
      </AppText>
    </Pressable>
  );
}

interface HeroProps {
  days: readonly DayRecord[];
  index: number;
  variant: HomeHero;
}

function useHeroValues(days: readonly DayRecord[], index: number) {
  const { colors } = useTheme();
  const { t } = useT();
  const day = days[index];
  const yesterday = index > 0 ? days[index - 1] : undefined;
  const readiness = day?.readiness.value ?? null;
  const calibrating = day?.readinessCalibrating ?? false;
  const band = readinessBand(readiness);
  const readinessTone = calibrating ? colors.textMuted : readinessColor(colors, readiness);
  return {
    day,
    readiness,
    calibrating,
    readinessTone,
    bandLabel: calibrating ? t('calibrating.label') : band ? t(`readiness.${band}`) : null,
    yesterdayReadiness: yesterday ? metricValue(yesterday, 'readiness') : null,
    yesterdayLoad: yesterday ? metricValue(yesterday, 'load') : null,
    yesterdaySleep: yesterday ? metricValue(yesterday, 'sleepScore') : null,
  };
}

export function Hero({ days, index, variant }: HeroProps) {
  const { colors } = useTheme();
  const { t, language } = useT();
  const v = useHeroValues(days, index);
  if (!v.day) return null;
  const { day } = v;

  if (variant === 'compact') {
    const stat = (label: string, value: string | null, unit: string, href: string, testID: string) => (
      <Pressable key={testID} testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href)} style={{ gap: 2, minHeight: 44, justifyContent: 'center' }}>
        <AppText variant="capSmall" muted>
          {label}
        </AppText>
        {value === null ? (
          <AppText variant="label" muted>
            {t('reason.no-data')}
          </AppText>
        ) : (
          <Num size={30} unit={unit} unitSize={14}>
            {value}
          </Num>
        )}
      </Pressable>
    );
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }} testID="hero-compact">
        <HeroRing
          testID="ring-readiness"
          label={t('score.readiness')}
          value={v.readiness}
          max={100}
          color={v.readinessTone}
          percent
          reason={day.readiness.reason}
          caption={v.bandLabel}
          href="/recovery"
          size={148}
        />
        <View style={{ flex: 1, gap: spacing.md }}>
          {stat(t('metric.hrv'), day.hrv.value === null ? null : formatNumber(day.hrv.value, 0, language), t('unit.ms'), '/recovery/metric/hrv', 'stat-hrv')}
          {stat(t('score.load'), day.load.value === null ? null : formatNumber(day.load.value, 1, language), '', '/load', 'stat-load')}
          {stat(t('score.sleep'), day.sleep.score.value === null ? null : formatNumber(day.sleep.score.value, 0, language), '%', '/sleep', 'stat-sleep')}
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }} testID="hero-classic">
        <HeroRing
          testID="ring-sleep"
          label={t('score.sleep')}
          value={day.sleep.score.value}
          max={100}
          color={colors.metric.sleep}
          percent
          tick={v.yesterdaySleep}
          reason={day.sleep.score.reason}
          href="/sleep"
        />
        <HeroRing
          testID="ring-readiness"
          label={t('score.readiness')}
          value={v.readiness}
          max={100}
          color={v.readinessTone}
          percent
          tick={v.yesterdayReadiness}
          reason={day.readiness.reason}
          caption={v.bandLabel}
          href="/recovery"
        />
        <HeroRing
          testID="ring-load"
          label={t('score.load')}
          value={day.load.value}
          max={21}
          color={colors.metric.loadBright}
          decimals={1}
          tick={v.yesterdayLoad}
          reason={day.load.reason}
          href="/load"
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 2, height: 12, backgroundColor: colors.text, borderRadius: 1 }} />
        <AppText variant="caption" muted>
          {t('home.tickYesterday')}
        </AppText>
      </View>
    </View>
  );
}
