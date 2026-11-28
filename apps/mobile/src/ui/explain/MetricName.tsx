import type { ReactElement } from 'react';
import { Pressable } from 'react-native';

import { TERMS } from '@/data/terms';
import { useT } from '@/i18n/useT';
import { WordFitText } from '@/ui/AppText';
import { Icon } from '@/ui/Icon';
import { spacing, useTheme, type TypeVariant } from '@/ui/theme';

import { useExplain, type ExplainTarget } from './ExplainProvider';

interface Props {
  target: ExplainTarget;
  label?: string;
  variant?: TypeVariant;
  muted?: boolean;
  icon?: boolean;
  numberOfLines?: number;
  testID?: string;
}

export function MetricName({ target, label, variant = 'capSmall', muted = true, icon = true, numberOfLines = 2, testID }: Props): ReactElement {
  const { t } = useT();
  const { colors } = useTheme();
  const explain = useExplain();
  const name = label ?? t(TERMS[target.term].name);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('explain.whatIs', { name })}
      onPress={() => explain.about(target)}
      testID={testID}
      style={{ minHeight: 44, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <WordFitText variant={variant} muted={muted} numberOfLines={numberOfLines} style={{ flexShrink: 1 }}>
        {name}
      </WordFitText>
      {icon ? <Icon name="info" size={15} color={colors.textMuted} /> : null}
    </Pressable>
  );
}
