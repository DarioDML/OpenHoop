import { View } from 'react-native';

import type { ActivityType } from '@/data/activityDerived';

import { Icon, type IconName } from '../Icon';
import { useTheme } from '../theme';

const ACTIVITY_ICONS: Readonly<Record<ActivityType, IconName>> = {
  running: 'run',
  walking: 'walk',
  cycling: 'bike',
  swimming: 'swim',
  strength: 'dumbbell',
  yoga: 'yoga',
  hiit: 'load',
  football: 'community',
  padel: 'target',
  pilates: 'heart',
  hiking: 'mountain',
  other: 'plus',
};

export function activityIcon(type: ActivityType | null): IconName {
  return type === null ? 'pulse' : ACTIVITY_ICONS[type];
}

interface Props {
  type: ActivityType | null;
  size: number;
  testID?: string;
}

export function ActivityGlyph({ type, size, testID }: Props) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.29), backgroundColor: colors.tint.load, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={activityIcon(type)} color={colors.accent} size={Math.round(size * 0.42)} strokeWidth={2} />
    </View>
  );
}
