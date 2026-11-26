import { Linking, Pressable, View } from 'react-native';

import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { radius, spacing, useTheme } from './theme';

export const ISSUES = {
  coach: 3,
  notifications: 4,
  widgets: 5,
  alarm: 6,
  stages: 7,
  sleepEdit: 8,
  jetLag: 9,
  activities: 10,
  gps: 11,
  share: 12,
  calories: 13,
  strength: 14,
  stress: 15,
  healthspan: 16,
  mg: 17,
  cycle: 18,
  labs: 19,
  bodyComp: 20,
  report: 21,
  voice: 22,
  community: 23,
  integrations: 24,
  import: 25,
  bandConfig: 27,
  backup: 28,
} as const;

export type IssueKey = keyof typeof ISSUES;

const REPO_ISSUES = 'https://github.com/DarioDML/OpenHoop/issues/';

export function issueUrl(issue: IssueKey): string {
  return `${REPO_ISSUES}${ISSUES[issue]}`;
}

interface Props {
  issue: IssueKey;
  body?: string;
  compact?: boolean;
  testID?: string;
}

export function NotBuilt({ issue, body, compact = false, testID }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const number = ISSUES[issue];
  return (
    <View
      testID={testID ?? `not-built-${issue}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: compact ? spacing.md : spacing.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="code" color={colors.pink} size={18} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="bodyStrong">{t('notBuilt.title')}</AppText>
        <AppText variant="label" muted>
          {body ?? t('notBuilt.body')}
        </AppText>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('notBuilt.issue', { number })}
          hitSlop={8}
          onPress={() => void Linking.openURL(issueUrl(issue))}
          style={{ minHeight: 32, justifyContent: 'center' }}>
          <AppText variant="cap" color={colors.link}>
            {t('notBuilt.issue', { number })} →
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
