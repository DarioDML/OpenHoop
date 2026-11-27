import type { ReactElement } from 'react';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { ToggleRow } from '@/ui/manage/rows';
import { spacing, useTheme } from '@/ui/theme';

import { useLoadBuzz, type LoadToday } from './useLoadToday';

export function BuzzSwitches({ today }: { today: LoadToday }): ReactElement {
  const { colors } = useTheme();
  const { t, language } = useT();
  const buzz = useLoadBuzz(today);
  const aim = today.aim;
  const targetText = aim === null ? t('loadBuzz.atTarget.subtitlePlain') : t('loadBuzz.atTarget.subtitle', { low: formatNumber(aim.low, 1, language) });
  const topText = aim === null ? t('loadBuzz.overTop.subtitlePlain') : t('loadBuzz.overTop.subtitle', { high: formatNumber(aim.high, 1, language) });
  const done = (text: string, on: boolean, isDone: boolean): string => (on && isDone ? t('loadBuzz.doneToday', { text }) : text);
  return (
    <Card testID="buzz-card" style={{ gap: 0, paddingVertical: spacing.xs }}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ToggleRow
          title={t('loadBuzz.atTarget.title')}
          subtitle={done(targetText, buzz.prefs.atTarget, buzz.doneToday.target)}
          value={buzz.prefs.atTarget}
          onChange={(on) => buzz.set('target', on)}
          testID="buzz-target"
        />
      </View>
      <ToggleRow
        title={t('loadBuzz.overTop.title')}
        subtitle={done(topText, buzz.prefs.overTop, buzz.doneToday.top)}
        value={buzz.prefs.overTop}
        onChange={(on) => buzz.set('top', on)}
        testID="buzz-top"
      />
      <AppText variant="caption" muted style={{ paddingTop: spacing.xs, paddingBottom: spacing.md }} testID="buzz-availability">
        {buzz.availability}
      </AppText>
    </Card>
  );
}
