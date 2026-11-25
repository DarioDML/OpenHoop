import { View } from 'react-native';

import { formatSigned } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { spacing, useTheme } from './theme';

interface Props {
  label: string;
  value: number;
  scale: number;
}

export function SignedBar({ label, value, scale }: Props) {
  const { colors } = useTheme();
  const { language, t } = useT();
  const fraction = Math.min(1, Math.abs(value) / scale);
  const color = value >= 0 ? colors.positive : colors.negative;
  const text = formatSigned(value, 1, language);

  return (
    <View accessible accessibilityLabel={`${label}: ${t('readiness.points', { value: text })}`} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="bodyStrong" numeric color={color}>
          {text}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', height: 12, alignItems: 'center' }}>
        <View style={{ flex: 1, height: 12, flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: colors.surfaceAlt, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }}>
          {value < 0 ? <View style={{ width: `${fraction * 100}%`, backgroundColor: color, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} /> : null}
        </View>
        <View style={{ width: 2, height: 20, backgroundColor: colors.textMuted, marginHorizontal: spacing.xs / 2 }} />
        <View style={{ flex: 1, height: 12, flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderTopRightRadius: 6, borderBottomRightRadius: 6 }}>
          {value > 0 ? <View style={{ width: `${fraction * 100}%`, backgroundColor: color, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} /> : null}
        </View>
      </View>
    </View>
  );
}
