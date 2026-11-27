import type { ReactElement } from 'react';
import { View } from 'react-native';

import { formatHm } from '@/data/dailyDerived';
import type { NeedBreakdown, NeedSegment } from '@/data/sleepDerived';
import { needSegments } from '@/data/sleepDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { radius, useTheme, type ColorTokens } from '@/ui/theme';

export function needColor(colors: ColorTokens, id: NeedSegment['id']): string {
  if (id === 'baseline') return colors.metric.sleep;
  if (id === 'load') return colors.metric.loadBright;
  if (id === 'debt') return colors.warning;
  return colors.textFaint;
}

export function signedHm(seconds: number, sign: '+' | '−'): string {
  return `${sign}${formatHm(Math.max(0, Math.round(seconds)))}`;
}

export function NeedBar({ breakdown, height = 14, testID }: { breakdown: NeedBreakdown; height?: number; testID?: string }): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  const segments = needSegments(breakdown);
  const label = [
    t('sleepHome.need.baseline', { value: formatHm(breakdown.baselineS) }),
    t('sleepHome.need.load', { value: signedHm(breakdown.loadS, '+') }),
    t('sleepHome.need.debt', { value: signedHm(breakdown.debtS, '+') }),
    t('sleepHome.need.naps', { value: signedHm(breakdown.napsS, '−') }),
    ...(breakdown.otherS === 0 ? [] : [t('sleepHome.need.other', { value: signedHm(Math.abs(breakdown.otherS), breakdown.otherS > 0 ? '+' : '−') })]),
  ].join(', ');
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: 'row', height, borderRadius: radius.pill, overflow: 'hidden', gap: 2, backgroundColor: colors.surfaceAlt }}>
      {segments.map((segment) => (
        <View key={segment.id} testID={testID === undefined ? undefined : `${testID}-${segment.id}`} style={{ flex: segment.seconds, backgroundColor: needColor(colors, segment.id) }} />
      ))}
    </View>
  );
}

interface LegendItem {
  id: NeedSegment['id'] | 'naps';
  text: string;
}

export function NeedLegend({ breakdown, testID }: { breakdown: NeedBreakdown; testID?: string }): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  const items: LegendItem[] = [
    { id: 'baseline', text: t('sleepHome.need.baseline', { value: formatHm(breakdown.baselineS) }) },
    { id: 'load', text: t('sleepHome.need.load', { value: signedHm(breakdown.loadS, '+') }) },
    { id: 'debt', text: t('sleepHome.need.debt', { value: signedHm(breakdown.debtS, '+') }) },
    { id: 'naps', text: t('sleepHome.need.naps', { value: signedHm(breakdown.napsS, '−') }) },
  ];
  if (breakdown.otherS !== 0) {
    items.push({ id: 'other', text: t('sleepHome.need.other', { value: signedHm(Math.abs(breakdown.otherS), breakdown.otherS > 0 ? '+' : '−') }) });
  }
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 16 }}>
      {items.map((item) => (
        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexBasis: '45%', flexGrow: 1 }}>
          <View
            style={
              item.id === 'naps'
                ? { width: 8, height: 8, borderRadius: 2, borderWidth: 1, borderColor: colors.textMuted }
                : { width: 8, height: 8, borderRadius: 2, backgroundColor: needColor(colors, item.id) }
            }
          />
          <AppText variant="label" muted numeric testID={testID === undefined ? undefined : `${testID}-${item.id}`}>
            {item.text}
          </AppText>
        </View>
      ))}
    </View>
  );
}
