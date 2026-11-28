import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import type { AimRange } from '@/data/readinessDerived';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Num } from '@/ui/Num';
import { Ring } from '@/ui/Ring';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Props {
  aim: AimRange | null;
  hidden?: boolean;
  load: number | null;
  testID?: string;
}

export function LoadTargetCard({ aim, hidden = false, load, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const { t, language } = useT();
  const low = aim === null ? null : formatNumber(aim.low, 1, language);
  const high = aim === null ? null : formatNumber(aim.high, 1, language);
  const fraction = aim === null || load === null || aim.high <= 0 ? null : load / aim.high;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={low === null || high === null ? `${t('readinessScreen.target.title')}. ${hidden ? t('loadTarget.hidden.pill') : t('readinessScreen.target.calibrating')}` : t('readinessScreen.target.a11y', { low, high })}
      onPress={() => router.push('/load/target')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: colors.tint.load,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Ring size={40} strokeWidth={5} fraction={fraction} color={colors.metric.loadBright} trackColor={colors.accentSoft} />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="capSmall" color={colors.info}>
          {t('readinessScreen.target.title')}
        </AppText>
        {low === null || high === null ? (
          <AppText variant="label" soft testID={testID === undefined ? undefined : hidden ? `${testID}-hidden` : `${testID}-calibrating`}>
            {hidden ? t('loadTarget.hidden.pill') : t('readinessScreen.target.calibrating')}
          </AppText>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <AppText variant="body">{t('readinessScreen.target.aim')}</AppText>
            <Num size={24} testID={testID === undefined ? undefined : `${testID}-range`}>{`${low}–${high}`}</Num>
          </View>
        )}
      </View>
      <AppText variant="title" color={colors.info}>
        ›
      </AppText>
    </Pressable>
  );
}
