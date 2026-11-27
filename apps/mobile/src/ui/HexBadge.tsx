import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from './theme';

interface Props {
  size?: number;
  earned: boolean;
  children?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

const HEX = 'M32 3l25 14.5v29L32 61 7 46.5v-29z';

export function HexBadge({ size = 64, earned, children, accessibilityLabel, testID }: Props): ReactElement {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      accessible={accessibilityLabel !== undefined}
      accessibilityRole={accessibilityLabel !== undefined ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 64 64" style={{ position: 'absolute' }}>
        <Path d={HEX} fill={earned ? colors.goldSoft : colors.surface} stroke={earned ? colors.gold : colors.surface3} strokeWidth={2.5} strokeLinejoin="round" />
      </Svg>
      {children}
    </View>
  );
}
