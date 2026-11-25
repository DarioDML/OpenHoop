import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export type IconName = 'today' | 'sleep' | 'load' | 'trends' | 'band' | 'settings';

interface Props {
  name: IconName;
  color: ColorValue;
  size?: number;
}

export function Icon({ name, color, size = 24 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {name === 'today' ? (
        <>
          <Circle cx={12} cy={12} r={4} />
          <Path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : null}
      {name === 'sleep' ? <Path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /> : null}
      {name === 'load' ? <Path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /> : null}
      {name === 'trends' ? <Path d="M3 17l6-6 4 4 8-8M15 7h6v6" /> : null}
      {name === 'band' ? (
        <>
          <Path d="M9 6V3h6v3M9 18v3h6v-3" />
          <Path d="M8 6h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
          <Path d="M12 10v2l1.5 1" />
        </>
      ) : null}
      {name === 'settings' ? (
        <>
          <Path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
          <Circle cx={16} cy={7} r={2.5} />
          <Circle cx={8} cy={17} r={2.5} />
        </>
      ) : null}
    </Svg>
  );
}
