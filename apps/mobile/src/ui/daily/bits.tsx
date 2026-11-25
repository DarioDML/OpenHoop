import type { DayRecord } from '@openhoop/core';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { Baseline } from '@/data/derived';
import { percentFromBaseline, rangeStatus } from '@/data/derived';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatNumber, formatSigned } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import type { ChipTone } from '@/ui/Chip';
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
  testID?: string;
}

export function StatRow({ label, value, caption, right, href, testID }: StatRowProps) {
  const { colors } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" style={{ fontWeight: '500' }}>
          {label}
        </AppText>
        {caption ? (
          <AppText variant="caption" muted>
            {caption}
          </AppText>
        ) : null}
      </View>
      {right}
      <AppText variant="bodyStrong" numeric>
        {value}
      </AppText>
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
}

/** Tinted header with a top bar (and optional hero) over a sheet of cards. */
export function Page({ title, tint = 'neutral', children, hero, right, testID, footer, close = false }: PageProps) {
  return (
    <Screen
      testID={testID}
      tint={tint}
      footer={footer}
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
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }}>
      <AppText variant="capLarge" muted accessibilityRole="header">
        {title}
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
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
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {dots.map((on, i) => (
        <View
          key={i}
          style={{
            width: 14,
            height: 14,
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
