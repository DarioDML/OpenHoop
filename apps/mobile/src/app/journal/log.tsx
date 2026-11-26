import type { JournalNote } from '@openhoop/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { appendDictation } from '@/data/dictation';
import { NOTE_LIMITS, noteLength, searchNotes, validateNoteDraft, type NoteDraft, type NoteField } from '@/data/journalNotes';
import { activeQuestions, findQuestion, type JournalQuestion } from '@/data/journalQuestions';
import { parseIsoDate } from '@/lib/dates';
import { todayIso } from '@/lib/format';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { JournalNoteCard } from '@/ui/health/JournalNoteCard';
import { NoteDictation } from '@/ui/health/NoteDictation';
import { Section } from '@/ui/Section';
import { radius, spacing, useTheme } from '@/ui/theme';

function startDay(param: string | undefined, today: string): string {
  return param !== undefined && parseIsoDate(param) !== null && param <= today ? param : today;
}

export default function JournalLogScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData, journalNotes, saveJournalNote, removeJournalNote } = useAppData();
  const params = useLocalSearchParams<{ day?: string }>();
  const today = todayIso(new Date(Date.now()));
  const [draft, setDraft] = useState<NoteDraft>(() => ({ day: startDay(params.day, today), text: '', tags: [] }));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [invalid, setInvalid] = useState<NoteField[]>([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const questions = useMemo<JournalQuestion[]>(() => {
    const active = activeQuestions(userData.journalQuestions);
    const extra = draft.tags.flatMap((tag) => {
      const question = findQuestion(tag);
      return question && !active.some((q) => q.id === question.id) ? [question] : [];
    });
    return [...active, ...extra];
  }, [userData.journalQuestions, draft.tags]);

  const shown = useMemo(() => searchNotes(journalNotes, query), [journalNotes, query]);
  const has = (field: NoteField): boolean => invalid.includes(field);
  const length = noteLength(draft.text);

  const patchDraft = (change: Partial<NoteDraft>): void => {
    setDraft((current) => ({ ...current, ...change }));
    setInvalid([]);
  };

  const toggleTag = (id: string): void => {
    patchDraft({ tags: draft.tags.includes(id) ? draft.tags.filter((tag) => tag !== id) : [...draft.tags, id] });
  };

  const appendText = (transcript: string): void => {
    setDraft((current) => ({ ...current, text: appendDictation(current.text, transcript) }));
    setInvalid([]);
  };

  const reset = (): void => {
    setDraft({ day: startDay(params.day, today), text: '', tags: [] });
    setEditingId(null);
    setInvalid([]);
  };

  const submit = async (): Promise<void> => {
    const result = validateNoteDraft(draft, todayIso(new Date(Date.now())));
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    setSaving(true);
    const saved = await saveJournalNote(editingId, result.value);
    setSaving(false);
    if (saved) reset();
  };

  const startEdit = (note: JournalNote): void => {
    setEditingId(note.id);
    setConfirmId(null);
    setInvalid([]);
    setDraft({ day: note.day, text: note.body, tags: note.tags });
  };

  const remove = async (id: number): Promise<void> => {
    setConfirmId(null);
    if ((await removeJournalNote(id)) && editingId === id) reset();
  };

  return (
    <HealthPage
      title={t('journal.log.title')}
      testID="journal-log"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('journal.log.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('journal.log.body')}
          </AppText>
        </View>
      }>
      <Card testID="note-form">
        <AppText variant="capLarge" muted>
          {editingId === null ? t('journal.log.addTitle') : t('journal.log.editTitle')}
        </AppText>
        <Field
          label={t('journal.log.day')}
          hint={t('journal.log.dayHint')}
          error={has('day')}
          value={draft.day}
          onChangeText={(day) => patchDraft({ day })}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="YYYY-MM-DD"
          testID="note-input-day"
        />
        <Field
          label={t('journal.log.text')}
          hint={t('journal.log.textHint', { count: length, max: NOTE_LIMITS.maxChars })}
          error={has('text')}
          value={draft.text}
          onChangeText={(text) => patchDraft({ text })}
          placeholder={t('journal.log.placeholder')}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 120, paddingTop: 14, paddingBottom: 14 }}
          testID="note-input-text"
        />
        <NoteDictation onText={appendText} />
        <View style={{ gap: spacing.sm }}>
          <AppText variant="capSmall" muted>
            {t('journal.log.tags')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID="note-tags">
            {questions.map((question) => {
              const selected = draft.tags.includes(question.id);
              return (
                <Pressable
                  key={question.id}
                  testID={`note-tag-${question.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => toggleTag(question.id)}
                  style={{
                    minHeight: 36,
                    paddingHorizontal: spacing.md,
                    justifyContent: 'center',
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: selected ? colors.accent : colors.border,
                    backgroundColor: selected ? colors.accentSoft : 'transparent',
                  }}>
                  <AppText variant="label" color={selected ? colors.text : colors.textMuted}>
                    {t(question.labelKey)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {has('tags') ? (
            <AppText variant="caption" color={colors.negative}>
              {t('journal.log.tagsError', { max: NOTE_LIMITS.maxTags })}
            </AppText>
          ) : null}
        </View>
        <AppText variant="caption" muted>
          {t('journal.log.privacy')}
        </AppText>
        <Button label={editingId === null ? t('journal.log.save') : t('journal.log.saveEdit')} onPress={() => void submit()} disabled={saving} testID="note-save" />
        {editingId !== null ? <Button label={t('common.cancel')} variant="tertiary" onPress={reset} testID="note-cancel" /> : null}
      </Card>

      <Section title={t('journal.log.listTitle')}>
        <Field
          label={t('journal.log.search')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('journal.log.searchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={NOTE_LIMITS.maxQuery}
          returnKeyType="search"
          testID="note-search"
        />
        {journalNotes.length === 0 ? (
          <AppText variant="body" muted testID="notes-empty">
            {t('journal.log.empty')}
          </AppText>
        ) : shown.length === 0 ? (
          <AppText variant="body" muted testID="notes-no-results">
            {t('journal.log.noResults')}
          </AppText>
        ) : (
          shown.map((note) => (
            <JournalNoteCard key={note.id} note={note}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
                {confirmId === note.id ? (
                  <>
                    <Button label={t('journal.log.confirmDelete')} variant="danger" onPress={() => void remove(note.id)} testID={`note-confirm-${note.id}`} />
                    <Button label={t('journal.log.keep')} variant="tertiary" onPress={() => setConfirmId(null)} testID={`note-keep-${note.id}`} />
                  </>
                ) : (
                  <>
                    <Button label={t('common.edit')} variant="tertiary" onPress={() => startEdit(note)} testID={`note-edit-${note.id}`} />
                    <Button label={t('common.delete')} variant="tertiary" onPress={() => setConfirmId(note.id)} testID={`note-delete-${note.id}`} />
                  </>
                )}
              </View>
            </JournalNoteCard>
          ))
        )}
      </Section>
    </HealthPage>
  );
}
