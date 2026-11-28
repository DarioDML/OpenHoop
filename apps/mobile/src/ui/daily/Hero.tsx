import type { DayRecord } from '@openhoop/core';
import { LOAD_MAX } from '@openhoop/analytics';
import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { metricValue, shownLoad, visibleReadiness } from '@/data/derived';
import { buildingProgress, remaining } from '@/data/progress';
import type { TermId } from '@/data/terms';
import type { HomeHero } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Num } from '@/ui/Num';
import { heroRingSize, useLayout } from '@/ui/layout';
import { useExplain, useMissing, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { missingStatus } from '@/ui/explain/whyText';
import { Ring } from '@/ui/Ring';
import type { BuildingRing } from '@/ui/ScoreRing';
import { readinessBand, readinessColor, spacing, useTheme } from '@/ui/theme';
import { pastDayOf, withDay } from '@/ui/daily/useDayParam';

interface RingProps {
  label: string;
  value: number | null;
  max: number;
  color: string;
  decimals?: number;
  percent?: boolean;
  tick?: number | null;
  explain: ExplainTarget;
  building?: BuildingRing | null;
  caption?: string | null;
  captionColor?: string;
  a11yLabel?: string;
  href: Href;
  size?: number;
  testID: string;
}

function strokeOf(size: number): number {
  return size > 120 ? 10 : 7;
}

export function HeroRing({
  label,
  value,
  max,
  color,
  decimals = 0,
  percent = false,
  tick = null,
  explain,
  building = null,
  caption = null,
  captionColor,
  a11yLabel,
  href,
  size = 104,
  testID,
}: RingProps) {
  const { colors } = useTheme();
  const { t, language } = useT();
  const { why } = useExplain();
  const missing = useMissing(explain);
  const text = value === null ? null : formatNumber(value, decimals, language);
  const status = missing === null ? t('why.noNumber') : missingStatus(t, language, missing, 'row');
  const explainable = building !== null || value === null;
  const nightsLeftLabel = building === null ? null : building.left === 1 ? t('readiness.nightsLeftA11yOne') : t('readiness.nightsLeftA11y', { count: building.left });
  const accessibilityLabel = nightsLeftLabel ?? (text === null ? `${label}: ${status}` : (a11yLabel ?? `${label}: ${text}${percent ? '%' : ''}`));
  const stroke = strokeOf(size);
  return (
    <View style={{ alignItems: 'center', gap: 10, flex: 1 }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => (explainable ? why(explain) : router.push(href))}
        style={{ alignItems: 'center', minHeight: 44, minWidth: 44 }}>
        <Ring
          size={size}
          strokeWidth={stroke}
          fraction={value === null ? null : value / max}
          color={building === null ? color : colors.pink}
          segments={building === null ? null : { count: building.need, filled: building.have }}
          tickFraction={tick === null ? null : tick / max}>
          {building !== null ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Num size={Math.round(size * 0.38)} color={colors.pink} maxFontSizeMultiplier={1}>
                {formatNumber(building.left, 0, language)}
              </Num>
              <AppText
                variant="capSmall"
                color={colors.pink}
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ fontSize: 9, lineHeight: 11, maxWidth: size * 0.62, textAlign: 'center' }}>
                {building.left === 1 ? t('readiness.nightsLeftOne') : t('readiness.nightsLeft')}
              </AppText>
            </View>
          ) : text !== null ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Num
                size={Math.round(size * 0.38)}
                color={color}
                unit={percent ? '%' : undefined}
                unitSize={Math.round(size * 0.17)}
                maxFontSizeMultiplier={1}
                adjustsFontSizeToFit
                style={{ maxWidth: size - stroke * 2 - 8 }}>
                {text}
              </Num>
              {caption ? (
                <AppText
                  variant="capSmall"
                  color={captionColor ?? color}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ fontSize: 9, lineHeight: 11, letterSpacing: 0.6, maxWidth: size * 0.62, textAlign: 'center' }}>
                  {caption}
                </AppText>
              ) : null}
            </View>
          ) : (
            <AppText
              variant="caption"
              muted
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              maxFontSizeMultiplier={1.2}
              style={{ textAlign: 'center', paddingHorizontal: Math.round(size * 0.12) }}>
              {status}
            </AppText>
          )}
        </Ring>
      </Pressable>
      <Pressable
        testID={`${testID}-label`}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => router.push(href)}
        style={{ alignSelf: 'stretch', minHeight: 44, justifyContent: 'center' }}>
        <AppText
          variant="cap"
          color={colors.textMuted}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={{ letterSpacing: size < 100 ? 0.8 : 1.4, textAlign: 'center' }}>
          {label} ›
        </AppText>
      </Pressable>
    </View>
  );
}

interface HeroProps {
  days: readonly DayRecord[];
  index: number;
  variant: HomeHero;
  footnote?: string;
}

function Footnote({ text, tick }: { text: string | undefined; tick: boolean }) {
  const { colors } = useTheme();
  const { t } = useT();
  if (!tick && text === undefined) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      {tick ? <View style={{ width: 10, height: 2, backgroundColor: colors.text, borderRadius: 1 }} /> : null}
      <AppText variant="caption" muted style={{ textAlign: 'center', flexShrink: 1 }}>
        {tick ? t('home.tickYesterday') : null}
        {tick && text !== undefined ? ' · ' : null}
        {text === undefined ? null : (
          <AppText variant="caption" muted testID="synced-line">
            {text}
          </AppText>
        )}
      </AppText>
    </View>
  );
}

interface CompactStatProps {
  label: string;
  value: string | null;
  unit: string;
  href: Href;
  explain: ExplainTarget;
  caption?: string | null;
  testID: string;
}

function CompactStat({ label, value, unit, href, explain, caption = null, testID }: CompactStatProps) {
  const { t, language } = useT();
  const { why } = useExplain();
  const missing = useMissing(explain);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => (value === null ? why(explain) : router.push(href))}
      style={{ gap: 2, minHeight: 44, justifyContent: 'center' }}>
      <AppText variant="capSmall" muted>
        {label}
      </AppText>
      {value === null ? (
        <AppText variant="label" muted>
          {missing === null ? t('why.noNumber') : missingStatus(t, language, missing, 'row')}
        </AppText>
      ) : (
        <Num size={30} unit={unit} unitSize={14}>
          {value}
        </Num>
      )}
      {value === null || caption === null ? null : (
        <AppText variant="capSmall" muted>
          {caption}
        </AppText>
      )}
    </Pressable>
  );
}

function useHeroValues(days: readonly DayRecord[], index: number) {
  const { colors } = useTheme();
  const { t, language } = useT();
  const day = days[index];
  const yesterday = index > 0 ? days[index - 1] : undefined;
  const visible = day ? visibleReadiness(day) : null;
  const readiness = visible?.value ?? null;
  const band = readinessBand(readiness);
  const progress = index === days.length - 1 ? buildingProgress('readiness', days, index) : null;
  const building: BuildingRing | null = progress === null ? null : { left: remaining(progress), have: progress.have, need: progress.need };
  const load = shownLoad(days, index);
  const format = (value: number | null, decimals: number): string | null => (value === null ? null : formatNumber(value, decimals, language));
  const target = (term: TermId, value: number | null, decimals: number, reason: string | null): ExplainTarget => ({
    term,
    index,
    shown: { value: format(value, decimals), unit: null, reason },
  });
  return {
    day,
    readiness,
    readinessTone: day?.readinessCalibrating ? colors.textMuted : readinessColor(colors, readiness),
    bandLabel: band ? t(`readiness.${band}`) : null,
    building,
    load,
    readinessTarget: target('readiness', readiness, 0, visible?.reason ?? null),
    loadTarget: target('load', load.value, 1, load.reason),
    sleepTarget: target('sleepScore', day?.sleep.score.value ?? null, 0, day?.sleep.score.reason ?? null),
    hrvTarget: target('hrv', day?.hrv.value ?? null, 0, day?.hrv.reason ?? null),
    yesterdayReadiness: yesterday ? metricValue(yesterday, 'readiness') : null,
    yesterdayLoad: yesterday ? metricValue(yesterday, 'load') : null,
    yesterdaySleep: yesterday ? metricValue(yesterday, 'sleepScore') : null,
  };
}

export function Hero({ days, index, variant, footnote }: HeroProps) {
  const { colors } = useTheme();
  const { t, language } = useT();
  const layout = useLayout();
  const ringSize = heroRingSize(layout);
  const compactRingSize = Math.min(148, Math.round((layout.width - layout.gutter * 2) * 0.45));
  const v = useHeroValues(days, index);
  if (!v.day) return null;
  const { day } = v;
  const pastDay = pastDayOf(days, index);

  if (variant === 'compact') {
    return (
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }} testID="hero-compact">
          <HeroRing
            testID="ring-readiness"
            label={t('score.readiness')}
            value={v.readiness}
            max={100}
            color={v.readinessTone}
            percent
            explain={v.readinessTarget}
            building={v.building}
            caption={v.bandLabel}
            href={withDay('/recovery', pastDay)}
            size={compactRingSize}
          />
          <View style={{ flex: 1, gap: spacing.md }}>
            <CompactStat
              label={t('metric.hrv')}
              value={day.hrv.value === null ? null : formatNumber(day.hrv.value, 0, language)}
              unit={t('unit.ms')}
              href={withDay('/recovery/metric/hrv', pastDay)}
              explain={v.hrvTarget}
              testID="stat-hrv"
            />
            <CompactStat
              label={t('score.load')}
              value={v.load.value === null ? null : formatNumber(v.load.value, 1, language)}
              unit=""
              href={withDay('/load', pastDay)}
              explain={v.loadTarget}
              caption={v.load.soFar ? t('load.soFar') : null}
              testID="stat-load"
            />
            <CompactStat
              label={t('score.sleep')}
              value={day.sleep.score.value === null ? null : formatNumber(day.sleep.score.value, 0, language)}
              unit="%"
              href={withDay('/sleep', pastDay)}
              explain={v.sleepTarget}
              testID="stat-sleep"
            />
          </View>
        </View>
        <Footnote text={footnote} tick={false} />
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
          explain={v.sleepTarget}
          href={withDay('/sleep', pastDay)}
          size={ringSize}
        />
        <HeroRing
          testID="ring-readiness"
          label={t('score.readiness')}
          value={v.readiness}
          max={100}
          color={v.readinessTone}
          percent
          tick={v.yesterdayReadiness}
          explain={v.readinessTarget}
          building={v.building}
          caption={v.bandLabel}
          href={withDay('/recovery', pastDay)}
          size={ringSize}
        />
        <HeroRing
          testID="ring-load"
          label={t('score.load')}
          value={v.load.value}
          max={LOAD_MAX}
          color={colors.metric.loadBright}
          decimals={1}
          tick={v.yesterdayLoad}
          explain={v.loadTarget}
          caption={v.load.soFar ? t('load.soFar') : null}
          a11yLabel={v.load.soFar && v.load.value !== null ? t('load.soFarA11y', { value: formatNumber(v.load.value, 1, language), max: LOAD_MAX }) : undefined}
          href={withDay('/load', pastDay)}
          size={ringSize}
        />
      </View>
      <Footnote text={footnote} tick />
    </View>
  );
}
