import type { ReactElement } from 'react';
import { View } from 'react-native';

import type { Progress } from '@/data/progress';
import { useT } from '@/i18n/useT';
import { useTheme } from '@/ui/theme';

interface Props {
  progress: Progress;
  color?: string;
  testID?: string;
}

export function ProgressDots({ progress, color, testID }: Props): ReactElement {
  const { t } = useT();
  const { colors } = useTheme();
  const fill = color ?? colors.pink;
  const dots = Array.from({ length: progress.need }, (_, i) => i < progress.have);
  const label = t(progress.unit === 'nights' ? 'explain.dots' : 'explain.dotsDays', { have: progress.have, need: progress.need });
  return (
    <View accessible accessibilityLabel={label} testID={testID} style={{ flexDirection: 'row', gap: 4 }}>
      {dots.map((filled, i) => (
        <View
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: filled ? fill : 'transparent',
            borderWidth: filled ? 0 : 1.5,
            borderColor: colors.textFaint,
          }}
        />
      ))}
    </View>
  );
}
