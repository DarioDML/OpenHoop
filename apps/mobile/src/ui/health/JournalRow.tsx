import { Pressable, View } from 'react-native';

import type { JournalQuestion } from '@/data/journalQuestions';
import type { JournalAnswer } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { radius, spacing, useTheme } from '@/ui/theme';

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
      style={{
        flex: 1,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: selected ? colors.primary : colors.surfaceAlt,
      }}>
      <AppText variant="bodyStrong" color={selected ? colors.primaryOn : colors.textSoft}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface StepProps {
  label: string;
  onPress: () => void;
  disabled: boolean;
  testID: string;
}

function Step({ label, onPress, disabled, testID }: StepProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, opacity: disabled ? 0.4 : 1 }}>
      <AppText variant="title">{label}</AppText>
    </Pressable>
  );
}

interface Props {
  question: JournalQuestion;
  answer: JournalAnswer | undefined;
  onChange: (value: JournalAnswer) => void;
}

export function JournalRow({ question, answer, onChange }: Props) {
  const { t } = useT();
  const isYes = answer === undefined ? null : typeof answer === 'number' ? answer > 0 : answer;
  const count = typeof answer === 'number' ? answer : 0;
  const max = question.max ?? 20;
  const yes = (): void => onChange(question.kind === 'count' ? Math.max(1, count) : true);
  const no = (): void => onChange(question.kind === 'count' ? 0 : false);

  return (
    <Card testID={`journal-q-${question.id}`}>
      <AppText variant="cardTitle">{t(question.labelKey)}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Choice label={t('journal.no')} selected={isYes === false} onPress={no} testID={`journal-${question.id}-no`} />
        <Choice label={t('journal.yes')} selected={isYes === true} onPress={yes} testID={`journal-${question.id}-yes`} />
      </View>
      {question.kind === 'count' && isYes === true ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="label" muted>
            {question.unitKey ? t(question.unitKey) : ''}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <Step label="−" disabled={count <= 1} onPress={() => onChange(Math.max(1, count - 1))} testID={`journal-${question.id}-minus`} />
            <AppText variant="h2" numeric testID={`journal-${question.id}-count`}>
              {count}
            </AppText>
            <Step label="+" disabled={count >= max} onPress={() => onChange(Math.min(max, count + 1))} testID={`journal-${question.id}-plus`} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
