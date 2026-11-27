import type { ReactElement } from 'react';
import { View } from 'react-native';

import type { DotState } from '@/data/weeklyPlan';

import { radius, useTheme } from '../theme';

interface Props {
  dots: readonly DotState[];
  color: string;
  label: string;
  testID?: string;
}

const SIZE = 14;

export function GoalDots({ dots, color, label, testID }: Props): ReactElement {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={label} testID={testID} style={{ flexDirection: 'row', gap: 6 }}>
      {dots.map((state, i) => (
        <View
          key={i}
          testID={testID ? `${testID}-${i}-${state}` : undefined}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: radius.pill,
            overflow: 'hidden',
            flexDirection: 'row',
            backgroundColor: state === 'hit' ? color : state === 'none' ? 'transparent' : colors.surface3,
            borderWidth: state === 'none' ? 1.5 : 0,
            borderColor: colors.surface3,
            opacity: state === 'open' ? 0.55 : 1,
          }}>
          {state === 'partial' ? <View style={{ width: SIZE / 2, height: SIZE, backgroundColor: color }} /> : null}
        </View>
      ))}
    </View>
  );
}
