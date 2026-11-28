import { Pressable, View } from 'react-native';

import type { JournalQuestion } from '@/data/journalQuestions';
import type { JournalAnswer } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Icon } from '@/ui/Icon';
import { Num } from '@/ui/Num';
import { radius, spacing, useTheme } from '@/ui/theme';

import { questionIcon, questionText } from './journalLabels';

interface ChoiceProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}

function Choice({ label, selected, onPress, testID }: ChoiceProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: 40,
        minWidth: 52,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.primary : colors.surfaceAlt,
        opacity: pressed ? 0.8 : 1,
      })}>
      <AppText variant="bodyStrong" color={selected ? colors.primaryOn : colors.textMuted} style={{ fontSize: 14 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface StepProps {
  label: string;
  glyph: string;
  onPress: () => void;
  disabled: boolean;
  testID: string;
}

function Step({ label, glyph, onPress, disabled, testID }: StepProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={{ width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface3, opacity: disabled ? 0.4 : 1 }}>
      <AppText variant="cardTitle">{glyph}</AppText>
    </Pressable>
  );
}

interface Props {
  question: JournalQuestion;
  answer: JournalAnswer | undefined;
  onChange: (value: JournalAnswer) => void;
  last?: boolean;
}

export function JournalRow({ question, answer, onChange, last = false }: Props) {
  const { t } = useT();
  const { colors } = useTheme();
  const isYes = answer === undefined ? null : typeof answer === 'number' ? answer > 0 : answer;
  const count = typeof answer === 'number' ? answer : 0;
  const max = question.max ?? 20;
  const label = questionText(t, question);
  const icon = questionIcon(question);
  const yes = (): void => onChange(question.kind === 'count' ? Math.max(1, count) : true);
  const no = (): void => onChange(question.kind === 'count' ? 0 : false);
  const showCount = question.kind === 'count' && isYes === true;
  const divider = { borderBottomWidth: 1, borderBottomColor: colors.border };

  return (
    <View testID={`journal-q-${question.id}`}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 64 }, last && !showCount ? null : divider]}>
        <Icon name={icon} color={colors.purple} size={22} />
        <AppText variant="body" style={{ flex: 1, minWidth: 0 }}>
          {label}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 6, flexShrink: 0 }}>
          <Choice label={t('journal.no')} selected={isYes === false} onPress={no} testID={`journal-${question.id}-no`} />
          <Choice label={t('journal.yes')} selected={isYes === true} onPress={yes} testID={`journal-${question.id}-yes`} />
        </View>
      </View>
      {showCount ? (
        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 64 }, last ? null : divider]}>
          <Icon name={icon} color={colors.purple} size={22} />
          <AppText variant="body" style={{ flex: 1, minWidth: 0 }}>
            {question.unitKey ? t(question.unitKey) : ''}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, flexShrink: 0 }}>
            <Step label={t('journal.less')} glyph="−" disabled={count <= 1} onPress={() => onChange(Math.max(1, count - 1))} testID={`journal-${question.id}-minus`} />
            <View style={{ width: 40, alignItems: 'center' }}>
              <Num size={20} testID={`journal-${question.id}-count`} maxFontSizeMultiplier={1.2}>
                {count}
              </Num>
            </View>
            <Step label={t('journal.more')} glyph="+" disabled={count >= max} onPress={() => onChange(Math.min(max, count + 1))} testID={`journal-${question.id}-plus`} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
