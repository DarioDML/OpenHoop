import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/ui/theme';

const STAR =
  'M12 1.5l2.6 2.3 3.4-.4.8 3.4 3 1.7-1.3 3.2 1.3 3.2-3 1.7-.8 3.4-3.4-.4L12 22.5l-2.6-2.3-3.4.4-.8-3.4-3-1.7 1.3-3.2-1.3-3.2 3-1.7.8-3.4 3.4.4z';

interface Props {
  size?: number;
  label?: string;
  testID?: string;
}

export function DoneBadge({ size = 24, label, testID }: Props) {
  const { colors } = useTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessible={label !== undefined}
      accessibilityRole={label === undefined ? undefined : 'image'}
      accessibilityLabel={label}
      testID={testID}>
      <Path d={STAR} fill={colors.positive} />
      <Path d="M8 12.2l2.7 2.7L16.2 9.4" fill="none" stroke={colors.primaryOn} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
