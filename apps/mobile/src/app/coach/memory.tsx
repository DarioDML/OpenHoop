import type { CoachMemoryNote } from '@openhoop/core';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCoach } from '@/coach/CoachContext';
import { MEMORY_NOTES, MEMORY_NOTE_LENGTH } from '@/coach/controller';
import { MEMORY_CATEGORIES, memoryCategoryOf, memoryKey, withMemoryCategory, withoutMemoryCategories, type MemoryCategory } from '@/coach/prefs';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { ErrorCard } from '@/ui/coach/parts';
import { Button, Field, Toggle } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { radius, spacing, useTheme } from '@/ui/theme';

type AddState = 'idle' | 'invalid' | 'full';

const ALWAYS_SHOWN: readonly MemoryCategory[] = ['goals', 'lifestyle', 'preferences', 'events'];

function validNote(text: string): boolean {
  const trimmed = text.trim();
  return trimmed !== '' && trimmed.length <= MEMORY_NOTE_LENGTH;
}

export default function CoachMemoryScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData, updateUserData } = useAppData();
  const { state, controller } = useCoach();
  const [adding, setAdding] = useState<MemoryCategory | null>(null);
  const [draft, setDraft] = useState('');
  const [addState, setAddState] = useState<AddState>('idle');
  const [editing, setEditing] = useState<{ id: number; text: string; category: MemoryCategory } | null>(null);
  const prefs = userData.coach;
  const memoryOn = prefs.memory;
  const full = state.memory.length >= MEMORY_NOTES;
  const groups = MEMORY_CATEGORIES.map((category) => ({ category, notes: state.memory.filter((note) => memoryCategoryOf(prefs, note) === category) })).filter(
    (group) => ALWAYS_SHOWN.includes(group.category) || group.notes.length > 0,
  );

  const openAdd = (category: MemoryCategory): void => {
    setAdding(category);
    setDraft('');
    setAddState(full ? 'full' : 'idle');
  };

  const add = async (category: MemoryCategory): Promise<void> => {
    if (full) {
      setAddState('full');
      return;
    }
    if (!validNote(draft)) {
      setAddState('invalid');
      return;
    }
    const note = await controller.addMemoryNote(draft);
    if (note === null) return;
    await updateUserData({ coach: withMemoryCategory(prefs, note, category, state.memory) });
    setDraft('');
    setAddState('idle');
    setAdding(null);
  };

  const saveEdit = async (note: CoachMemoryNote): Promise<void> => {
    if (editing === null || !validNote(editing.text)) return;
    if (!(await controller.updateMemory(editing.id, editing.text))) return;
    if (editing.category !== memoryCategoryOf(prefs, note)) await updateUserData({ coach: withMemoryCategory(prefs, note, editing.category, state.memory) });
    setEditing(null);
  };

  const remove = async (note: CoachMemoryNote): Promise<void> => {
    if (!(await controller.deleteMemory(note.id))) return;
    if (prefs.memoryCategories[memoryKey(note)] !== undefined) {
      await updateUserData({ coach: withoutMemoryCategories(prefs, state.memory.filter((other) => other.id !== note.id)) });
    }
  };

  const noteRow = (note: CoachMemoryNote, last: boolean) => {
    const divider = last ? null : { borderBottomWidth: 1, borderBottomColor: colors.border };
    if (editing?.id === note.id) {
      return (
        <View key={note.id} style={[{ gap: spacing.md, paddingVertical: spacing.md }, divider]} testID={`coach-memory-edit-${note.id}`}>
          <Field
            label={t('coach.memory.editLabel')}
            value={editing.text}
            onChangeText={(text) => setEditing({ ...editing, text })}
            error={!validNote(editing.text)}
            hint={validNote(editing.text) ? undefined : t('coach.memory.invalid', { max: MEMORY_NOTE_LENGTH })}
            testID="coach-memory-edit-input"
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {MEMORY_CATEGORIES.map((category) => (
              <Pill
                key={category}
                label={t(`coach.memory.cat.${category}`)}
                selected={editing.category === category}
                onPress={() => setEditing({ ...editing, category })}
                testID={`coach-memory-category-${category}`}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label={t('common.save')} variant="secondary" onPress={() => void saveEdit(note)} style={{ flex: 1 }} testID="coach-memory-edit-save" />
            <Button label={t('common.cancel')} variant="tertiary" onPress={() => setEditing(null)} />
          </View>
        </View>
      );
    }
    return (
      <View key={note.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm }, divider]} testID={`coach-memory-note-${note.id}`}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('coach.memory.editHint')}
          onPress={() => setEditing({ id: note.id, text: note.text, category: memoryCategoryOf(prefs, note) })}
          testID={`coach-memory-edit-button-${note.id}`}
          style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <AppText variant="body" style={{ fontWeight: '500' }}>
            {note.text}
          </AppText>
          <AppText variant="caption" muted>
            {note.source === 'coach' ? t('coach.memory.fromCoach') : t('coach.memory.fromYou')}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('coach.memory.deleteNote')}
          onPress={() => void remove(note)}
          hitSlop={6}
          testID={`coach-memory-delete-${note.id}`}
          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.8 : 1 })}>
          <Icon name="trash" color={colors.textMuted} size={18} />
        </Pressable>
      </View>
    );
  };

  return (
    <HealthPage title={t('coach.memory.title')} tint="coach" testID="coach-memory">
      {state.error === 'storage' ? <ErrorCard message={t('coach.error.storage')} /> : null}
      <ListGroup>
        <ListRow
          title={t('coach.memory.toggle')}
          subtitle={memoryOn ? t('coach.memory.toggleBody') : t('coach.memory.offNote')}
          chevron={false}
          right={<Toggle label={t('coach.memory.toggle')} value={memoryOn} onChange={(value) => void updateUserData({ coach: { ...prefs, memory: value } })} testID="coach-memory-toggle" />}
        />
      </ListGroup>
      <AppText variant="label" muted>
        {t('coach.memory.body')}
      </AppText>
      {state.memory.length === 0 ? (
        <AppText variant="body" muted testID="coach-memory-empty">
          {t('coach.memory.empty')}
        </AppText>
      ) : null}

      {groups.map(({ category, notes }) => (
        <View key={category} style={{ gap: spacing.sm }} testID={`coach-memory-group-${category}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }}>
            <AppText variant="capLarge" muted>
              {t(`coach.memory.cat.${category}`)}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('coach.memory.addTo', { group: t(`coach.memory.cat.${category}`) })}
              onPress={() => openAdd(category)}
              hitSlop={10}
              testID={`coach-memory-add-${category}`}
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText variant="cap" muted>
                {t('coach.memory.addShort')}
              </AppText>
            </Pressable>
          </View>
          {notes.length > 0 || adding === category ? (
            <Card style={{ paddingVertical: spacing.xs, gap: 0 }}>
              {adding === category ? (
                <View style={{ gap: spacing.md, paddingVertical: spacing.md, ...(notes.length > 0 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null) }}>
                  <Field
                    label={t('coach.memory.addLabel')}
                    value={draft}
                    onChangeText={(value) => {
                      setDraft(value);
                      setAddState('idle');
                    }}
                    maxLength={MEMORY_NOTE_LENGTH + 20}
                    autoFocus
                    error={addState !== 'idle'}
                    hint={
                      addState === 'invalid'
                        ? t('coach.memory.invalid', { max: MEMORY_NOTE_LENGTH })
                        : addState === 'full'
                          ? t('coach.memory.full', { max: MEMORY_NOTES })
                          : undefined
                    }
                    testID="coach-memory-input"
                  />
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Button label={t('coach.memory.add')} variant="secondary" onPress={() => void add(category)} style={{ flex: 1 }} testID="coach-memory-add" />
                    <Button label={t('common.cancel')} variant="tertiary" onPress={() => setAdding(null)} testID="coach-memory-add-cancel" />
                  </View>
                </View>
              ) : null}
              {notes.map((note, index) => noteRow(note, index === notes.length - 1))}
            </Card>
          ) : null}
        </View>
      ))}
    </HealthPage>
  );
}
