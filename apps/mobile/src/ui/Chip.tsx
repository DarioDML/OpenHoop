import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { radius, useTheme, type ColorTokens } from './theme';

export type ChipTone = 'positive' | 'warning' | 'negative' | 'info' | 'neutral' | 'purple' | 'pink' | 'gold';

function toneColors(colors: ColorTokens, tone: ChipTone): { fg: string; bg: string } {
  switch (tone) {
    case 'positive':
      return { fg: colors.positive, bg: colors.positiveSoft };
    case 'warning':
      return { fg: colors.warning, bg: colors.warningSoft };
    case 'negative':
      return { fg: colors.negative, bg: colors.negativeSoft };
    case 'info':
      return { fg: colors.info, bg: colors.infoSoft };
    case 'purple':
      return { fg: colors.levelC, bg: colors.purpleSoft };
    case 'pink':
      return { fg: colors.pink, bg: colors.pinkSoft };
    case 'gold':
      return { fg: colors.gold, bg: colors.goldSoft };
    default:
      return { fg: colors.textMuted, bg: colors.surfaceAlt };
  }
}

interface Props {
  label: string;
  tone?: ChipTone;
  small?: boolean;
  testID?: string;
}

export function Chip({ label, tone = 'neutral', small = false, testID }: Props) {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  return (
    <View
      testID={testID}
      style={{ alignSelf: 'flex-start', paddingHorizontal: small ? 7 : 9, paddingVertical: small ? 2 : 4, borderRadius: radius.pill, backgroundColor: bg }}>
      <AppText variant={small ? 'capSmall' : 'caption'} color={fg} style={small ? { fontSize: 10, lineHeight: 13 } : { fontWeight: '600' }}>
        {label}
      </AppText>
    </View>
  );
}

interface PillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'button' | 'tab';
  testID?: string;
}

const PILL_HIT_SLOP = { top: 4, bottom: 4, left: 2, right: 2 } as const;

export function Pill({ label, selected, onPress, role = 'button', testID }: PillProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityState={{ selected }}
      hitSlop={PILL_HIT_SLOP}
      onPress={onPress}
      style={{
        height: 36,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        justifyContent: 'center',
        backgroundColor: selected ? colors.primary : colors.surfaceAlt,
      }}>
      <AppText variant="label" color={selected ? colors.primaryOn : colors.textSoft} style={{ fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface CheckChipProps {
  label: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  testID?: string;
}

export function CheckChip({ label, checked, onToggle, testID }: CheckChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onToggle(!checked)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: checked ? colors.positive : colors.borderStrong,
        backgroundColor: checked ? colors.surface : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}>
      {checked ? <Icon name="check" size={16} color={colors.positive} strokeWidth={2.25} /> : null}
      <AppText variant="body" color={checked ? colors.text : colors.textMuted} style={{ fontWeight: '500' }}>
        {label}
      </AppText>
    </Pressable>
  );
}
