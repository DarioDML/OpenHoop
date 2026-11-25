import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { NotBuilt, type IssueKey } from '@/ui/NotBuilt';
import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';
import { radius, spacing, useTheme, type Tint } from '@/ui/theme';
import type { DayRecord, WorkoutRecord } from '@openhoop/core';

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

export function workoutTitle(workout: WorkoutRecord, fallback: string): string {
  return workout.label ?? fallback;
}

interface WorkoutRowProps {
  day: DayRecord;
  index: number;
}

export function WorkoutRow({ day, index }: WorkoutRowProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const workout = day.workouts[index];
  if (!workout) return null;
  return (
    <Card
      href={{ pathname: '/activity/details', params: { day: day.day, index: String(index) } }}
      accessibilityLabel={workoutTitle(workout, t('workout.default'))}
      testID={`workout-${day.day}-${index}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="pulse" color={colors.accent} size={20} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{workoutTitle(workout, t('workout.default'))}</AppText>
        <AppText variant="label" muted numeric>
          {formatClock(workout.start, day.tzOffsetS)}–{formatClock(workout.end, day.tzOffsetS)} · {formatDuration(t, workout.end - workout.start)}
        </AppText>
        <AppText variant="caption" muted numeric>
          {t('load.workoutStats', { avg: workout.avgHr, max: workout.maxHr })} · {workout.source === 'auto' ? t('workout.auto') : t('workout.manual')}
        </AppText>
      </View>
      <Icon name="chevronRight" color={colors.textMuted} size={18} />
    </Card>
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

interface StepperProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  testID: string;
}

export function Stepper({ label, hint, value, min, max, onChange, testID }: StepperProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const button = (delta: number, name: 'minus' | 'plus') => {
    const next = value + delta;
    const disabled = next < min || next > max;
    return (
      <Pressable
        testID={`${testID}-${name}`}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${delta > 0 ? t('plan.setup.increase') : t('plan.setup.decrease')}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(next)}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        }}>
        <AppText variant="title">{delta > 0 ? '+' : '−'}</AppText>
      </Pressable>
    );
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">{label}</AppText>
          <AppText variant="label" muted>
            {hint}
          </AppText>
        </View>
        {button(-1, 'minus')}
        <View style={{ minWidth: 36, alignItems: 'center' }}>
          <Num size={40} testID={`${testID}-value`}>
            {String(value)}
          </Num>
        </View>
        {button(1, 'plus')}
      </View>
    </Card>
  );
}
