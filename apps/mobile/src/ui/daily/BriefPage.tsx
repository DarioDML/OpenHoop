import { router } from 'expo-router';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { spacing, useTheme } from '@/ui/theme';

import { Page } from './bits';
import type { BriefLine } from './briefText';

export interface BriefStat {
  id: string;
  label: string;
  value: string | null;
  missing?: string;
  unit?: string;
  color?: string;
}

interface Props {
  title: string;
  heading: string;
  stats: BriefStat[];
  lines: BriefLine[];
  linesTitle: string;
  emptyText: string;
  testID: string;
}

export function BriefPage({ title, heading, stats, lines, linesTitle, emptyText, testID }: Props) {
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
                  <Num size={34} color={stat.color} unit={stat.unit}>
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
