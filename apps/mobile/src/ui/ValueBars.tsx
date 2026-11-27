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
}

interface Props {
  bars: readonly ValueBar[];
  highlight?: number;
  height?: number;
  max?: number;
  barWidth?: number;
  testID?: string;
}

const MIN_BAR = 4;

export function ValueBars({ bars, highlight, height = 80, max, barWidth = 22, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const present = bars.map((b) => b.value).filter((v): v is number => v !== null);
  const top = Math.max(max ?? 0, ...present, 1);
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      {bars.map((bar, index) => {
        const current = index === highlight;
        const color = bar.color ?? colors.accent;
        const barHeight = bar.value === null ? 0 : Math.max(MIN_BAR, Math.round((Math.max(0, bar.value) / top) * height));
        return (
          <View
            key={bar.key}
            testID={testID === undefined ? undefined : `${testID}-${bar.key}`}
            accessible
            accessibilityLabel={`${bar.label}: ${bar.value === null ? '–' : (bar.display ?? String(bar.value))}`}
            style={{ alignItems: 'center', gap: 6, minWidth: barWidth + 12 }}>
            {bar.value === null ? (
              <AppText variant="caption" muted>
                –
              </AppText>
            ) : (
              <Num size={15} color={current ? color : colors.text} maxFontSizeMultiplier={1.2}>
                {bar.display ?? String(bar.value)}
              </Num>
            )}
            <View style={{ height, justifyContent: 'flex-end' }}>
              {bar.value === null ? (
                <View style={{ width: barWidth, height: MIN_BAR, borderRadius: 2, backgroundColor: colors.surface3 }} />
              ) : (
                <View
                  style={{
                    width: barWidth,
                    height: barHeight,
                    borderRadius: 6,
                    backgroundColor: color,
                    ...(current ? { borderWidth: 2, borderColor: colors.text } : null),
                  }}
                />
              )}
            </View>
            <AppText variant="caption" color={current ? colors.text : colors.textMuted} style={current ? { fontWeight: '600' } : undefined}>
              {bar.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}
