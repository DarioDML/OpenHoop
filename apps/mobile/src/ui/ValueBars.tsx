import type { ReactElement } from 'react';
import { View } from 'react-native';

import { AppText } from './AppText';
import { Num } from './Num';
import { useTheme } from './theme';

export interface ValueBar {
  key: string;
  value: number | null;
  label: string;
  display?: string;
  color?: string;
  a11yLabel?: string;
}

interface Props {
  bars: readonly ValueBar[];
  highlight?: number;
  height?: number;
  max?: number;
  barWidth?: number;
  showValues?: boolean;
  fill?: boolean;
  testID?: string;
}

const MIN_BAR = 4;

export function ValueBars({ bars, highlight, height = 80, max, barWidth = 22, showValues = true, fill = false, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const present = bars.map((b) => b.value).filter((v): v is number => v !== null);
  const top = Math.max(max ?? 0, ...present, 1);
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: fill ? 4 : 0 }}>
      {bars.map((bar, index) => {
        const current = index === highlight;
        const color = bar.color ?? colors.accent;
        const barHeight = bar.value === null ? 0 : Math.max(MIN_BAR, Math.round((Math.max(0, bar.value) / top) * height));
        const width = fill ? '70%' : barWidth;
        return (
          <View
            key={bar.key}
            testID={testID === undefined ? undefined : `${testID}-${bar.key}`}
            accessible
            accessibilityLabel={`${bar.a11yLabel ?? bar.label}: ${bar.value === null ? '–' : (bar.display ?? String(bar.value))}`}
            style={fill ? { alignItems: 'center', gap: 6, flex: 1, minWidth: 0 } : { alignItems: 'center', gap: 6, minWidth: barWidth + 12 }}>
            {showValues ? (
              bar.value === null ? (
                <AppText variant="caption" muted>
                  –
                </AppText>
              ) : (
                <Num size={15} color={current ? color : colors.text} maxFontSizeMultiplier={1.2}>
                  {bar.display ?? String(bar.value)}
                </Num>
              )
            ) : null}
            <View style={{ height, width: '100%', alignItems: 'center', justifyContent: 'flex-end' }}>
              {bar.value === null ? (
                <View style={{ width, maxWidth: barWidth, height: MIN_BAR, borderRadius: 2, backgroundColor: colors.surface3 }} />
              ) : (
                <View
                  style={{
                    width,
                    maxWidth: barWidth,
                    height: barHeight,
                    borderRadius: fill ? 5 : 6,
                    backgroundColor: color,
                    ...(current ? { borderWidth: 2, borderColor: colors.text } : null),
                  }}
                />
              )}
            </View>
            <AppText variant="caption" numberOfLines={fill ? 1 : undefined} color={current ? colors.text : colors.textMuted} style={current ? { fontWeight: '600' } : undefined}>
              {bar.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}
