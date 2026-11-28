import type { DayRecord } from '@openhoop/core';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { Baseline } from '@/data/derived';
import { percentFromBaseline, rangeStatus } from '@/data/derived';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatNumber, formatSigned } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import type { ChipTone } from '@/ui/Chip';
import { useExplain, useMissing, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { MetricName } from '@/ui/explain/MetricName';
import { Icon } from '@/ui/Icon';
import type { IconTileStyle } from '@/ui/ListGroup';
import { missingStatus } from '@/ui/explain/whyText';
import { StateCard } from '@/ui/StateCard';
import { TopBar } from '@/ui/TopBar';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme, type Tint } from '@/ui/theme';

export function useRangeChip(): (value: number | null, baseline: Baseline | null, decimals: number) => { label: string; tone: ChipTone } | null {
  const { t, language } = useT();
  return (value, baseline, decimals) => {
    if (value === null) return null;
    const status = rangeStatus(value, baseline);
    if (status === null || baseline === null) return { label: t('range.calibrating'), tone: 'neutral' };
    const low = formatNumber(baseline.low, decimals, language);
    const high = formatNumber(baseline.high, decimals, language);
    return { label: t(`range.${status}`, { low, high }), tone: status === 'within' ? 'positive' : 'warning' };
  };
}

export function usePercentChip(): (value: number | null, baseline: Baseline | null) => { label: string; tone: ChipTone } | null {
  const { t, language } = useT();
  return (value, baseline) => {
    const pct = percentFromBaseline(value, baseline);
    if (pct === null) return null;
    const rounded = Math.round(pct);
    const text = formatSigned(rounded, 0, language);
    if (rounded === 0) return { label: t('daily.vsBaselineSame'), tone: 'positive' };
    return { label: t('daily.vsBaseline', { value: text }), tone: Math.abs(pct) > 10 ? 'warning' : 'neutral' };
  };
}

interface StatRowProps {
  label: string;
  value: string;
  caption?: string;
  right?: ReactNode;
  href?: Href;
  explain?: ExplainTarget;
  testID?: string;
}

export function WhyValue({ target, testID }: { target: ExplainTarget; testID?: string }) {
  const { t, language } = useT();
  const explain = useExplain();
  const missing = useMissing(target);
  const status = missing === null ? t('why.noNumber') : missingStatus(t, language, missing, 'row');
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID ? `${testID}-why` : undefined}
      onPress={() => explain.why(target)}
      style={{ minHeight: 44, justifyContent: 'center', flexShrink: 1, maxWidth: '60%' }}>
      <AppText variant="bodyStrong" muted style={{ textAlign: 'right' }}>
        {`${status} ›`}
      </AppText>
    </Pressable>
  );
}

export function StatRow({ label, value, caption, right, href, explain, testID }: StatRowProps) {
  const { colors } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 }}>
      <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 96, gap: 2 }}>
        {explain ? (
          <MetricName target={explain} label={label} variant="body" muted={false} testID={testID ? `${testID}-name` : undefined} />
        ) : (
          <AppText variant="body" style={{ fontWeight: '500' }}>
            {label}
          </AppText>
        )}
        {caption ? (
          <AppText variant="caption" muted>
            {caption}
          </AppText>
        ) : null}
      </View>
      {right}
      {explain?.shown?.value === null ? (
        <WhyValue target={explain} testID={testID} />
      ) : (
        <AppText variant="bodyStrong" numeric style={{ flexShrink: 1, maxWidth: '60%', textAlign: 'right' }}>
          {value}
        </AppText>
      )}
      {href ? (
        <AppText variant="title" color={colors.textMuted}>
          ›
        </AppText>
      ) : null}
    </View>
  );
  if (!href) return <View testID={testID}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

interface PageProps {
  title: string;
  tint?: Tint;
  children: ReactNode;
  hero?: ReactNode;
  right?: ReactNode;
  testID?: string;
  footer?: ReactNode;
  close?: boolean;
  scrollEnabled?: boolean;
}

/** Tinted header with a top bar (and optional hero) over a sheet of cards. */
export function Page({ title, tint = 'neutral', children, hero, right, testID, footer, close = false, scrollEnabled }: PageProps) {
  return (
    <Screen
      testID={testID}
      tint={tint}
      footer={footer}
      scrollEnabled={scrollEnabled}
      header={
        <>
          <TopBar title={title} right={right} close={close} />
          {hero}
        </>
      }>
      {children}
    </Screen>
  );
}

export function NoDataPage({ title, body }: { title: string; body: string }) {
  const { t } = useT();
  return (
    <Page title={title}>
      <StateCard icon="calendar" tone="neutral" title={t('daily.noDataTitle')} body={body} actionLabel={t('daily.backToToday')} onAction={() => router.replace('/')} />
    </Page>
  );
}

export function useLatestDay(): { days: DayRecord[]; day: DayRecord | null; index: number } {
  const { days } = useAppData();
  const index = days.length - 1;
  return { days, day: days[index] ?? null, index };
}

interface CalloutProps {
  title: string;
  body: string;
  tone?: 'default' | 'warning';
}

export function Callout({ title, body, tone = 'default' }: CalloutProps) {
  return (
    <Card tone={tone} style={{ gap: 6 }}>
      <AppText variant="bodyStrong">{title}</AppText>
      <AppText variant="body" muted>
        {body}
      </AppText>
    </Card>
  );
}

interface CapRowProps {
  title: string;
  links?: ReadonlyArray<{ label: string; onPress: () => void; testID?: string }>;
}

export function CapRow({ title, links = [] }: CapRowProps) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
      <AppText variant="capLarge" muted accessibilityRole="header" style={{ flex: 1, minWidth: 0 }}>
        {title}
      </AppText>
      <View style={{ flexDirection: 'row', flexShrink: 0, gap: spacing.md }}>
        {links.map((link) => (
          <Pressable key={link.label} testID={link.testID} accessibilityRole="link" onPress={link.onPress} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText variant="cap" muted>
              {link.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface DotsProps {
  dots: ReadonlyArray<boolean | null>;
  color: string;
}

export function WeekDots({ dots, color }: DotsProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {dots.map((on, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            maxWidth: 14,
            aspectRatio: 1,
            borderRadius: radius.pill,
            backgroundColor: on === true ? color : 'transparent',
            borderWidth: on === true ? 0 : 1.5,
            borderColor: on === null ? colors.border : colors.textFaint,
          }}
        />
      ))}
    </View>
  );
}

interface IconTileProps {
  tile: IconTileStyle;
  size?: number;
  children?: ReactNode;
  testID?: string;
}

export function IconTile({ tile, size = 36, children, testID }: IconTileProps) {
  return (
    <View
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: size > 40 ? radius.md - 4 : radius.sm,
        backgroundColor: tile.background,
        alignItems: 'center',
        justifyContent: 'center',
        flex: 0,
      }}>
      {children ?? <Icon name={tile.icon} color={tile.color} size={Math.round(size * 0.5)} strokeWidth={size > 40 ? 1.75 : 2} />}
    </View>
  );
}

export function GoalSeal({ size = 20, label, testID }: { size?: number; label: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={label} testID={testID}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 1.5l2.6 2.3 3.4-.4.8 3.4 3 1.7-1.3 3.2 1.3 3.2-3 1.7-.8 3.4-3.4-.4L12 22.5l-2.6-2.3-3.4.4-.8-3.4-3-1.7 1.3-3.2-1.3-3.2 3-1.7.8-3.4 3.4.4z"
          fill={colors.positive}
        />
        <Path d="M8 12.2l2.7 2.7L16.2 9.4" fill="none" stroke={colors.background} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

interface ProgressBarProps {
  fraction: number;
  color: string;
  height?: number;
  testID?: string;
}

export function ProgressBar({ fraction, color, height = 8, testID }: ProgressBarProps) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return (
    <View testID={testID} style={{ height, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: 'hidden' }}>
      <View style={{ width: `${clamped * 100}%`, height, borderRadius: radius.pill, backgroundColor: color }} />
    </View>
  );
}

interface SectionTitleProps {
  title: string;
  links?: ReadonlyArray<{ label: string; onPress: () => void; testID?: string }>;
}

export function SectionTitle({ title, links = [] }: SectionTitleProps) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginTop: spacing.sm, columnGap: spacing.md }}>
      <AppText variant="h2" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {title}
      </AppText>
      {links.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          {links.map((link) => (
            <Pressable key={link.label} testID={link.testID} accessibilityRole="link" onPress={link.onPress} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText variant="cap" muted>
                {link.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
