import { View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './controls';
import { Icon, type IconName } from './Icon';
import { GradientFill } from './Screen';
import { radius, spacing, useTheme } from './theme';

export type StateTone = 'warning' | 'info' | 'negative' | 'positive' | 'pink' | 'neutral' | 'purple';

interface Props {
  icon: IconName;
  tone: StateTone;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  framed?: boolean;
  variant?: 'card' | 'board';
  testID?: string;
}

export function StateCard({ icon, tone, title, body, actionLabel, onAction, framed = true, variant = 'card', testID }: Props) {
  const { colors } = useTheme();
  const palette: Record<StateTone, { fg: string; bg: string }> = {
    warning: { fg: colors.warning, bg: colors.warningSoft },
    info: { fg: colors.link, bg: colors.infoSoft },
    negative: { fg: colors.negative, bg: colors.negativeSoft },
    positive: { fg: colors.positive, bg: colors.positiveSoft },
    pink: { fg: colors.pink, bg: colors.pinkSoft },
    purple: { fg: colors.purple, bg: colors.purpleSoft },
    neutral: { fg: colors.textMuted, bg: colors.surfaceAlt },
  };
  const { fg, bg } = palette[tone];
  if (variant === 'board') {
    return (
      <View
        testID={testID}
        style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', minHeight: 260, padding: spacing.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
        <GradientFill id={`state-${(testID ?? icon).replace(/[^a-zA-Z0-9-]/g, '')}`} from={colors.backgroundTop} to={colors.background} />
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} color={fg} size={28} />
        </View>
        <AppText variant="bodyStrong" style={{ textAlign: 'center', fontSize: 16 }}>
          {title}
        </AppText>
        <AppText variant="label" muted style={{ textAlign: 'center' }}>
          {body}
        </AppText>
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} compact style={{ alignSelf: 'stretch' }} /> : null}
      </View>
    );
  }
  return (
    <View
      testID={testID}
      style={{
        borderRadius: radius.lg,
        borderWidth: framed ? 1 : 0,
        borderColor: colors.border,
        backgroundColor: framed ? colors.surface : 'transparent',
        padding: spacing.xl,
        alignItems: 'center',
        gap: 14,
      }}>
      <View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={fg} size={36} />
      </View>
      <AppText variant="cardTitle" style={{ fontSize: 18, textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText variant="body" muted style={{ textAlign: 'center', fontSize: 14 }}>
        {body}
      </AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={{ alignSelf: 'stretch' }} /> : null}
    </View>
  );
}
