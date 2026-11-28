import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import type { MissingExplanation } from '@/data/explainMissing';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Sheet';
import { spacing, useTheme, type ColorTokens } from '@/ui/theme';

import type { ExplainTarget } from './ExplainProvider';
import { ProgressDots } from './ProgressDots';
import { whyText, type WhyTone } from './whyText';

interface Props {
  target: ExplainTarget;
  missing: MissingExplanation;
  onClose: () => void;
  onAbout: (target: ExplainTarget) => void;
}

function toneColors(colors: ColorTokens, tone: WhyTone): { fg: string; bg: string } {
  switch (tone) {
    case 'positive':
      return { fg: colors.positive, bg: colors.positiveSoft };
    case 'pink':
      return { fg: colors.pink, bg: colors.pinkSoft };
    case 'info':
      return { fg: colors.info, bg: colors.infoSoft };
    case 'warning':
      return { fg: colors.warning, bg: colors.warningSoft };
    case 'neutral':
      return { fg: colors.textSoft, bg: colors.surfaceAlt };
  }
}

export function WhySheet({ target, missing, onClose, onAbout }: Props): ReactElement {
  const { t, language } = useT();
  const { colors } = useTheme();
  const text = whyText(t, language, missing);
  return (
    <Sheet visible onClose={onClose} title={text.title} subtitle={text.subtitle} testID="why-sheet">
      {text.rows.map((row) => {
        const tone = toneColors(colors, row.tone);
        return (
          <View key={row.id} style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={row.icon} size={20} color={tone.fg} />
            </View>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="cardTitle">{row.title}</AppText>
              {row.body === null ? null : (
                <AppText variant="body" muted>
                  {row.body}
                </AppText>
              )}
              {row.dots === null ? null : <ProgressDots progress={row.dots} />}
              {row.bar === null ? null : (
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(row.bar * 100)}%`, height: 6, backgroundColor: colors.info }} />
                </View>
              )}
            </View>
          </View>
        );
      })}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg }}>
        <AppText variant="body" muted>
          {text.footer}
        </AppText>
      </View>
      {text.profileLink ? (
        <Button
          label={t('calories.completeProfile')}
          onPress={() => {
            onClose();
            router.push('/profile/edit');
          }}
          testID="why-profile"
        />
      ) : null}
      <Pressable accessibilityRole="link" onPress={() => onAbout(target)} testID="why-about" style={{ minHeight: 44, justifyContent: 'center' }}>
        <AppText variant="cap" muted>
          {text.aboutLink}
        </AppText>
      </Pressable>
    </Sheet>
  );
}
