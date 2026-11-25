import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { ParityLevel } from '@/data/types';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon, type IconName } from '@/ui/Icon';
import { NotBuilt, type IssueKey } from '@/ui/NotBuilt';
import { ParityBadge } from '@/ui/ParityBadge';
import { StateCard } from '@/ui/StateCard';
import { spacing, useTheme, type Tint } from '@/ui/theme';

import { HealthPage } from './HealthPage';

interface Props {
  title: string;
  heading: string;
  body: string;
  icon: IconName;
  issue: IssueKey;
  points?: readonly string[];
  pointsTitle?: string;
  level?: ParityLevel;
  levelNote?: string;
  needsMg?: boolean;
  tint?: Tint;
  right?: ReactNode;
  children?: ReactNode;
  testID?: string;
}

export function FeaturePage({ title, heading, body, icon, issue, points, pointsTitle, level, levelNote, needsMg = false, tint = 'health', right, children, testID }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const { device } = useAppData();
  const missingHardware = needsMg && device.model !== 'MG';
  return (
    <HealthPage
      title={title}
      tint={tint}
      right={right}
      testID={testID}
      hero={
        <View style={{ gap: spacing.md }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} color={colors.textSoft} size={24} />
          </View>
          <AppText variant="h2" accessibilityRole="header">
            {heading}
          </AppText>
          <AppText variant="lead" muted>
            {body}
          </AppText>
        </View>
      }>
      {missingHardware ? (
        <StateCard icon="band" tone="pink" title={t('health.mg.needsTitle')} body={t('health.mg.needsBody')} testID="needs-mg" />
      ) : null}
      <NotBuilt issue={issue} />
      {needsMg ? (
        <AppText variant="caption" muted testID="mg-disclaimer">
          {t('health.mg.disclaimer')}
        </AppText>
      ) : null}
      {points && points.length > 0 ? (
        <Card>
          {pointsTitle ? (
            <AppText variant="capLarge" muted>
              {pointsTitle}
            </AppText>
          ) : null}
          {points.map((point) => (
            <View key={point} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
              <View style={{ marginTop: 3 }}>
                <Icon name="check" color={colors.textMuted} size={16} />
              </View>
              <AppText variant="body" soft style={{ flex: 1 }}>
                {point}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}
      {level ? (
        <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <ParityBadge level={level} long />
          <AppText variant="label" muted style={{ flex: 1 }}>
            {levelNote ?? t(`level.${level}`)}
          </AppText>
        </Card>
      ) : null}
      {children}
    </HealthPage>
  );
}
