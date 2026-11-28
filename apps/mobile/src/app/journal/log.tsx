import type { JournalNote } from '@openhoop/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useAppData } from '@/data/context';
import { addDays } from '@/data/derived';
import { appendDictation } from '@/data/dictation';
import { NOTE_LIMITS, noteLength, searchNotes, validateNoteDraft, type NoteDraft, type NoteField } from '@/data/journalNotes';
import { activeQuestions, findQuestion, type JournalQuestion } from '@/data/journalQuestions';
import { detectBehaviours, detectionAnswers, initialSelection, type Detection } from '@/data/voiceLog';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { parseIsoDate } from '@/lib/dates';
import { formatShortDay, todayIso } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { JournalNoteCard } from '@/ui/health/JournalNoteCard';
import { NoteDictation } from '@/ui/health/NoteDictation';
import { useDictation } from '@/ui/health/useDictation';
import { VoiceMic } from '@/ui/health/VoiceMic';
import { Icon } from '@/ui/Icon';
import { CapHeader } from '@/ui/ListGroup';
import { Section } from '@/ui/Section';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';

const MAX_TRANSCRIPT = 2000;

function startDay(param: string | undefined, today: string): string {
  return param !== undefined && parseIsoDate(param) !== null && param <= today ? param : today;
}

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function detailText(t: TFunction, detection: Detection): string | null {
  const detail = detection.detail;
  if (detail === null) return null;
  switch (detail.kind) {
    case 'count':
      return String(detail.value);
    case 'time':
      return clock(detail.minutes);
    case 'duration':
      return t('journal.voice.minutes', { minutes: detail.minutes });
    case 'no':
      return t('journal.no');
  }
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}

function DetectionChip({ label, selected, onPress, testID }: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 40,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.purple : colors.borderStrong,
        backgroundColor: selected ? colors.border : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.8 : 1,
      })}>
      {selected ? <Icon name="check" color={colors.purple} size={16} strokeWidth={2.25} /> : null}
      <AppText variant="body" color={selected ? colors.text : colors.textMuted} style={{ fontWeight: '500' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function JournalLogScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { userData, journalNotes, saveJournalNote, removeJournalNote, updateUserData } = useAppData();
  const params = useLocalSearchParams<{ day?: string }>();
  const today = todayIso(new Date(Date.now()));
  const voiceDay = startDay(params.day, today);
  const [draft, setDraft] = useState<NoteDraft>(() => ({ day: voiceDay, text: '', tags: [] }));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [invalid, setInvalid] = useState<NoteField[]>([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [dictationSession, setDictationSession] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [overrides, setOverrides] = useState<Readonly<Record<string, boolean>>>({});
  const [voiceResult, setVoiceResult] = useState<{ kind: 'saved'; count: number } | { kind: 'failed' } | null>(null);
  const [voiceSaving, setVoiceSaving] = useState(false);

  const activeIds = useMemo(() => activeQuestions(userData.journalQuestions).map((q) => q.id), [userData.journalQuestions]);
  const detections = useMemo(() => detectBehaviours(transcript, language), [transcript, language]);
  const selected = useMemo(() => {
    const initial = initialSelection(detections, activeIds);
    return new Set(detections.filter((d) => overrides[d.questionId] ?? initial.has(d.questionId)).map((d) => d.questionId));
  }, [detections, activeIds, overrides]);
  const chosen = detections.filter((d) => selected.has(d.questionId));

  const mic = useDictation(
    language,
    (words) => {
      setVoiceResult(null);
      setTranscript((current) => appendDictation(current, words).slice(0, MAX_TRANSCRIPT));
    },
    0,
  );

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
  const voiceDayLabel = voiceDay === today ? t('common.today') : voiceDay === addDays(today, -1) ? t('common.yesterday') : formatShortDay(voiceDay, language);

  const toggleDetection = (id: string): void => {
    setOverrides((current) => ({ ...current, [id]: !selected.has(id) }));
    setVoiceResult(null);
  };

  const editTranscript = (text: string): void => {
    setTranscript(text.slice(0, MAX_TRANSCRIPT));
    if (text.trim() === '') setOverrides({});
    setVoiceResult(null);
  };

  const confirmVoice = async (): Promise<void> => {
    const answers = detectionAnswers(detections, selected);
    const count = Object.keys(answers).length;
    if (count === 0) return;
    setVoiceSaving(true);
    const ok = await updateUserData({ journal: { ...userData.journal, [voiceDay]: { ...(userData.journal[voiceDay] ?? {}), ...answers } } });
    setVoiceSaving(false);
    setVoiceResult(ok === false ? { kind: 'failed' } : { kind: 'saved', count });
  };

  const patchDraft = (change: Partial<NoteDraft>): void => {
    setDraft((current) => ({ ...current, ...change }));
    setInvalid([]);
  };

  const toggleTag = (id: string): void => {
    patchDraft({ tags: draft.tags.includes(id) ? draft.tags.filter((tag) => tag !== id) : [...draft.tags, id] });
  };

  const appendText = (words: string): void => {
    setDraft((current) => ({ ...current, text: appendDictation(current.text, words) }));
    setInvalid([]);
  };

  const endDictation = (): void => setDictationSession((session) => session + 1);

  const reset = (): void => {
    endDictation();
    setDraft({ day: voiceDay, text: '', tags: [] });
    setEditingId(null);
    setInvalid([]);
  };

  const submit = async (): Promise<void> => {
    const result = validateNoteDraft(draft, todayIso(new Date(Date.now())));
    if (!result.ok) {
      setInvalid(result.invalid);
      return;
    }
    endDictation();
    setSaving(true);
    const saved = await saveJournalNote(editingId, result.value);
    setSaving(false);
    if (saved) reset();
  };

  const startEdit = (note: JournalNote): void => {
    endDictation();
    setEditingId(note.id);
    setConfirmId(null);
    setInvalid([]);
    setDraft({ day: note.day, text: note.body, tags: note.tags });
  };

  const remove = async (id: number): Promise<void> => {
    setConfirmId(null);
    if ((await removeJournalNote(id)) && editingId === id) reset();
  };

  const keepAsNote = (): void => {
    setDraft((current) => ({ ...current, day: voiceDay, text: appendDictation(current.text, transcript).slice(0, NOTE_LIMITS.maxChars) }));
    setInvalid([]);
  };

  return (
    <HealthPage title={t('journal.voice.title')} tint="coach" testID="journal-log" hero={<VoiceMic dictation={mic} />}>
      <Card style={{ gap: spacing.sm }} testID="voice-transcript-card">
        <AppText variant="capSmall" muted>
          {t('journal.voice.transcriptLabel')}
        </AppText>
        <TextInput
          testID="voice-transcript"
          accessibilityLabel={t('journal.voice.transcriptLabel')}
          value={transcript}
          onChangeText={editTranscript}
          placeholder={t('journal.voice.transcriptPlaceholder')}
          placeholderTextColor={colors.textFaint}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 96, color: colors.text, fontSize: 17, lineHeight: 25, fontFamily: fonts.regular, padding: 0 }}
        />
      </Card>

      {transcript.trim() !== '' ? (
        <View style={{ gap: spacing.md }} testID="voice-found">
          <CapHeader title={t('journal.voice.found')} />
          {detections.length === 0 ? (
            <AppText variant="body" muted testID="voice-found-none">
              {t('journal.voice.foundNone')}
            </AppText>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {detections.map((detection) => {
                const question = findQuestion(detection.questionId);
                if (question === undefined) return null;
                const name = t(question.nameKey);
                const detail = detailText(t, detection);
                return (
                  <DetectionChip
                    key={detection.questionId}
                    label={detail === null ? name : `${name} · ${detail}`}
                    selected={selected.has(detection.questionId)}
                    onPress={() => toggleDetection(detection.questionId)}
                    testID={`voice-chip-${detection.questionId}`}
                  />
                );
              })}
            </View>
          )}
          <AppText variant="label" muted>
            {t('journal.voice.confirmHint', { day: voiceDayLabel })}
          </AppText>
          <Button
            label={chosen.length === 1 ? t('journal.voice.confirmOne') : t('journal.voice.confirm', { count: chosen.length })}
            onPress={() => void confirmVoice()}
            disabled={chosen.length === 0 || voiceSaving}
            testID="voice-confirm"
          />
          {voiceResult !== null ? (
            <AppText
              variant="label"
              color={voiceResult.kind === 'saved' ? colors.positive : colors.negative}
              accessibilityLiveRegion="polite"
              testID={voiceResult.kind === 'saved' ? 'voice-saved' : 'voice-save-failed'}>
              {voiceResult.kind === 'saved' ? t('journal.voice.saved', { count: voiceResult.count, day: voiceDayLabel }) : t('journal.voice.saveFailed')}
            </AppText>
          ) : null}
          <Button label={t('journal.voice.useAsNote')} variant="tertiary" onPress={keepAsNote} testID="voice-to-note" />
        </View>
      ) : null}

      <Section title={t('journal.log.heading')}>
        <AppText variant="body" muted>
          {t('journal.log.body')}
        </AppText>
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
          <NoteDictation onText={appendText} sessionKey={dictationSession} />
          <View style={{ gap: spacing.sm }}>
            <AppText variant="capSmall" muted>
              {t('journal.log.tags')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID="note-tags">
              {questions.map((question) => {
                const isOn = draft.tags.includes(question.id);
                return (
                  <Pressable
                    key={question.id}
                    testID={`note-tag-${question.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isOn }}
                    onPress={() => toggleTag(question.id)}
                    style={{
                      minHeight: 36,
                      paddingHorizontal: spacing.md,
                      justifyContent: 'center',
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: isOn ? colors.accent : colors.border,
                      backgroundColor: isOn ? colors.accentSoft : 'transparent',
                    }}>
                    <AppText variant="label" color={isOn ? colors.text : colors.textMuted}>
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
      </Section>

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
