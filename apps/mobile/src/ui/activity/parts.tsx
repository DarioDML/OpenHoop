import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { NotBuilt, type IssueKey } from '@/ui/NotBuilt';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';
import { radius, spacing, useTheme, type Tint } from '@/ui/theme';
import type { DayRecord } from '@openhoop/core';

interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
  testID?: string;
}

export function StatTile({ label, value, unit, testID }: StatTileProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 96, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 }} testID={testID}>
      <AppText variant="capSmall" muted>
        {label}
      </AppText>
      <Num size={30} unit={unit} unitSize={13} unitColor={colors.textMuted}>
        {value}
      </Num>
    </View>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}

interface ProgressBarProps {
  fraction: number;
  color?: string;
  label: string;
}

export function ProgressBar({ fraction, color, label }: ProgressBarProps) {
  const { colors } = useTheme();
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(f * 100) }}
      style={{ height: 8, borderRadius: 4, backgroundColor: colors.ringTrack, overflow: 'hidden' }}>
      <View style={{ width: `${f * 100}%`, height: 8, borderRadius: 4, backgroundColor: color ?? colors.accent }} />
    </View>
  );
}

interface PlannedScreenProps {
  title: string;
  intro: string;
  issue: IssueKey;
  tint?: Tint;
  bullets?: ReadonlyArray<TranslationKey>;
  bulletsTitle?: string;
  action?: { label: string; href: Href };
  close?: boolean;
  children?: ReactNode;
  testID?: string;
}

export function PlannedScreen({ title, intro, issue, tint = 'load', bullets, bulletsTitle, action, close = false, children, testID }: PlannedScreenProps) {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <Screen
      tint={tint}
      testID={testID}
      header={
        <>
          <TopBar title={title} back={!close} close={close} />
          <AppText variant="lead" soft>
            {intro}
          </AppText>
        </>
      }>
      <NotBuilt issue={issue} />
      {children}
      {bullets && bullets.length > 0 ? (
        <ListGroup title={bulletsTitle ?? t('activity.planned.title')}>
          {bullets.map((key) => (
            <ListRow key={key} title={t(key)} icon={{ icon: 'check', color: colors.textMuted, background: colors.surfaceAlt }} disabled />
          ))}
        </ListGroup>
      ) : null}
      {action ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(action.href)}
          style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <AppText variant="capLarge" color={colors.link}>
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </Screen>
  );
}

interface NoDataProps {
  title: string;
  tint?: Tint;
  notFound?: boolean;
}

export function NoDataScreen({ title, tint = 'load', notFound = false }: NoDataProps) {
  const { t } = useT();
  return (
    <Screen tint={tint} header={<TopBar title={title} />}>
      <Card>
        <AppText variant="title">{notFound ? t('activity.notFound.title') : t('empty.title')}</AppText>
        <AppText variant="body" muted>
          {notFound ? t('activity.notFound.body') : t('empty.body')}
        </AppText>
      </Card>
    </Screen>
  );
}

export function useLatestDay(): DayRecord | null {
  const { days } = useAppData();
  return days[days.length - 1] ?? null;
}
