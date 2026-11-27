import type { DayRecord } from '@openhoop/core';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { firstWeekItems, type BuildingTerm, type Progress } from '@/data/progress';
import { TERMS } from '@/data/terms';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { useExplain, useMissing, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { ProgressDots } from '@/ui/explain/ProgressDots';
import { missingStatus } from '@/ui/explain/whyText';
import { spacing, useTheme } from '@/ui/theme';

interface RowProps {
  term: BuildingTerm;
  progress: Progress;
  index: number;
}

function FirstWeekRow({ term, progress, index }: RowProps): ReactElement {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { why } = useExplain();
  const target: ExplainTarget = { term, index, shown: { value: null, unit: null, reason: 'needs-history' } };
  const missing = useMissing(target);
  const name = t(TERMS[term].name);
  const status = missing === null ? t('why.noNumber') : missingStatus(t, language, missing, 'row');
  return (
    <Pressable
      testID={`first-week-${term}-row`}
      accessibilityRole="button"
      accessibilityLabel={`${name}: ${status}`}
      onPress={() => why(target)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, borderTopWidth: 1, borderTopColor: colors.border }}>
      <AppText variant="body" style={{ flex: 1, fontWeight: '500' }} numberOfLines={2}>
        {name}
      </AppText>
      <ProgressDots progress={progress} />
      <AppText variant="label" muted testID={`first-week-${term}`} style={{ minWidth: 96, textAlign: 'right' }}>
        {status}
      </AppText>
    </Pressable>
  );
}

interface Props {
  days: readonly DayRecord[];
  index: number;
}

export function FirstWeekCard({ days, index }: Props): ReactElement | null {
  const { t } = useT();
  const items = index === days.length - 1 ? firstWeekItems(days, index) : [];
  if (items.length === 0) return null;
  return (
    <Card testID="card-first-week" style={{ gap: spacing.sm }}>
      <AppText variant="cardTitle">{t('firstWeek.title')}</AppText>
      <AppText variant="body" muted>
        {t('firstWeek.body')}
      </AppText>
      <View>
        {items.map((item) => (
          <FirstWeekRow key={item.term} term={item.term} progress={item.progress} index={index} />
        ))}
      </View>
    </Card>
  );
}
