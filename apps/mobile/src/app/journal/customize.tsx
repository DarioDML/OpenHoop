import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';

import { useAppData } from '@/data/context';
import {
  DEFAULT_JOURNAL_QUESTIONS,
  JOURNAL_QUESTIONS,
  CATALOGUE_PREVIEW,
  MAX_ACTIVE_QUESTIONS,
  catalogueGroups,
  withQuestion,
  type JournalCategory,
  type JournalQuestion,
} from '@/data/journalQuestions';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { SearchField } from '@/ui/SearchField';
import { radius, useTheme } from '@/ui/theme';

interface Entry {
  question: JournalQuestion;
  label: string;
}

interface ToggleButtonProps {
  label: string;
  on: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}

function AddRemoveButton({ label, on, disabled, onPress, testID }: ToggleButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? colors.surfaceAlt : colors.primary,
        opacity: disabled ? 0.35 : pressed ? 0.8 : 1,
      })}>
      <Icon name={on ? 'check' : 'plus'} color={on ? colors.positive : colors.primaryOn} size={20} strokeWidth={2} />
    </Pressable>
  );
}

export default function JournalCustomizeScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData, updateUserData } = useAppData();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<JournalCategory>>(() => new Set());
  const selected = userData.journalQuestions ?? [...DEFAULT_JOURNAL_QUESTIONS];
  const full = selected.length >= MAX_ACTIVE_QUESTIONS;
  const entries = useMemo<Entry[]>(() => JOURNAL_QUESTIONS.map((question) => ({ question, label: t(question.nameKey) })), [t]);
  const groups = catalogueGroups(entries, query, selected, expanded);
  const setOpen = (category: JournalCategory, open: boolean): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(category);
      else next.delete(category);
      return next;
    });
  };

  const toggle = (id: string, on: boolean): void => {
    void updateUserData({ journalQuestions: withQuestion(userData.journalQuestions, id, on) });
  };

  return (
    <HealthPage
      title={t('journal.customize.title')}
      tint="coach"
      testID="journal-customize-screen"
      hero={
        <SearchField
          value={query}
          onChangeText={setQuery}
          label={t('journal.customize.searchLabel')}
          placeholder={t('journal.customize.search', { count: JOURNAL_QUESTIONS.length })}
          testID="customize-search"
        />
      }>
      <AppText variant="body" muted>
        {t('journal.customize.intro')}
      </AppText>
      <AppText variant="label" muted numeric testID="customize-count">
        {full ? t('journal.customize.full', { max: MAX_ACTIVE_QUESTIONS }) : t('journal.customize.count', { count: selected.length, max: MAX_ACTIVE_QUESTIONS })}
      </AppText>
      {groups.length === 0 ? (
        <AppText variant="body" muted testID="customize-no-results">
          {t('journal.customize.noResults')}
        </AppText>
      ) : (
        groups.map((group) => (
          <ListGroup key={group.category} title={t(`journal.cat.${group.category}`)}>
            {group.items.map(({ question, label }) => {
              const on = selected.includes(question.id);
              const disabled = !on && full;
              return (
                <ListRow
                  key={question.id}
                  testID={`customize-${question.id}`}
                  title={label}
                  chevron={false}
                  disabled={disabled}
                  onPress={() => toggle(question.id, !on)}
                  right={
                    <AddRemoveButton
                      label={t(on ? 'journal.customize.remove' : 'journal.customize.add', { name: label })}
                      on={on}
                      disabled={disabled}
                      onPress={() => toggle(question.id, !on)}
                      testID={`customize-toggle-${question.id}`}
                    />
                  }
                />
              );
            })}
            {group.hidden > 0 ? (
              <ListRow
                key="more"
                testID={`customize-more-${group.category}`}
                title={t('journal.customize.showAll', { count: group.total })}
                chevron={false}
                onPress={() => setOpen(group.category, true)}
                right={<Icon name="chevronDown" color={colors.textMuted} size={18} />}
              />
            ) : expanded.has(group.category) && query.trim() === '' && group.total > CATALOGUE_PREVIEW ? (
              <ListRow
                key="less"
                testID={`customize-less-${group.category}`}
                title={t('journal.customize.showFewer')}
                chevron={false}
                onPress={() => setOpen(group.category, false)}
              />
            ) : null}
          </ListGroup>
        ))
      )}
      <Button
        label={t('journal.customize.reset')}
        variant="tertiary"
        onPress={() => void updateUserData({ journalQuestions: null })}
        testID="customize-reset"
      />
    </HealthPage>
  );
}
