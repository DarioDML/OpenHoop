import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import type { LoadTargetView } from '@/data/loadDerived';
import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { radius, spacing, useTheme } from '@/ui/theme';

export function targetPillText(t: TFunction, language: Language, view: LoadTargetView | null): string {
  if (view === null) return t('loadScreen.pill.calibrating');
  const low = formatNumber(view.aim.low, 1, language);
  const high = formatNumber(view.aim.high, 1, language);
  if (view.status === 'above') return t('loadScreen.pill.above', { low, high });
  if (view.status === 'within') return t('loadScreen.pill.within', { low, high });
  if (view.status === 'below' && view.toGo !== null) return t('loadScreen.pill.toGo', { low, high, toGo: formatNumber(view.toGo, 1, language) });
  return t('loadScreen.pill.range', { low, high });
}

interface Props {
  view: LoadTargetView | null;
  marker?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function TargetPill({ view, marker = false, onPress, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const { t, language } = useT();
  const text = targetPillText(t, language, view);
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
      {marker && view !== null ? <View style={{ width: 16, height: 3, borderRadius: radius.pill, backgroundColor: colors.metric.loadBright }} /> : null}
      <AppText variant="label" color={marker ? colors.info : colors.textSoft} style={{ textAlign: 'center', fontWeight: '400' }} testID={testID === undefined ? undefined : `${testID}-text`}>
        {text}
      </AppText>
    </View>
  );
  if (onPress === undefined) return <View testID={testID}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="link" accessibilityLabel={text} onPress={onPress} hitSlop={8} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}
