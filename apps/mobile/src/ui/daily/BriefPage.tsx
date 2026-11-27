import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { useExplain, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { Icon, type IconName } from '@/ui/Icon';
import { radius, spacing, useTheme, type ColorTokens, type Tint } from '@/ui/theme';

import { router } from 'expo-router';
import { Button } from '@/ui/controls';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';

import { Page } from './bits';
import type { BriefLine, PlanItem, PlanTone } from './briefText';

export interface BriefStat {
  id: string;
  label: string;
  value: string | null;
  missing?: string;
  unit?: string;
  tone?: PlanTone;
  explain?: ExplainTarget;
}

function toneColors(colors: ColorTokens, tone: PlanTone): { fg: string; bg: string } {
  if (tone === 'info') return { fg: colors.info, bg: colors.infoSoft };
  if (tone === 'purple') return { fg: colors.levelC, bg: colors.purpleSoft };
  if (tone === 'warning') return { fg: colors.warning, bg: colors.warningSoft };
  if (tone === 'positive') return { fg: colors.positive, bg: colors.positiveSoft };
  return { fg: colors.textMuted, bg: colors.surfaceAlt };
}

export function TonePill({ label, tone, testID }: { label: string; tone: PlanTone; testID?: string }) {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  return (
    <View testID={testID} style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: bg }}>
      <AppText variant="label" color={fg} numeric style={{ fontWeight: '600' }}>
        {label}
      </AppText>
    </View>
  );
}

function StatChip({ stat }: { stat: BriefStat }) {
  const { t } = useT();
  const { colors } = useTheme();
  const { why } = useExplain();
  const tone = stat.tone ?? 'neutral';
  if (stat.value !== null) {
    return <TonePill label={`${stat.label} ${stat.value}${stat.unit ?? ''}`} tone={tone} testID={`stat-${stat.id}`} />;
  }
  const status = stat.missing ?? t('reason.no-data');
  const { fg, bg } = toneColors(colors, 'neutral');
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: bg }}>
      <AppText variant="label" color={fg} style={{ fontWeight: '600' }}>
        {t('brief.statMissing', { label: stat.label, status })}
      </AppText>
      {stat.explain === undefined ? null : <Icon name="info" size={14} color={fg} />}
    </View>
  );
  const target = stat.explain;
  if (target === undefined) return <View testID={`stat-${stat.id}`}>{body}</View>;
  return (
    <Pressable
      testID={`stat-${stat.id}`}
      accessibilityRole="button"
      accessibilityLabel={t('brief.statMissing', { label: stat.label, status })}
      onPress={() => why(target)}
      hitSlop={8}>
      {body}
    </Pressable>
  );
}

export function StatChips({ stats }: { stats: readonly BriefStat[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {stats.map((stat) => (
        <StatChip key={stat.id} stat={stat} />
      ))}
    </View>
  );
}

export function PlanCard({ items, testID }: { items: readonly PlanItem[]; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ gap: spacing.xl, paddingVertical: spacing.xl }} testID={testID}>
      {items.map((item, i) => (
        <View key={item.id} style={{ flexDirection: 'row', gap: spacing.lg }} testID={`line-${item.id}`}>
          <View style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="bodyStrong" numeric>
              {i + 1}
            </AppText>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <AppText variant="cardTitle">{item.title}</AppText>
            <AppText variant="body" muted>
              {item.reason}
            </AppText>
            {item.pill === null ? null : <TonePill label={item.pill.label} tone={item.pill.tone} testID={`pill-${item.id}`} />}
          </View>
        </View>
      ))}
    </Card>
  );
}

interface ShellProps {
  title: string;
  tint: Tint;
  icon: IconName;
  iconColor: string;
  heading: string;
  sub?: ReactNode;
  children: ReactNode;
  testID: string;
}

export function BriefShell({ title, tint, icon, iconColor, heading, sub, children, testID }: ShellProps) {
  return (
    <Page
      title={title}
      tint={tint}
      testID={testID}
      hero={
        <View style={{ gap: spacing.md }}>
          <Icon name={icon} color={iconColor} size={40} />
          <AppText variant="h1" accessibilityRole="header">
            {heading}
          </AppText>
          {sub}
        </View>
      }>
      {children}
    </Page>
  );
}

interface LegacyProps {
  title: string;
  heading: string;
  stats: BriefStat[];
  lines: BriefLine[];
  linesTitle: string;
  emptyText: string;
  testID: string;
}

export function BriefPage({ title, heading, stats, lines, linesTitle, emptyText, testID }: LegacyProps) {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <Page
      title={title}
      tint="home"
      testID={testID}
      hero={
        <View style={{ gap: spacing.lg }}>
          <AppText variant="h2" accessibilityRole="header">
            {heading}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.xl }}>
            {stats.map((stat) => (
              <View key={stat.id} style={{ gap: 4 }} testID={`stat-${stat.id}`}>
                <AppText variant="capSmall" muted>
                  {stat.label}
                </AppText>
                {stat.value === null ? (
                  <AppText variant="label" muted>
                    {stat.missing ?? t('reason.no-data')}
                  </AppText>
                ) : (
                  <Num size={34} unit={stat.unit}>
                    {stat.value}
                  </Num>
                )}
              </View>
            ))}
          </View>
        </View>
      }
      footer={<Button label={t('home.askCoach')} variant="secondary" onPress={() => router.push('/coach')} />}>
      <AppText variant="capLarge" muted>
        {linesTitle}
      </AppText>
      {lines.length > 0 ? (
        <Card style={{ gap: spacing.lg }}>
          {lines.map((line, i) => (
            <View key={line.id} style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="caption" numeric style={{ fontWeight: '600' }}>
                  {i + 1}
                </AppText>
              </View>
              <AppText variant="body" style={{ flex: 1 }} testID={`line-${line.id}`}>
                {line.text}
              </AppText>
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <AppText variant="body" muted>
            {emptyText}
          </AppText>
        </Card>
      )}
      <Card tone="outline" style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <ParityBadge level={PARITY.readiness} long />
        </View>
        <AppText variant="caption" muted>
          {t('home.briefNote')}
        </AppText>
      </Card>
    </Page>
  );
}
